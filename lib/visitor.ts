import { getChatGPTUser } from "../app/chatgpt-auth";
import { env } from "cloudflare:workers";
import { getSupabaseUser } from "./supabase-auth";

export type Visitor = { id: string; name: string; email?: string };
const visitorCookiePattern = /^visitor-[a-f0-9]{32}$/;

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function visitorCookie(visitor: Visitor) {
  return visitorCookiePattern.test(visitor.id)
    ? `yida_visitor=${encodeURIComponent(visitor.id)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    : null;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getVisitor(request: Request): Promise<Visitor> {
  const externalUser = await getSupabaseUser(request);
  if (externalUser) {
    const database = (env as unknown as { DB?: D1Database }).DB;
    const fallbackId = `supabase-${externalUser.id}`;
    if (!database) return { id: fallbackId, name: externalUser.name, email: externalUser.email };
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS external_identity_links (
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        data_user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY(provider, provider_user_id)
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_external_identity_email ON external_identity_links(email)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_external_identity_data_user ON external_identity_links(data_user_id)"),
    ]);
    const linked = await database.prepare("SELECT data_user_id FROM external_identity_links WHERE provider = ? AND provider_user_id = ?")
      .bind("supabase", externalUser.id).first<{ data_user_id: string }>();
    if (linked?.data_user_id) {
      await database.prepare("UPDATE external_identity_links SET email = ?, last_seen_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_user_id = ?")
        .bind(externalUser.email, "supabase", externalUser.id).run();
      return { id: linked.data_user_id, name: externalUser.name, email: externalUser.email };
    }

    let dataUserId = fallbackId;
    if (externalUser.emailConfirmed) {
      const oldAccount = await database.prepare("SELECT data_user_id FROM account_links WHERE lower(email) = lower(?) ORDER BY last_seen_at DESC LIMIT 1")
        .bind(externalUser.email).first<{ data_user_id: string }>();
      if (oldAccount?.data_user_id) dataUserId = oldAccount.data_user_id;
    }
    const anonymousId = cookieValue(request, "yida_visitor");
    if (dataUserId === fallbackId && anonymousId && visitorCookiePattern.test(anonymousId)) {
      const anonymousData = await database.prepare("SELECT user_id FROM profiles WHERE user_id = ?").bind(anonymousId).first<{ user_id: string }>();
      if (anonymousData?.user_id) dataUserId = anonymousData.user_id;
    }
    await database.prepare("INSERT INTO external_identity_links (provider, provider_user_id, data_user_id, email) VALUES (?, ?, ?, ?)")
      .bind("supabase", externalUser.id, dataUserId, externalUser.email).run();
    return { id: dataUserId, name: externalUser.name, email: externalUser.email };
  }

  const user = await getChatGPTUser();
  if (user) {
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) return { id: user.userId, name: user.fullName ?? user.email, email: user.email };
    await database.prepare(`CREATE TABLE IF NOT EXISTS account_links (
      auth_user_id TEXT PRIMARY KEY NOT NULL,
      data_user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`).run();
    const linked = await database.prepare("SELECT data_user_id FROM account_links WHERE auth_user_id = ?").bind(user.userId).first<{ data_user_id: string }>();
    if (linked?.data_user_id) {
      await database.prepare("UPDATE account_links SET email = ?, last_seen_at = CURRENT_TIMESTAMP WHERE auth_user_id = ?").bind(user.email, user.userId).run();
      return { id: linked.data_user_id, name: user.fullName ?? user.email, email: user.email };
    }

    let dataUserId = user.userId;
    let existingAccountData: { user_id: string } | null = null;
    try {
      existingAccountData = await database.prepare("SELECT user_id FROM profiles WHERE user_id = ?").bind(user.userId).first<{ user_id: string }>();
    } catch {
      existingAccountData = null;
    }
    const anonymousId = cookieValue(request, "yida_visitor");
    if (!existingAccountData && anonymousId && visitorCookiePattern.test(anonymousId)) {
      let anonymousData: { user_id: string } | null = null;
      try {
        anonymousData = await database.prepare("SELECT user_id FROM profiles WHERE user_id = ?").bind(anonymousId).first<{ user_id: string }>();
      } catch {
        anonymousData = null;
      }
      if (anonymousData) dataUserId = anonymousId;
    }
    try {
      await database.prepare("INSERT INTO account_links (auth_user_id, data_user_id, email) VALUES (?, ?, ?)").bind(user.userId, dataUserId, user.email).run();
    } catch {
      dataUserId = user.userId;
      await database.prepare("INSERT OR IGNORE INTO account_links (auth_user_id, data_user_id, email) VALUES (?, ?, ?)").bind(user.userId, dataUserId, user.email).run();
    }
    return { id: dataUserId, name: user.fullName ?? user.email, email: user.email };
  }

  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return { id: "local-preview", name: "体验用户" };
  }

  const savedVisitorId = cookieValue(request, "yida_visitor");
  if (savedVisitorId && visitorCookiePattern.test(savedVisitorId)) return { id: savedVisitorId, name: "体验用户" };

  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown-network";
  const userAgent = request.headers.get("user-agent") ?? "unknown-browser";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`yida-v0.1:${ip}:${userAgent}`),
  );
  return { id: `visitor-${bytesToHex(new Uint8Array(digest)).slice(0, 32)}`, name: "体验用户" };
}
