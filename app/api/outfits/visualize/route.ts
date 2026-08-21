import { and, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { garments, profiles } from "../../../../db/schema";
import { visualizeOutfitWithSeedream } from "../../../../lib/ark";
import { downloadUserImage, requireUserData, uploadUserImage, userImageExists, usesSupabaseData } from "../../../../lib/supabase-data";
import { getVisitor } from "../../../../lib/visitor";
import { checkVisualizationAllowance, recordSuccessfulVisualization } from "../../../../lib/visualization-limit";
import { virtualCatalog } from "../../../catalog";

export const dynamic = "force-dynamic";

type RuntimeEnv = { GARMENT_IMAGES?: R2Bucket; ARK_API_KEY?: string; ARK_SEEDREAM_MODEL?: string; ARK_VISION_MODEL?: string };

function toDataUrl(bytes: Uint8Array, type: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

async function shortHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function catalogItemFor(key: unknown) {
  return typeof key === "string" ? virtualCatalog.find((item) => item.key === key) : undefined;
}

async function downloadCatalogImage(request: Request, catalogKey: unknown) {
  const catalogItem = catalogItemFor(catalogKey);
  if (!catalogItem) throw new Error("固定衣柜中的衣服已经失效，请重新选择");
  const response = await fetch(new URL(catalogItem.image, request.url), { cache: "force-cache" });
  if (!response.ok) throw new Error(`没有找到“${catalogItem.name}”的图片`);
  return toDataUrl(new Uint8Array(await response.arrayBuffer()), response.headers.get("content-type") ?? "image/jpeg");
}

async function postSupabaseVisualization(request: Request) {
  const { client, user } = await requireUserData(request);
  const arkApiKey = process.env.ARK_API_KEY;
  const seedreamModel = process.env.ARK_SEEDREAM_MODEL;
  if (!arkApiKey) return Response.json({ error: "AI 模特服务尚未配置" }, { status: 503 });
  const payload = await request.json() as { itemIds?: unknown };
  const itemIds = Array.isArray(payload.itemIds)
    ? [...new Set(payload.itemIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id)))].slice(0, 4)
    : [];
  if (itemIds.length < 2) return Response.json({ error: "至少需要两件衣服才能生成模特" }, { status: 400 });

  const profileResult = await client.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = profileResult.data;
  if (!profile?.body_height || !profile.body_weight || !profile.body_shape || !profile.model_presentation) return Response.json({ error: "请先填写身高、体重和身材信息", needsProfile: true }, { status: 400 });
  const normalizedPresentation = profile.model_presentation === "男性" || profile.model_presentation === "男生" ? "男生" : "女生";
  const selectedResult = await client.from("garments").select("*").eq("user_id", user.id).in("id", itemIds);
  if (selectedResult.error) throw new Error(selectedResult.error.message);
  const selected = selectedResult.data ?? [];
  if (selected.length !== itemIds.length || selected.some((item) => item.is_virtual ? !catalogItemFor(item.catalog_key) : !(item.processed_image_key || item.image_key))) {
    return Response.json({ error: "部分衣服缺少可用于生成效果图的图片" }, { status: 400 });
  }
  const ordered = itemIds.map((id) => selected.find((item) => Number(item.id) === id)!);
  const cacheHash = await shortHash(JSON.stringify({ visualizerVersion: 8, framing: "portrait-wide-full-body", qualityGate: "full-body-v2", itemIds: [...itemIds].sort((a, b) => a - b), height: profile.body_height, weight: profile.body_weight, shape: profile.body_shape, presentation: normalizedPresentation, personReference: profile.full_body_image_key ?? null }));
  const outputKey = `${user.id}/looks/${cacheHash}.png`;
  if (await userImageExists(client, outputKey)) return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(outputKey)}`, cached: true });

  const allowance = await checkVisualizationAllowance(user.id, user.email, request);
  if (!allowance.allowed) return Response.json({ error: "今天已成功生成 10 套 AI 试穿，请明天再试", remaining: 0 }, { status: 429 });
  const imageDataUrls = await Promise.all(ordered.map(async (item) => {
    if (item.is_virtual) return downloadCatalogImage(request, item.catalog_key);
    const object = await downloadUserImage(client, item.processed_image_key ?? item.image_key);
    if (!object) throw new Error(`没有找到“${item.name}”的图片`);
    return toDataUrl(new Uint8Array(await object.arrayBuffer()), object.type || "image/jpeg");
  }));
  let personReferenceDataUrl: string | undefined;
  if (profile.full_body_image_key?.startsWith(`${user.id}/`)) {
    const reference = await downloadUserImage(client, profile.full_body_image_key);
    if (reference) personReferenceDataUrl = toDataUrl(new Uint8Array(await reference.arrayBuffer()), reference.type || "image/jpeg");
  }
  const output = await visualizeOutfitWithSeedream(imageDataUrls, ordered.map((item) => item.name), {
    height: profile.body_height,
    weight: profile.body_weight,
    bodyShape: profile.body_shape,
    presentation: normalizedPresentation,
  }, arkApiKey, seedreamModel, personReferenceDataUrl, process.env.ARK_VISION_MODEL);
  await uploadUserImage(client, outputKey, output, "image/png");
  const usage = await recordSuccessfulVisualization(user.id, user.email, request);
  return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(outputKey)}`, remaining: usage.remaining, developer: usage.developer });
}

