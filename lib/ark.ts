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
const SEEDREAM_VISUALIZATION_SIZE = "1728x2304";
const SEEDREAM_MIN_PIXELS = 3_686_400;

function assertSeedreamVisualizationSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) throw new Error("Seedream 效果图尺寸必须使用“宽x高”的格式");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width * height < SEEDREAM_MIN_PIXELS) throw new Error("Seedream 效果图尺寸低于模型最低像素要求");
  if (width * 4 !== height * 3) throw new Error("Seedream 效果图必须保持 3:4 竖版比例");
}

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

async function seedreamError(response: Response, fallback: string) {
  let code = "";
  let message = "";
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } | string };
    if (typeof body.error === "string") message = body.error;
    else {
      code = body.error?.code ?? "";
      message = body.error?.message ?? "";
    }
  } catch {
    // The provider may return an empty or non-JSON error response.
  }
  if (code.includes("SensitiveContent")) return new Error("这套图片被模型安全审核拦截，请更换其中一张衣物照片后重试");
  if (response.status === 429 || code === "QuotaExceeded") return new Error("当前生成请求较多，请稍后再试；本次不会扣除次数");
  if (/image size|parameter ['"]?size/i.test(message)) return new Error("效果图尺寸配置暂时异常，请稍后重试；本次不会扣除次数");
  if (response.status === 400) return new Error(`模型暂时无法处理这组衣物${message ? `：${message.slice(0, 80)}` : "，请换一套后重试"}`);
  return new Error(`${fallback}（${response.status}）`);
}

async function isSeedreamSizeError(response: Response) {
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json() as { error?: { message?: string } | string };
    const message = typeof body.error === "string" ? body.error : body.error?.message ?? "";
    return /image size|parameter ['"]?size/i.test(message);
  } catch {
    return false;
  }
}

type FullBodyCompositionReview = {
  passed: boolean;
  reason: string;
};

async function reviewFullBodyComposition(imageDataUrl: string, apiKey: string, model: string): Promise<FullBodyCompositionReview> {
  const response = await fetch(`${ARK_CHINA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: imageDataUrl } },
        { type: "text", text: `你是穿搭效果图的构图质检员。只判断画面是否真正完整展示了一个人的全身，不评价美观。
仅输出标准 JSON：{"headVisible":true,"handsVisible":true,"legsUncropped":true,"bothFeetVisible":true,"shoesVisible":true,"enoughBottomMargin":true,"reason":"简短中文原因"}。
判定标准：头顶、双手、两条完整裤腿或裙摆、脚踝、双脚和双鞋均在画面内；鞋底下方有留白；任何部位被画面边缘或文字区遮挡都必须填 false。不要因为画面是竖版就推测下半身存在，只按实际可见内容判断。` },
      ] }],
      thinking: { type: "disabled" },
      reasoning_effort: "minimal",
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`效果图自动质检暂时不可用（${response.status}）`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("效果图自动质检没有返回结果");
  const review = parseJsonObject(content);
  const passed = review.headVisible === true
    && review.handsVisible === true
    && review.legsUncropped === true
    && review.bothFeetVisible === true
    && review.shoesVisible === true
    && review.enoughBottomMargin === true;
  return { passed, reason: typeof review.reason === "string" ? review.reason.slice(0, 80) : "人物没有完整入镜" };
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
  if (!response.ok) throw await seedreamError(response, "Seedream 图片整理失败");
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
  visionModel = "doubao-seed-2-0-lite-260215",
) {
  assertSeedreamVisualizationSize(SEEDREAM_VISUALIZATION_SIZE);
  const fullBodyFraming = `画面必须是竖版 3:4 的远景全身穿搭目录照。相机明显后退并保持平视，人物从头顶到鞋底完整入镜，双脚和鞋子必须完整清晰可见；人物只占画面高度的 60%—68%，头顶保留至少画面高度 8% 的留白，鞋底下方保留至少画面高度 12% 的留白，身体两侧也要有宽阔留白。严禁半身、中景、近景或膝盖以上构图，严禁裁切头部、手部、裤腿、脚踝、双脚或鞋子。`;
  const prompt = personReferenceDataUrl
    ? `你是易搭的真人虚拟试穿生成器。第一张输入图是用户本人自愿上传的全身参考照，其余图片是用户真实衣物。让参考照中的同一个人穿上所有衣物，保留其体型、姿态和人物身份特征，不改变衣物设计。
用户资料：${profile.presentation}；身高约 ${profile.height}cm；体重约 ${profile.weight}kg；身材特点：${profile.bodyShape}。
衣物清单（与衣物输入图顺序一致）：${garmentNames.map((name, index) => `${index + 1}.${name}`).join("；")}。
只能穿着清单中的衣物。必须忠实保留每件衣物的颜色、图案、领型、袖长、裤型或裙长和材质纹理，不得替换成相似款；清单没有外套时绝对不能生成外套，清单没有配饰时绝对不能生成配饰。${fullBodyFraming} 生成正面自然站立的穿搭效果，米白纯色影棚背景，柔和均匀光线，不添加文字、水印或边框。`
    : `你是易搭的虚拟试穿生成器。参考输入的每张真实衣物照片，把这些衣物组合穿在同一个无脸假人模特上。
模特呈现：${profile.presentation}；身高约 ${profile.height}cm；体重约 ${profile.weight}kg；身材特点：${profile.bodyShape}。
衣物清单（与输入图顺序一致）：${garmentNames.map((name, index) => `${index + 1}.${name}`).join("；")}。
只能穿着清单中的衣物。必须忠实保留每件衣物的颜色、图案、领型、袖长、裤型或裙长、材质纹理，不得替换成相似款；清单没有外套时绝对不能生成外套，清单没有配饰时绝对不能生成配饰。${fullBodyFraming} 生成正面自然站立效果，米白纯色影棚背景，柔和均匀光线，像服装搭配软件中的高级假人模特；不生成真实人脸，不添加文字、水印或边框。`;
  const inputImages = personReferenceDataUrl ? [personReferenceDataUrl, ...imageDataUrls] : imageDataUrls;
  const requestVisualization = (size: string, requestPrompt = prompt, requestImages = inputImages) => fetch(`${ARK_CHINA_BASE_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      image: requestImages,
      prompt: requestPrompt,
      size,
      output_format: "png",
      response_format: "b64_json",
      sequential_image_generation: "disabled",
      watermark: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const generate = async (requestPrompt = prompt, requestImages = inputImages) => {
    let response = await requestVisualization(SEEDREAM_VISUALIZATION_SIZE, requestPrompt, requestImages);
    // Provider-side limits can change independently of our release. Keep the feature
    // available by retrying once with the provider-managed 2K preset on size errors.
    if (!response.ok && await isSeedreamSizeError(response)) response = await requestVisualization("2K", requestPrompt, requestImages);
    if (!response.ok) throw await seedreamError(response, "AI 模特生成失败");
    const body = await response.json() as { data?: Array<{ b64_json?: string }> };
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw new Error("Seedream 没有返回模特图片");
    return encoded;
  };

  let encoded = await generate();
  let review = await reviewFullBodyComposition(`data:image/png;base64,${encoded}`, apiKey, visionModel);
  if (!review.passed) {
    const repairPrompt = `你是易搭的全身构图修复器。第一张图是上一版穿搭效果，但自动质检发现：${review.reason}。其余图片是人物或真实衣物参考。
在完全保留上一版人物、衣物颜色、图案、版型和搭配关系的前提下，把镜头大幅后退并向下扩展画布，重新生成竖版 3:4 远景全身目录照。必须从头顶到鞋底完整入镜，展示两条完整裤腿、脚踝、双脚和双鞋，鞋底下方保留至少画面高度 12% 的米白背景。人物只占画面高度 58%—65%，严禁膝盖或脚踝处截断，严禁用文字区遮挡腿脚，不添加文字、水印或边框。`;
    encoded = await generate(repairPrompt, [`data:image/png;base64,${encoded}`, ...inputImages]);
    review = await reviewFullBodyComposition(`data:image/png;base64,${encoded}`, apiKey, visionModel);
    if (!review.passed) throw new Error(`效果图未通过全身构图检查：${review.reason}。本次不会扣除次数，请稍后重试`);
  }
  return decodeBase64(encoded);
}
