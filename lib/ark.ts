export type GarmentAnalysis = {
  name: string;
  category: "上衣" | "下装" | "外套" | "连衣裙" | "鞋子" | "配饰";
  colorName: string;
  colorHex: string;
  material: string;
  pattern: string;
  warmth: number;
  styleTags: string[];
  sceneTags: string[];
  weatherTags: string[];
  confidence: number;
  warnings: string[];
};

const categoryValues = ["上衣", "下装", "外套", "连衣裙", "鞋子", "配饰"] as const;
const colorMap: Record<string, string> = {
  米白: "#eeeae2", 白色: "#f1f0eb", 黑色: "#292927", 灰色: "#858681",
  蓝色: "#66819b", 棕色: "#745b48", 粉色: "#cda8ab", 红色: "#a84d4a",
  绿色: "#6f8067", 黄色: "#d2ae59", 紫色: "#88738e", 其他: "#d8d0c2",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseJsonObject(value: string): Record<string, unknown> {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch {
    const repaired = source
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content: string) => JSON.stringify(content))
      .replace(/:\s*(?!["{[])([^,}\]\n]+)(?=\s*[,}\]])/g, (_match, raw: string) => {
        const text = raw.trim();
        return /^(?:-?\d+(?:\.\d+)?|true|false|null)$/i.test(text) ? `: ${text}` : `: ${JSON.stringify(text)}`;
      })
      .replace(/([[,]\s*)(?!["'{[])([^,\]\n]+)(?=\s*[,\]])/g, (_match, prefix: string, raw: string) => {
        const text = raw.trim();
        return `${prefix}${/^(?:-?\d+(?:\.\d+)?|true|false|null)$/i.test(text) ? text : JSON.stringify(text)}`;
      })
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired) as Record<string, unknown>;
  }
}

function stringList(value: unknown, allowed?: string[]) {
  if (!Array.isArray(value)) return [];
  const items = value.filter((item): item is string => typeof item === "string").slice(0, 5);
  return allowed ? items.filter((item) => allowed.includes(item)) : items;
}

function normalizeAnalysis(raw: Record<string, unknown>): GarmentAnalysis {
  const category = categoryValues.includes(raw.category as typeof categoryValues[number])
    ? raw.category as GarmentAnalysis["category"]
    : "上衣";
  const colorName = typeof raw.colorName === "string" && raw.colorName.trim() ? raw.colorName.trim().slice(0, 12) : "其他";
  const knownColor = Object.keys(colorMap).find((color) => colorName.includes(color));
  const confidenceValue = typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence);
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 30) : `${colorName}${category}`,
    category,
    colorName,
    colorHex: typeof raw.colorHex === "string" && /^#[0-9a-f]{6}$/i.test(raw.colorHex) ? raw.colorHex : colorMap[knownColor ?? "其他"],
    material: typeof raw.material === "string" ? raw.material.trim().slice(0, 20) : "待确认",
    pattern: typeof raw.pattern === "string" ? raw.pattern.trim().slice(0, 20) : "纯色",
    warmth: clamp(Number.isFinite(Number(raw.warmth)) ? Math.round(Number(raw.warmth)) : 2, 1, 5),
    styleTags: stringList(raw.styleTags, ["简约通勤", "温柔松弛", "清爽休闲", "法式复古", "街头感"]),
    sceneTags: stringList(raw.sceneTags, ["上班", "商务", "开会", "上课", "约会", "聚会", "逛街", "正式活动", "休闲", "运动", "旅行", "户外", "居家"]),
    weatherTags: stringList(raw.weatherTags, ["炎热", "常规", "微凉", "寒冷", "小雨"]),
    confidence: clamp(Number.isFinite(confidenceValue) ? Math.round(confidenceValue) : 70, 0, 100),
    warnings: stringList(raw.warnings),
  };
}

export function fallbackGarmentAnalysis(fileName: string): GarmentAnalysis {
  const lower = fileName.toLowerCase();
  const category: GarmentAnalysis["category"] = /shoe|鞋|靴/.test(lower) ? "鞋子"
    : /coat|jacket|外套|风衣|西装/.test(lower) ? "外套"
      : /dress|连衣裙/.test(lower) ? "连衣裙"
        : /pant|jean|skirt|裤|裙/.test(lower) ? "下装" : "上衣";
  return {
    name: `待确认${category}`,
    category,
    colorName: "其他",
    colorHex: colorMap.其他,
    material: "待确认",
    pattern: "待确认",
    warmth: 2,
    styleTags: [],
    sceneTags: ["上班", "约会", "休闲"],
    weatherTags: ["常规"],
    confidence: 0,
    warnings: ["当前未配置视觉识别密钥，请确认系统给出的默认信息。"],
  };
}

