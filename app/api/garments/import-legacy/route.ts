import { removeUserImages, requireUserData, uploadUserImage } from "../../../../lib/supabase-data";

export const dynamic = "force-dynamic";

type LegacyGarment = {
  file: string;
  name: string;
  category: string;
  color: string;
  colorName: string;
  material: string;
  pattern: string;
  warmth: number;
  styleTags: string[];
  sceneTags: string[];
  weatherTags: string[];
  dirty?: boolean;
};

function cleanList(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 20)).slice(0, 5)
    : fallback;
}

function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUserData(request);
    const form = await request.formData();
    const manifestFile = form.get("manifest");
    const imageFiles = form.getAll("images").filter((item): item is File => item instanceof File);
    if (!(manifestFile instanceof File)) return Response.json({ error: "请选择旧衣柜备份清单" }, { status: 400 });
    if (manifestFile.size > 200 * 1024) return Response.json({ error: "备份清单过大" }, { status: 413 });

    const parsed = JSON.parse(await manifestFile.text()) as { garments?: LegacyGarment[] };
    const garments = Array.isArray(parsed.garments) ? parsed.garments.slice(0, 30) : [];
    if (!garments.length) return Response.json({ error: "备份中没有可导入的衣服" }, { status: 400 });
    const filesByName = new Map(imageFiles.map((file) => [file.name, file]));
    const existing = await client.from("garments").select("name,color_name,is_virtual").eq("user_id", user.id).eq("is_virtual", false);
    if (existing.error) throw new Error(`读取现有衣柜失败：${existing.error.message}`);
    const existingKeys = new Set((existing.data ?? []).map((item) => `${String(item.name).trim()}::${String(item.color_name).trim()}`));

    let imported = 0;
    let skipped = 0;
    for (const raw of garments) {
      const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 30) : "";
      const category = typeof raw.category === "string" ? raw.category.trim().slice(0, 12) : "";
      const colorName = typeof raw.colorName === "string" ? raw.colorName.trim().slice(0, 12) : "其他";
      if (!name || !category || existingKeys.has(`${name}::${colorName}`)) {
        skipped += 1;
        continue;
      }
      const file = filesByName.get(raw.file);
      if (!file || !new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) || file.size > 900 * 1024) throw new Error(`${name} 的图片缺失或格式不正确`);

      const imageKey = `${user.id}/${crypto.randomUUID()}/original.${extensionFor(file.type)}`;
      await uploadUserImage(client, imageKey, new Uint8Array(await file.arrayBuffer()), file.type);
      const material = typeof raw.material === "string" ? raw.material.trim().slice(0, 20) : "待确认";
      const pattern = typeof raw.pattern === "string" ? raw.pattern.trim().slice(0, 20) : "待确认";
      const inserted = await client.from("garments").insert({
        user_id: user.id,
        catalog_key: null,
        name,
        category,
        color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#d8d0c2",
        color_name: colorName,
        meta: `${material} · ${pattern} · 已确认`,
        warmth: typeof raw.warmth === "number" ? Math.min(5, Math.max(1, Math.round(raw.warmth))) : 2,
        style_tags: cleanList(raw.styleTags, []),
        scene_tags: cleanList(raw.sceneTags, ["休闲"]),
        weather_tags: cleanList(raw.weatherTags, ["常规"]),
        is_virtual: false,
        image_key: imageKey,
        processed_image_key: null,
        recognition_status: "confirmed_manual",
        recognition_confidence: 100,
        recognition_provider: "legacy-import",
        recognized_at: new Date().toISOString(),
        dirty_until: raw.dirty ? new Date(Date.now() + 3 * 86400000).toISOString() : null,
      });
      if (inserted.error) {
        await removeUserImages(client, [imageKey]).catch(() => undefined);
        throw new Error(`${name} 导入失败：${inserted.error.message}`);
      }
      existingKeys.add(`${name}::${colorName}`);
      imported += 1;
    }
    const profile = await client.from("profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (profile.error) throw new Error(`引导状态保存失败：${profile.error.message}`);
    return Response.json({ imported, skipped, total: garments.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "旧衣柜导入失败" }, { status: 500 });
  }
}
