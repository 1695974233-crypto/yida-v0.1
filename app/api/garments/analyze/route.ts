import { env } from "cloudflare:workers";
import { analyzeGarmentWithArk, enhanceGarmentWithSeedream, fallbackGarmentAnalysis } from "../../../../lib/ark";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

type RuntimeEnv = {
  GARMENT_IMAGES?: R2Bucket;
  ARK_API_KEY?: string;
  ARK_VISION_MODEL?: string;
  ARK_SEEDREAM_MODEL?: string;
};

async function currentUser(request: Request) {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "local-preview" : null;
}

function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

function toDataUrl(bytes: Uint8Array, type: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

export async function POST(request: Request) {
  try {
    const userId = await currentUser(request);
    if (!userId) return Response.json({ error: "请先登录后上传衣服" }, { status: 401 });
    const runtime = env as unknown as RuntimeEnv;
    if (!runtime.GARMENT_IMAGES) return Response.json({ error: "图片存储尚未启用" }, { status: 503 });

    const form = await request.formData();
    const file = form.get("image");
    const enhance = form.get("enhance") === "true";
    if (!(file instanceof File)) return Response.json({ error: "请选择一张衣物照片" }, { status: 400 });
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Response.json({ error: "目前支持 JPG、PNG 或 WebP 图片" }, { status: 415 });
    if (file.size > 900 * 1024) return Response.json({ error: "图片处理后仍然过大，请重新选择" }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const originalKey = `${userId}/${id}/original.${extensionFor(file.type)}`;
    await runtime.GARMENT_IMAGES.put(originalKey, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
      customMetadata: { userId, originalName: file.name.slice(0, 120) },
    });

    const dataUrl = toDataUrl(bytes, file.type);
    let analysis = fallbackGarmentAnalysis(file.name);
    let recognitionProvider = "manual-fallback";
    const pipelineWarnings: string[] = [];
    if (runtime.ARK_API_KEY) {
      try {
        analysis = await analyzeGarmentWithArk(dataUrl, runtime.ARK_API_KEY, runtime.ARK_VISION_MODEL);
        recognitionProvider = runtime.ARK_VISION_MODEL ?? "seed-2-0-lite-260228";
      } catch (error) {
        pipelineWarnings.push(error instanceof Error ? error.message : "AI 识别暂时不可用");
      }
    }

    let processedKey: string | null = null;
    if (enhance && runtime.ARK_API_KEY) {
      try {
        const processed = await enhanceGarmentWithSeedream(dataUrl, runtime.ARK_API_KEY, runtime.ARK_SEEDREAM_MODEL);
        processedKey = `${userId}/${id}/seedream.png`;
        await runtime.GARMENT_IMAGES.put(processedKey, processed, {
          httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=3600" },
          customMetadata: { userId, source: originalKey, model: runtime.ARK_SEEDREAM_MODEL ?? "seedream-5-0-lite-260128" },
        });
      } catch (error) {
        pipelineWarnings.push(error instanceof Error ? error.message : "Seedream 展示图整理暂时不可用");
      }
    }

    return Response.json({
      analysis: { ...analysis, warnings: [...analysis.warnings, ...pipelineWarnings] },
      imageKey: originalKey,
      processedImageKey: processedKey,
      imageUrl: `/api/garments/image?key=${encodeURIComponent(processedKey ?? originalKey)}`,
      recognitionProvider,
      enhancerProvider: processedKey ? (runtime.ARK_SEEDREAM_MODEL ?? "seedream-5-0-lite-260128") : null,
      aiReady: Boolean(runtime.ARK_API_KEY),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图片处理失败" }, { status: 500 });
  }
}
