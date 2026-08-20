import { env } from "cloudflare:workers";
import { downloadUserImage, requireUserData, usesSupabaseData } from "../../../../lib/supabase-data";
import { getVisitor } from "../../../../lib/visitor";

export const dynamic = "force-dynamic";

type RuntimeEnv = { GARMENT_IMAGES?: R2Bucket };

export async function GET(request: Request) {
  try {
    const supabaseData = usesSupabaseData() ? await requireUserData(request) : null;
    const userId = supabaseData?.user.id ?? (await getVisitor(request)).id;
    const key = new URL(request.url).searchParams.get("key");
    if (!key || !key.startsWith(`${userId}/`)) return new Response("Not found", { status: 404 });
    if (supabaseData) {
      const object = await downloadUserImage(supabaseData.client, key);
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.stream(), {
        headers: {
          "content-type": object.type || "application/octet-stream",
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const bucket = (env as unknown as RuntimeEnv).GARMENT_IMAGES;
    if (!bucket) return new Response("Storage unavailable", { status: 503 });
    const object = await bucket.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("请先登录") || message.includes("登录状态")) {
      return new Response("Unauthorized", { status: 401 });
    }
    console.error("garment image read failed", error);
    return new Response("Storage unavailable", { status: 503 });
  }
}
