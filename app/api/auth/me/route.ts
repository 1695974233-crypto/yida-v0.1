import { getChatGPTUser } from "../../../chatgpt-auth";
import { getSupabaseUser } from "../../../../lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const externalUser = await getSupabaseUser(request);
  if (externalUser) return Response.json({
    authenticated: true,
    user: { id: externalUser.id, email: externalUser.email, name: externalUser.name, provider: "supabase" },
  });

  const allowChatGPTFallback = new URL(request.url).searchParams.get("provider") === "chatgpt";
  const user = allowChatGPTFallback ? await getChatGPTUser() : null;
  if (!user) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({
    authenticated: true,
    user: { id: user.userId, email: user.email, name: user.fullName ?? user.email, provider: "chatgpt" },
  });
}