const ARK_CHINA_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export async function analyzeGarmentWithArk(imageDataUrl: string, apiKey: string, model = "doubao-seed-2-0-lite-260215") {
  const prompt = `你是易搭的衣物录入助手。只分析图片里最主要的一件衣物，不要猜测看不清的细节。\n请仅输出一个可被 JSON.parse 直接解析的标准 JSON 对象，不要输出 Markdown、注释或额外说明。所有字段名和所有字符串值都必须使用英文双引号，数组中的字符串也必须加英文双引号。\n字段如下：\nname: 简短中文名称；category: 只能是上衣/下装/外套/连衣裙/鞋子/配饰；colorName: 主要颜色中文；colorHex: 近似十六进制颜色；material: 材质，不确定写待确认；pattern: 图案；warmth: 1到5整数；styleTags: 从简约通勤/温柔松弛/清爽休闲/法式复古/街头感选择；sceneTags: 从上班/商务/开会/上课/约会/聚会/逛街/正式活动/休闲/运动/旅行/户外/居家选择最合适的1到5项；weatherTags: 从炎热/常规/微凉/寒冷/小雨选择；confidence: 0到100；warnings: 图片质量或识别不确定项数组。`;
  const response = await fetch(`${ARK_CHINA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: imageDataUrl } },
        { type: "text", text: prompt },
      ] }],
      thinking: { type: "disabled" },
      reasoning_effort: "minimal",
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`视觉识别失败（${response.status}）`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("视觉模型没有返回识别结果");
  return normalizeAnalysis(parseJsonObject(content));
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function enhanceGarmentWithSeedream(imageDataUrl: string, apiKey: string, model = "doubao-seedream-5-0-260128") {
  const response = await fetch(`${ARK_CHINA_BASE_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      image: [imageDataUrl],
      prompt: "把图片中唯一一件衣物整理为电商衣柜展示图：保持衣物真实颜色、版型、长度、材质纹理、图案和所有细节完全不变；去除人物、衣架和杂乱背景；衣物自然平铺并完整居中；纯白背景，柔和均匀光线，不添加任何新元素。",
      size: "2K",
      output_format: "png",
      response_format: "b64_json",
      sequential_image_generation: "disabled",
      watermark: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Seedream 图片整理失败（${response.status}）`);
  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = body.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Seedream 没有返回展示图");
  return decodeBase64(encoded);
}

export async function visualizeOutfitWithSeedream(
  imageDataUrls: string[],
  garmentNames: string[],
  profile: { height: number; weight: number; bodyShape: string; presentation: string },
  apiKey: string,
  model = "doubao-seedream-5-0-260128",
  personReferenceDataUrl?: string,
) {
  const prompt = personReferenceDataUrl
    ? `你是易搭的真人虚拟试穿生成器。第一张输入图是用户本人自愿上传的全身参考照，其余图片是用户真实衣物。让参考照中的同一个人穿上所有衣物，保留其体型、姿态和人物身份特征，不改变衣物设计。
用户资料：${profile.presentation}；身高约 ${profile.height}cm；体重约 ${profile.weight}kg；身材特点：${profile.bodyShape}。
衣物清单：${garmentNames.join("、")}。
必须忠实保留每件衣物的颜色、图案、领型、袖长、裤型或裙长和材质纹理，不得替换成相似款，不得增加未提供的外套或配饰。生成全身正面自然站立的穿搭效果，米白纯色影棚背景，柔和均匀光线，不添加文字、水印或边框。`
    : `你是易搭的虚拟试穿生成器。参考输入的每张真实衣物照片，把这些衣物组合穿在同一个无脸假人模特上。
模特呈现：${profile.presentation}；身高约 ${profile.height}cm；体重约 ${profile.weight}kg；身材特点：${profile.bodyShape}。
衣物清单：${garmentNames.join("、")}。
必须忠实保留每件衣物的颜色、图案、领型、袖长、裤型或裙长、材质纹理，不得替换成相似款，不得增加未提供的外套或配饰。生成全身正面站立效果，米白纯色影棚背景，柔和均匀光线，像服装搭配软件中的高级假人模特；不生成真实人脸，不添加文字、水印或边框。`;
  const response = await fetch(`${ARK_CHINA_BASE_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      image: personReferenceDataUrl ? [personReferenceDataUrl, ...imageDataUrls] : imageDataUrls,
      prompt,
      size: "2K",
      output_format: "png",
      response_format: "b64_json",
      sequential_image_generation: "disabled",
      watermark: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`AI 模特生成失败（${response.status}）`);
  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = body.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Seedream 没有返回模特图片");
  return decodeBase64(encoded);
}
