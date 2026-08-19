import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { profiles } from "../../../../db/schema";
import { removeUserImages, requireUserData, uploadUserImage, usesSupabaseData } from "../../../../lib/supabase-data";
import { getVisitor } from "../../../../lib/visitor";

export const dynamic = "force-dynamic";

type RuntimeEnv = { GARMENT_IMAGES?: R2Bucket };

function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export async function POST(request: Request) {
  try {
    if (usesSupabaseData()) {
      const { client, user } = await requireUserData(request);
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof File)) return Response.json({ error: "请选择一张全身照" }, { status: 400 });
      if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Response.json({ error: "目前支持 JPG、PNG 或 WebP 图片" }, { status: 415 });
      if (file.size > 4 * 1024 * 1024) return Response.json({ error: "照片不能超过 4MB" }, { status: 413 });
      const current = await client.from("profiles").select("full_body_image_key").eq("user_id", user.id).maybeSingle();
      if (current.error) throw new Error(current.error.message);
      const key = `${user.id}/profile/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      await uploadUserImage(client, key, new Uint8Array(await file.arrayBuffer()), file.type);
      const saved = await client.from("profiles").update({ full_body_image_key: key, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (saved.error) throw new Error(saved.error.message);
      if (current.data?.full_body_image_key?.startsWith(`${user.id}/`)) await removeUserImages(client, [current.data.full_body_image_key]);
      return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(key)}` });
    }
    const visitor = await getVisitor(request);
    const bucket = (env as unknown as RuntimeEnv).GARMENT_IMAGES;
    if (!bucket) return Response.json({ error: "图片存储尚未启用" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: "请选择一张全身照" }, { status: 400 });
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Response.json({ error: "目前支持 JPG、PNG 或 WebP 图片" }, { status: 415 });
    if (file.size > 4 * 1024 * 1024) return Response.json({ error: "照片不能超过 4MB" }, { status: 413 });

    const db = getDb();
    const [current] = await db.select({ fullBodyImageKey: profiles.fullBodyImageKey }).from(profiles).where(eq(profiles.userId, visitor.id)).limit(1);
    const key = `${visitor.id}/profile/${crypto.randomUUID()}.${extensionFor(file.type)}`;
    await bucket.put(key, new Uint8Array(await file.arrayBuffer()), {
      httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
      customMetadata: { userId: visitor.id, purpose: "virtual-try-on-reference" },
    });
    await db.update(profiles).set({ fullBodyImageKey: key, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, visitor.id));
    if (current?.fullBodyImageKey?.startsWith(`${visitor.id}/`)) await bucket.delete(current.fullBodyImageKey);
    return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(key)}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "全身照上传失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (usesSupabaseData()) {
      const { client, user } = await requireUserData(request);
      const current = await client.from("profiles").select("full_body_image_key").eq("user_id", user.id).maybeSingle();
      if (current.error) throw new Error(current.error.message);
      const saved = await client.from("profiles").update({ full_body_image_key: null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (saved.error) throw new Error(saved.error.message);
      if (current.data?.full_body_image_key?.startsWith(`${user.id}/`)) await removeUserImages(client, [current.data.full_body_image_key]);
      return Response.json({ ok: true });
    }
    const visitor = await getVisitor(request);
    const bucket = (env as unknown as RuntimeEnv).GARMENT_IMAGES;
    const db = getDb();
    const [current] = await db.select({ fullBodyImageKey: profiles.fullBodyImageKey }).from(profiles).where(eq(profiles.userId, visitor.id)).limit(1);
    await db.update(profiles).set({ fullBodyImageKey: null, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, visitor.id));
    if (bucket && current?.fullBodyImageKey?.startsWith(`${visitor.id}/`)) await bucket.delete(current.fullBodyImageKey);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "全身照删除失败" }, { status: 500 });
  }
}
