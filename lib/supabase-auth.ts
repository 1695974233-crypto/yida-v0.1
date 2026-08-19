export type SupabaseIdentity = {
  id: string;
  email: string;
  name: string;
  emailConfirmed: boolean;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const sessionCookieName = "yida_supabase_token";

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function supabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export async function getSupabaseUser(request: Request, explicitToken?: string): Promise<SupabaseIdentity | null> {
  if (!supabaseConfigured()) return null;
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const token = explicitToken ?? bearerToken ?? cookieValue(request, sessionCookieName);
  if (!token || token.length > 5000) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const user = await response.json() as {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
      user_metadata?: { full_name?: string; name?: string; display_name?: string };
    };
    if (!user.id || !user.email) return null;
    const metadataName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name;
    return {
      id: user.id,
      email: user.email,
      name: metadataName?.trim() || user.email,
      emailConfirmed: Boolean(user.email_confirmed_at),
    };
  } catch {
    return null;
  }
}

export function supabaseSessionCookie(token: string) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=7200; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSupabaseSessionCookie() {
  return `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
