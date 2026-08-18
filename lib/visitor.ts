import { getChatGPTUser } from "../app/chatgpt-auth";

export type Visitor = { id: string; name: string };
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
  const user = await getChatGPTUser();
  if (user) return { id: user.userId, name: user.fullName ?? "晚晚" };

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
