import { clearSupabaseSessionCookie, getSupabaseUser, supabaseSessionCookie } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { accessToken?: string };
    if (!payload.accessToken) return Response.json({ error: "缺少登录凭证" }, { status: 400 });
    const user = await getSupabaseUser(request, payload.accessToken);
    if (!user) return Response.json({ error: "登录状态无效，请重新登录" }, { status: 401 });
    const response = Response.json({
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, provider: "supabase" },
    });
    response.headers.append("Set-Cookie", supabaseSessionCookie(payload.accessToken));
    return response;
  } catch {
    return Response.json({ error: "无法保存登录状态" }, { status: 400 });
  }
}

export async function DELETE() {
  const response = Response.json({ authenticated: false });
  response.headers.append("Set-Cookie", clearSupabaseSessionCookie());
  return response;
}
