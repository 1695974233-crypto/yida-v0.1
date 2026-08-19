import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({
    authenticated: true,
    user: { id: user.userId, email: user.email, name: user.fullName ?? user.email },
  });
}