export async function POST(request: Request) {
  try {
    if (usesSupabaseData()) return await postSupabaseVisualization(request);
    const visitor = await getVisitor(request);
    const runtime = env as unknown as RuntimeEnv;
    if (!runtime.ARK_API_KEY) return Response.json({ error: "AI 模特服务尚未配置" }, { status: 503 });
    if (!runtime.GARMENT_IMAGES) return Response.json({ error: "图片存储尚未启用" }, { status: 503 });
    const payload = await request.json() as { itemIds?: unknown };
    const itemIds = Array.isArray(payload.itemIds)
      ? [...new Set(payload.itemIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id)))].slice(0, 4)
      : [];
    if (itemIds.length < 2) return Response.json({ error: "至少需要两件衣服才能生成模特" }, { status: 400 });

    const db = getDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, visitor.id)).limit(1);
    if (!profile?.bodyHeight || !profile.bodyWeight || !profile.bodyShape || !profile.modelPresentation) {
      return Response.json({ error: "请先填写身高、体重和身材信息", needsProfile: true }, { status: 400 });
    }
    const normalizedPresentation = profile.modelPresentation === "男性" || profile.modelPresentation === "男生" ? "男生" : "女生";
    const selected = await db.select().from(garments).where(and(eq(garments.userId, visitor.id), inArray(garments.id, itemIds)));
    if (selected.length !== itemIds.length || selected.some((item) => item.isVirtual ? !catalogItemFor(item.catalogKey) : !(item.processedImageKey || item.imageKey))) {
      return Response.json({ error: "部分衣服缺少可用于生成效果图的图片" }, { status: 400 });
    }
    const ordered = itemIds.map((id) => selected.find((item) => item.id === id)!);
    const cacheHash = await shortHash(JSON.stringify({ visualizerVersion: 8, framing: "portrait-wide-full-body", qualityGate: "full-body-v2", itemIds: [...itemIds].sort((a, b) => a - b), height: profile.bodyHeight, weight: profile.bodyWeight, shape: profile.bodyShape, presentation: normalizedPresentation, personReference: profile.fullBodyImageKey ?? null }));
    const outputKey = `${visitor.id}/looks/${cacheHash}.png`;
    if (await runtime.GARMENT_IMAGES.head(outputKey)) {
      return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(outputKey)}`, cached: true });
    }

    const allowance = await checkVisualizationAllowance(visitor.id, visitor.email, request);
    if (!allowance.allowed) return Response.json({ error: "今天已成功生成 10 套 AI 试穿，请明天再试", remaining: 0 }, { status: 429 });
    const imageDataUrls = await Promise.all(ordered.map(async (item) => {
      if (item.isVirtual) return downloadCatalogImage(request, item.catalogKey);
      const object = await runtime.GARMENT_IMAGES!.get(item.processedImageKey ?? item.imageKey!);
      if (!object) throw new Error(`没有找到“${item.name}”的图片`);
      return toDataUrl(new Uint8Array(await object.arrayBuffer()), object.httpMetadata?.contentType ?? "image/jpeg");
    }));
    let personReferenceDataUrl: string | undefined;
    if (profile.fullBodyImageKey?.startsWith(`${visitor.id}/`)) {
      const reference = await runtime.GARMENT_IMAGES.get(profile.fullBodyImageKey);
      if (reference) personReferenceDataUrl = toDataUrl(new Uint8Array(await reference.arrayBuffer()), reference.httpMetadata?.contentType ?? "image/jpeg");
    }
    const output = await visualizeOutfitWithSeedream(imageDataUrls, ordered.map((item) => item.name), {
      height: profile.bodyHeight,
      weight: profile.bodyWeight,
      bodyShape: profile.bodyShape,
      presentation: normalizedPresentation,
    }, runtime.ARK_API_KEY, runtime.ARK_SEEDREAM_MODEL, personReferenceDataUrl, runtime.ARK_VISION_MODEL);
    await runtime.GARMENT_IMAGES.put(outputKey, output, {
      httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=3600" },
      customMetadata: { userId: visitor.id, sourceIds: itemIds.join(","), mode: personReferenceDataUrl ? "person" : "mannequin", model: runtime.ARK_SEEDREAM_MODEL ?? "doubao-seedream-5-0-260128" },
    });
    const usage = await recordSuccessfulVisualization(visitor.id, visitor.email, request);
    return Response.json({ imageUrl: `/api/garments/image?key=${encodeURIComponent(outputKey)}`, remaining: usage.remaining, developer: usage.developer });
  } catch (error) {
    console.error("outfit visualization failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "AI 模特生成失败" }, { status: 500 });
  }
}
