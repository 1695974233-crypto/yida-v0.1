import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

type RuntimeEnv = { GARMENT_IMAGES?: R2Bucket };

async function currentUser(request: Request) {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "local-preview" : null;
}

export async function GET(request: Request) {
  const userId = await currentUser(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith(`${userId}/`)) return new Response("Not found", { status: 404 });
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
}
