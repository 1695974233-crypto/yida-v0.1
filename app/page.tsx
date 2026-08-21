"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { selectEligibleOutfits } from "../lib/outfit-selection";
import { resolveKnownWeatherCity } from "../lib/weather-cities";
import { defaultCatalogKeys, virtualCatalog } from "./catalog";

type Tab = "today" | "wardrobe" | "discover" | "profile";
type Garment = {
  id: number;
  catalogKey?: string | null;
  name: string;
  category: string;
  color: string;
  colorName: string;
  meta: string;
  warmth: number;
  styleTags: string[];
  sceneTags: string[];
  weatherTags: string[];
  isVirtual?: boolean;
  dirty: boolean;
  image?: string;
};

type FeedbackRecord = { outfitKey: string; action: string };
type AccountData = { id: string; email: string; name: string; provider?: "supabase" | "chatgpt" };
type AuthView = "login" | "register" | "forgot" | "reset";
type Outfit = { key: string; title: string; tag: string; score: number; colors: string[]; items: string; reason: string; itemIds: number[] };
type RequestConstraints = { scene?: string; warmth?: "warmer" | "lighter"; formality?: "formal" | "casual"; avoid?: string[]; colors?: string[] };
type ChatMessage = { id: number; role: "user" | "assistant"; content: string; createdAt?: string };
type ExpandedLook = { imageUrl: string; title: string; items: string; mode: string };
type WeatherData = { city: string; latitude: number; longitude: number; temperature: number; apparentTemperature: number; precipitation: number; windSpeed: number; weatherCode: number; temperatureMax: number; temperatureMin: number; condition: string; icon: string };
type WeatherLocation = { latitude?: number; longitude?: number; name?: string; city?: string };
type WeatherGeocodingResponse = { results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string }> };
type WeatherForecastResponse = {
  current?: { temperature_2m: number; apparent_temperature: number; precipitation: number; weather_code: number; wind_speed_10m: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] };
};
type ProfileData = { preferredStyles: string[]; lastScene: string | null; onboardingCompleted?: boolean; weatherCity?: string | null; weatherLatitude?: number | null; weatherLongitude?: number | null; bodyHeight?: number | null; bodyWeight?: number | null; bodyShape?: string | null; modelPresentation?: string | null; fullBodyImageUrl?: string | null };
type GarmentDraft = {
  name: string;
  category: string;
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

function onboardingStorageKey(userId: string) {
  return `yida_onboarding_completed:${userId}`;
}

type InspirationLook = {
  key: string;
  title: string;
  subtitle: string;
  image: string;
  sourceUrl: string;
  sourceName: string;
  gender: "女生" | "男生";
  seasons: string[];
  minTemperature: number;
  maxTemperature: number;
  styles: string[];
  scenes: string[];
};

const inspirationLooks: InspirationLook[] = [
  {
    key: "summer-denim-skirt",
    title: "短上衣与牛仔裙的轻盈比例",
    subtitle: "适合炎热天气的清爽街头感，露肤适度，运动鞋让整套更日常。",
    image: "https://images.unsplash.com/photo-1780566759959-73ce2af09f7c?auto=format&fit=crop&w=1200&q=82",
    sourceUrl: "https://unsplash.com/photos/young-woman-posing-in-casual-outfit-with-black-handbag-zEGIgG2aYyQ",
    sourceName: "Anton K Wibowo / Unsplash",
    gender: "女生",
    seasons: ["夏季"],
    minTemperature: 25,
    maxTemperature: 38,
    styles: ["清爽休闲", "街头感"],
    scenes: ["休闲", "逛街", "旅行"],
  },
  {
    key: "summer-city-jeans",
    title: "短款上衣与高腰牛仔裤",
    subtitle: "用高腰线拉长比例，适合城市漫步、朋友聚会和轻松约会。",
    image: "https://images.unsplash.com/photo-1767786887389-5796cb39e227?auto=format&fit=crop&w=1200&q=82",
    sourceUrl: "https://unsplash.com/photos/young-woman-in-casual-clothes-standing-outdoors-yJXXwAFjg0Y",
    sourceName: "Rodrigo Rodrigues / Unsplash",
    gender: "女生",
    seasons: ["夏季"],
    minTemperature: 24,
    maxTemperature: 37,
    styles: ["清爽休闲", "温柔松弛"],
    scenes: ["休闲", "约会", "旅行"],
  },
  {
    key: "brown-coat-city",
    title: "大地色风衣的层次感",
    subtitle: "降温或有风时，用同色系内搭保持利落，适合通勤与城市出行。",
    image: "https://images.unsplash.com/photo-1548007936-c5c12f4456b8?auto=format&fit=crop&w=1200&q=82",
    sourceUrl: "https://unsplash.com/photos/woman-in-brown-coat-standing-on-street-during-daytime-scDoY4YJeoo",
    sourceName: "Jed Villejo / Unsplash",
    gender: "女生",
    seasons: ["春季", "秋季"],
    minTemperature: 10,
    maxTemperature: 24,
    styles: ["简约通勤", "法式复古"],
    scenes: ["上班", "开会", "约会"],
  },
  {
    key: "mens-corduroy-layer",
    title: "灯芯绒外套的复古叠穿",
    subtitle: "衬衫、领带与休闲外套混搭，正式但不拘谨，适合约会和创意办公。",
    image: "https://images.unsplash.com/photo-1764593008673-af6056758b4a?auto=format&fit=crop&w=1200&q=82",
    sourceUrl: "https://unsplash.com/photos/man-in-stylish-outfit-walks-down-street-X-Vp-swqmKQ",
    sourceName: "Dion Martins / Unsplash",
    gender: "男生",
    seasons: ["春季", "秋季", "冬季"],
    minTemperature: 5,
    maxTemperature: 23,
    styles: ["法式复古", "街头感"],
    scenes: ["上班", "约会", "聚会"],
  },
];

const garmentSceneGroups = [
  { label: "工作学习", options: ["上班", "商务", "开会", "上课"] },
  { label: "社交生活", options: ["约会", "聚会", "逛街", "正式活动"] },
  { label: "日常出行", options: ["休闲", "运动", "旅行", "户外", "居家"] },
] as const;

const relatedScenes: Record<string, string[]> = {
  上班: ["上班", "商务", "开会", "上课"],
  约会: ["约会", "聚会", "逛街"],
  休闲: ["休闲", "聚会", "逛街", "旅行", "户外", "居家"],
  运动: ["运动", "户外"],
};

const initialGarments: Garment[] = defaultCatalogKeys.map((key, index) => {
  const item = virtualCatalog.find((entry) => entry.key === key)!;
  return { id: index + 1, catalogKey: key, ...item, isVirtual: true, dirty: false };
});

function buildOutfits(garments: Garment[], scene: string | null, styles: string[], constraints: RequestConstraints, weather: WeatherData | null): Outfit[] {
  const available = garments.filter((item) => !item.dirty && !(constraints.avoid ?? []).some((term) => item.name.includes(term) || item.category.includes(term)));
  const tops = available.filter((item) => item.category === "上衣");
  const bottoms = available.filter((item) => item.category === "下装");
  const dresses = available.filter((item) => item.category === "连衣裙");
  const shoes = available.filter((item) => item.category === "鞋子");
  const outers = available.filter((item) => item.category === "外套");
  if (((!tops.length || !bottoms.length) && !dresses.length) || !shoes.length) return [];

  const candidates: Outfit[] = [];
  function addCandidate(basePieces: Garment[], outer?: Garment) {
    const pieces = [...basePieces.slice(0, -1), ...(outer ? [outer] : []), basePieces[basePieces.length - 1]];
    let score = 62;
    const warmth = pieces.reduce((sum, item) => sum + item.warmth, 0);
    const feelsLike = weather?.apparentTemperature;
    const weatherWarmthRange = feelsLike === undefined ? [6, 9] : feelsLike >= 30 ? [3, 5] : feelsLike >= 24 ? [3, 6] : feelsLike >= 18 ? [4, 7] : feelsLike >= 10 ? [6, 9] : feelsLike >= 0 ? [8, 12] : [9, 14];
    const warmthRange = constraints.warmth === "warmer" ? [Math.max(6, weatherWarmthRange[0] + 1), weatherWarmthRange[1] + 2] : constraints.warmth === "lighter" ? [3, Math.max(5, weatherWarmthRange[1] - 2)] : weatherWarmthRange;
    score += warmth >= warmthRange[0] && warmth <= warmthRange[1] ? 10 : warmth >= 3 && warmth <= 12 ? 4 : -5;
    const styleHits = pieces.reduce((sum, item) => sum + item.styleTags.filter((style) => styles.includes(style)).length, 0);
    score += Math.min(styleHits * 3, 12);
    if (scene) {
      const compatibleScenes = relatedScenes[scene] ?? [scene];
      const sceneHits = pieces.filter((item) => item.sceneTags.some((tag) => compatibleScenes.includes(tag))).length;
      score += sceneHits === pieces.length ? 10 : sceneHits * 2;
    } else score += 5;
    const isRainy = Boolean(weather && (weather.precipitation > 0.1 || (weather.weatherCode >= 51 && weather.weatherCode <= 82)));
    const isWindy = Boolean(weather && weather.windSpeed >= 25);
    const targetWeatherTag = feelsLike === undefined ? "常规" : feelsLike >= 28 ? "炎热" : feelsLike >= 18 ? "常规" : feelsLike >= 10 ? "微凉" : "寒冷";
    score += pieces.filter((item) => item.weatherTags.includes(targetWeatherTag)).length * 2;
    if (isRainy) score += pieces.filter((item) => item.weatherTags.includes("小雨")).length * 3;
    if (isWindy) score += outer ? 5 : -2;
    if (constraints.formality === "formal") score += pieces.filter((item) => item.styleTags.includes("简约通勤")).length * 2;
    if (constraints.formality === "casual") score += pieces.filter((item) => item.styleTags.includes("清爽休闲") || item.styleTags.includes("温柔松弛")).length * 2;
    if (constraints.colors?.length) score += pieces.filter((item) => constraints.colors?.some((color) => item.colorName.includes(color))).length * 4;
    const neutralNames = new Set(["燕麦色", "浅蓝", "奶油白", "深灰", "牛仔蓝", "黑色", "米白", "灰色", "棕色"]);
    if (pieces.filter((item) => neutralNames.has(item.colorName)).length >= 3) score += 5;
    const itemIds = pieces.map((item) => item.id);
    const key = `${scene ?? "日常"}-${itemIds.slice().sort((a, b) => a - b).join("-")}`;
    candidates.push({
      key,
      title: scene === "上班" ? "轻松有分寸" : scene === "约会" ? "温柔但不刻意" : scene === "运动" ? "舒服动起来" : isRainy && outer ? "雨天也清爽" : outer ? "温差也从容" : "舒服不费力",
      tag: candidates.length === 0 ? "最适合今天" : scene ? `${scene}优选` : "日常通用",
      score: Math.min(score, 98),
      colors: pieces.map((item) => item.color),
      items: pieces.map((item) => item.name).join(" · "),
      reason: `${weather ? `${weather.city}今天 ${weather.temperatureMin}—${weather.temperatureMax}℃，体感 ${weather.apparentTemperature}℃${isRainy ? "，有降雨" : ""}${isWindy ? "，风力较明显" : ""}。` : "尚未设置真实天气，先按常规温度推荐。"}${outer ? `${outer.name}可以应对${isRainy ? "降雨" : "温差"}。` : "整体厚度与当前体感相符。"}${scene ? `这几件适合${scene}场景，` : "在没有指定场景时，"}并优先使用你偏爱的${styles[0] ?? "清爽"}风格${constraints.avoid?.length ? `，已避开${constraints.avoid.join("、")}` : ""}。`,
      itemIds,
    });
  }
  for (const top of tops) for (const bottom of bottoms) for (const shoe of shoes) for (const outer of [undefined, ...outers]) addCandidate([top, bottom, shoe], outer);
  for (const dress of dresses) for (const shoe of shoes) for (const outer of [undefined, ...outers]) addCandidate([dress, shoe], outer);
  const unique = new Map<string, Outfit>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const combinationKey = candidate.itemIds.slice().sort((a, b) => a - b).join("-");
    if (!unique.has(combinationKey)) unique.set(combinationKey, candidate);
  }
  const pool = [...unique.values()];
  const diversified: Outfit[] = [];
  while (pool.length && diversified.length < 24) {
    const batch: Outfit[] = [];
    while (pool.length && batch.length < 3) {
      let bestIndex = 0;
      let bestValue = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < pool.length; index += 1) {
        const candidate = pool[index];
        const mostSharedItems = batch.length
          ? Math.max(...batch.map((chosen) => candidate.itemIds.filter((id) => chosen.itemIds.includes(id)).length))
          : 0;
        const value = candidate.score - mostSharedItems * 16;
        if (value > bestValue) {
          bestValue = value;
          bestIndex = index;
        }
      }
      batch.push(pool.splice(bestIndex, 1)[0]);
    }
    diversified.push(...batch);
  }
  return diversified;
}

const scenes = ["上班", "约会", "休闲", "运动"];
const styleChoices = ["简约通勤", "温柔松弛", "清爽休闲", "法式复古", "街头感"];

function describeWeather(code: number) {
  if (code === 0) return { condition: "晴", icon: "☀️" };
  if (code <= 3) return { condition: code === 1 ? "大致晴朗" : "多云", icon: "⛅" };
  if (code === 45 || code === 48) return { condition: "有雾", icon: "🌫️" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: "有雨", icon: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: "有雪", icon: "🌨️" };
  if (code >= 95) return { condition: "雷雨", icon: "⛈️" };
  return { condition: "天气变化", icon: "🌤️" };
}

async function fetchWeatherDirectly(location: WeatherLocation): Promise<WeatherData> {
  let latitude = location.latitude;
  let longitude = location.longitude;
  let city = location.name?.trim() || "当前位置";

  if (location.city) {
    const knownCity = resolveKnownWeatherCity(location.city);
    if (knownCity) {
      latitude = knownCity.latitude;
      longitude = knownCity.longitude;
      city = knownCity.name;
    } else {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", location.city.trim().slice(0, 40));
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "zh");
      geoUrl.searchParams.set("format", "json");
      const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!geoResponse.ok) throw new Error("城市查询暂时不可用");
      const match = ((await geoResponse.json()) as WeatherGeocodingResponse).results?.[0];
      if (!match) throw new Error("没有找到这个城市，请换一个名称");
      latitude = match.latitude;
      longitude = match.longitude;
      city = [match.name, match.admin1].filter(Boolean).join(" · ");
    }
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") throw new Error("请提供当前位置或城市名称");
  latitude = Number(latitude.toFixed(2));
  longitude = Number(longitude.toFixed(2));
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(latitude));
  weatherUrl.searchParams.set("longitude", String(longitude));
  weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  weatherUrl.searchParams.set("forecast_days", "1");
  weatherUrl.searchParams.set("timezone", "auto");
  const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(12_000) });
  if (!weatherResponse.ok) throw new Error("天气服务暂时不可用");
  const forecast = (await weatherResponse.json()) as WeatherForecastResponse;
  if (!forecast.current) throw new Error("天气数据暂时不完整");

  return {
    city,
    latitude,
    longitude,
    temperature: Math.round(forecast.current.temperature_2m),
    apparentTemperature: Math.round(forecast.current.apparent_temperature),
    precipitation: Math.max(forecast.current.precipitation, forecast.daily?.precipitation_sum?.[0] ?? 0),
    windSpeed: Math.round(forecast.current.wind_speed_10m),
    weatherCode: forecast.current.weather_code,
    temperatureMax: Math.round(forecast.daily?.temperature_2m_max?.[0] ?? forecast.current.temperature_2m),
    temperatureMin: Math.round(forecast.daily?.temperature_2m_min?.[0] ?? forecast.current.temperature_2m),
    ...describeWeather(forecast.current.weather_code),
  };
}

async function fetchWeatherData(location: WeatherLocation) {
  const query = new URLSearchParams();
  if (location.city) query.set("city", location.city);
  if (typeof location.latitude === "number") query.set("latitude", String(location.latitude));
  if (typeof location.longitude === "number") query.set("longitude", String(location.longitude));
  if (location.name) query.set("name", location.name);
  const serverRequest = async () => {
    const response = await fetch(`/api/weather?${query.toString()}`, { cache: "no-store" });
    const data = await response.json() as WeatherData & { error?: string };
    if (response.ok && !data.error) return data;
    throw new Error(data.error ?? "天气获取失败");
  };
  try {
    return await Promise.any([serverRequest(), fetchWeatherDirectly(location)]);
  } catch (error) {
    if (error instanceof AggregateError) {
      const useful = error.errors.find((item) => item instanceof Error && (item.message.includes("没有找到") || item.message.includes("请提供")));
      if (useful instanceof Error) throw useful;
    }
    throw new Error("天气服务暂时不可用，请稍后重试");
  }
}

async function prepareUploadImage(file: File) {
  if (file.size <= 700 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  let output: Blob | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(300, Math.round(bitmap.width * scale));
    canvas.height = Math.max(300, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    output = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82 - attempt * 0.08));
    if (output && output.size <= 800 * 1024) break;
    scale *= 0.78;
  }
  bitmap.close();
  if (!output) throw new Error("图片压缩失败，请换一张照片");
  return new File([output], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

function GarmentArt({ garment, compact = false }: { garment: Garment; compact?: boolean }) {
  if (garment.image) {
    return <img className={`garment-photo${garment.isVirtual ? " demo-garment-photo" : ""}${compact ? " compact" : ""}`} src={garment.image} alt={garment.name} />;
  }
  return (
    <div className={`garment-art ${compact ? "compact" : ""}`} style={{ background: garment.color }} aria-hidden="true">
      <span className={`clothing-shape ${garment.category === "下装" ? "bottom" : garment.category === "鞋子" ? "shoe" : garment.category === "外套" ? "coat" : garment.category === "连衣裙" ? "dress" : "top"}`} />
    </div>
  );
}

export default function Home() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  }, []);
  const [account, setAccount] = useState<AccountData | null | undefined>(undefined);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [tab, setTab] = useState<Tab>("today");
  const [scene, setScene] = useState<string | null>(null);
  const [styles, setStyles] = useState<string[]>(["简约通勤", "清爽休闲"]);
  const [garments, setGarments] = useState(initialGarments);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherCityInput, setWeatherCityInput] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [bodyProfileOpen, setBodyProfileOpen] = useState(false);
  const [bodyHeight, setBodyHeight] = useState("");
  const [bodyWeight, setBodyWeight] = useState("");
  const [bodyShape, setBodyShape] = useState("匀称");
  const [modelPresentation, setModelPresentation] = useState("女生");
  const [fullBodyImageUrl, setFullBodyImageUrl] = useState<string | null>(null);
  const [fullBodyUploading, setFullBodyUploading] = useState(false);
  const [visualizingKey, setVisualizingKey] = useState<string | null>(null);
  const [visualizedLooks, setVisualizedLooks] = useState<Record<string, string>>({});
  const [visualizationErrors, setVisualizationErrors] = useState<Record<string, string>>({});
  const [expandedLook, setExpandedLook] = useState<ExpandedLook | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [requestConstraints, setRequestConstraints] = useState<RequestConstraints>({});
  const [wardrobeFilter, setWardrobeFilter] = useState("全部");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingGarmentId, setEditingGarmentId] = useState<number | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [uploadBatchTotal, setUploadBatchTotal] = useState(0);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [processedImageKey, setProcessedImageKey] = useState<string | null>(null);
  const [recognitionProvider, setRecognitionProvider] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [enhanceWithSeedream, setEnhanceWithSeedream] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [recognitionsRemaining, setRecognitionsRemaining] = useState<number | null>(null);
  const [newCategory, setNewCategory] = useState("上衣");
  const [newColor, setNewColor] = useState("米白");
  const [garmentDraft, setGarmentDraft] = useState<GarmentDraft>({ name: "", category: "上衣", colorName: "米白", colorHex: "#eeeae2", material: "待确认", pattern: "纯色", warmth: 2, styleTags: [], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["常规"], confidence: 0, warnings: [] });
  const [liked, setLiked] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [worn, setWorn] = useState<string[]>([]);
  const [inspirationSavedOnly, setInspirationSavedOnly] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasRealGarments = garments.some((item) => !item.isVirtual);
  const recommendationGarments = useMemo(() => hasRealGarments ? garments.filter((item) => !item.isVirtual) : garments.filter((item) => item.isVirtual), [garments, hasRealGarments]);
  const availableCount = recommendationGarments.filter((item) => !item.dirty).length;
  const filteredGarments = useMemo(
    () => recommendationGarments.filter((item) => wardrobeFilter === "全部" || (wardrobeFilter === "脏衣篓" ? item.dirty : item.category === wardrobeFilter)),
    [recommendationGarments, wardrobeFilter],
  );
  const generatedOutfits = useMemo(() => buildOutfits(recommendationGarments, scene, styles, requestConstraints, weather), [recommendationGarments, scene, styles, requestConstraints, weather]);
  const outfitSelection = useMemo(
    () => selectEligibleOutfits(generatedOutfits, disliked, rotation),
    [disliked, generatedOutfits, rotation],
  );
  const eligibleOutfits = outfitSelection.eligible;
  const outfits = outfitSelection.visible;
  const todayLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date());
  const currentSeason = [12, 1, 2].includes(new Date().getMonth() + 1) ? "冬季" : [3, 4, 5].includes(new Date().getMonth() + 1) ? "春季" : [6, 7, 8].includes(new Date().getMonth() + 1) ? "夏季" : "秋季";
  const visibleInspirationLooks = useMemo(() => {
    const genderLooks = inspirationLooks.filter((look) => look.gender === modelPresentation && !disliked.includes(`inspiration:${look.key}`));
    const suitable = genderLooks.filter((look) => weather
      ? weather.apparentTemperature >= look.minTemperature && weather.apparentTemperature <= look.maxTemperature
      : look.seasons.includes(currentSeason));
    const pool = suitable.length ? suitable : genderLooks;
    return inspirationSavedOnly ? pool.filter((look) => saved.includes(`inspiration:${look.key}`)) : pool;
  }, [currentSeason, disliked, inspirationSavedOnly, modelPresentation, saved, weather]);

  useEffect(() => {
    let active = true;
    async function establishSupabaseSession(accessToken: string) {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });
      const data = await response.json() as { user?: AccountData; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "登录状态验证失败");
      if (active) setAccount(data.user);
    }
    async function initializeAuth() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (window.location.hash.includes("type=recovery")) {
            setAuthView("reset");
            if (active) setAccount(null);
            return;
          }
          await establishSupabaseSession(data.session.access_token);
          return;
        }
      }
      const useChatGPT = new URLSearchParams(window.location.search).get("auth") === "chatgpt";
      if (useChatGPT) {
        const response = await fetch("/api/auth/me?provider=chatgpt", { cache: "no-store" });
        const data = response.ok ? await response.json() as { user?: AccountData } : null;
        if (active) setAccount(data?.user ?? null);
        return;
      }
      if (active) setAccount(null);
    }
    void initializeAuth().catch(() => { if (active) setAccount(null); });
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        void fetch("/api/auth/session", { method: "DELETE" });
        if (active) setAccount(null);
      } else if (event === "PASSWORD_RECOVERY") {
        setAuthView("reset");
        setAuthError("");
        setAuthNotice("验证成功，请设置一个新密码。");
        if (active) setAccount(null);
      } else if (session) {
        window.setTimeout(() => { void establishSupabaseSession(session.access_token).catch(() => { if (active) setAccount(null); }); }, 0);
      }
    }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!expandedLook) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpandedLook(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedLook]);

  useEffect(() => {
    if (!account) return;
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法连接你的衣柜");
        return response.json();
      })
      .then((data: { profile: ProfileData; garments: Garment[]; feedback: FeedbackRecord[]; chat: { activeRequest: string | null; constraints: RequestConstraints; messages: ChatMessage[] } }) => {
        setGarments(data.garments);
        setStyles(data.profile.preferredStyles.length ? data.profile.preferredStyles : ["简约通勤", "清爽休闲"]);
        setScene(data.profile.lastScene);
        const completedOnServer = Boolean(data.profile.onboardingCompleted);
        const completedOnThisDevice = window.localStorage.getItem(onboardingStorageKey(account.id)) === "1";
        if (completedOnServer) window.localStorage.setItem(onboardingStorageKey(account.id), "1");
        setOnboarding(!completedOnServer && !completedOnThisDevice);
        setLiked(data.feedback.filter((item) => item.action === "like").map((item) => item.outfitKey));
        setSaved(data.feedback.filter((item) => item.action === "save").map((item) => item.outfitKey));
        setDisliked(data.feedback.filter((item) => item.action === "dislike").map((item) => item.outfitKey));
        setWorn(data.feedback.filter((item) => item.action === "worn").map((item) => item.outfitKey));
        setActiveRequest(data.chat.activeRequest);
        setRequestConstraints(data.chat.constraints);
        setChatMessages(data.chat.messages);
        setBodyHeight(data.profile.bodyHeight ? String(data.profile.bodyHeight) : "");
        setBodyWeight(data.profile.bodyWeight ? String(data.profile.bodyWeight) : "");
        setBodyShape(data.profile.bodyShape ?? "匀称");
        setModelPresentation(data.profile.modelPresentation === "男性" || data.profile.modelPresentation === "男生" ? "男生" : "女生");
        setFullBodyImageUrl(data.profile.fullBodyImageUrl ?? null);
        if (typeof data.profile.weatherLatitude === "number" && typeof data.profile.weatherLongitude === "number") {
          void fetchWeatherData({ latitude: data.profile.weatherLatitude, longitude: data.profile.weatherLongitude, name: data.profile.weatherCity ?? "当前位置" })
            .then((savedWeather) => { setWeather(savedWeather); setWeatherCityInput(savedWeather.city.split(" · ")[0]); })
            .catch(() => showToast("上次城市的天气暂时无法更新"));
        }
      })
      .catch(() => showToast("当前使用演示数据，稍后会自动重试"))
      .finally(() => setLoading(false));
  }, [account]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function loadWeather(location: WeatherLocation, saveLocation = true) {
    setWeatherLoading(true);
    setLocationError("");
    setWeatherOpen(false);
    showToast("位置已提交，天气正在更新");
    try {
      const data = await fetchWeatherData(location);
      setWeather(data);
      setWeatherCityInput(data.city.split(" · ")[0]);
      setRotation(0);
      if (saveLocation) void persist({ action: "update_location", city: data.city, latitude: data.latitude, longitude: data.longitude }, true, true);
      showToast(`已更新 ${data.city} 的真实天气`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "天气获取失败，请稍后重试");
    } finally {
      setWeatherLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      const message = "当前浏览器不支持定位，请手动输入城市";
      setLocationError(message);
      showToast(message);
      return;
    }
    setWeatherLoading(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => { void loadWeather({ latitude: position.coords.latitude, longitude: position.coords.longitude, name: "当前位置" }); },
      (error) => {
        setWeatherLoading(false);
        const message = error.code === error.PERMISSION_DENIED
          ? "定位权限被拒绝。请在浏览器地址栏左侧的网站设置中，把“位置”改为“允许”，然后刷新页面。"
          : error.code === error.POSITION_UNAVAILABLE
            ? "设备暂时无法确定位置。请在手机或电脑的系统设置中，允许当前浏览器使用定位，然后刷新页面重试。"
            : error.code === error.TIMEOUT
              ? "定位请求超时。请检查网络后重试，或先手动输入城市。"
              : "暂时无法获得位置，请检查浏览器与系统定位权限。";
        setLocationError(message);
        showToast(message);
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function searchWeatherCity(event: FormEvent) {
    event.preventDefault();
    const city = weatherCityInput.trim();
    if (!city) return;
    await loadWeather({ city });
  }

  function toggleStyle(value: string) {
    setStyles((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function persist(action: Record<string, unknown>, quiet = false, background = false) {
    if (!background) setSaving(true);
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!response.ok) throw new Error("保存失败");
      const result = await response.json() as { ok?: boolean } | { profile: ProfileData; garments: Garment[]; feedback: FeedbackRecord[]; chat: { activeRequest: string | null; constraints: RequestConstraints; messages: ChatMessage[] } };
      if ("ok" in result && result.ok) return true;
      const data = result as { profile: ProfileData; garments: Garment[]; feedback: FeedbackRecord[]; chat: { activeRequest: string | null; constraints: RequestConstraints; messages: ChatMessage[] } };
      setGarments(data.garments);
      setStyles(data.profile.preferredStyles);
      setScene(data.profile.lastScene);
      setLiked(data.feedback.filter((item) => item.action === "like").map((item) => item.outfitKey));
      setSaved(data.feedback.filter((item) => item.action === "save").map((item) => item.outfitKey));
      setDisliked(data.feedback.filter((item) => item.action === "dislike").map((item) => item.outfitKey));
      setWorn(data.feedback.filter((item) => item.action === "worn").map((item) => item.outfitKey));
      setActiveRequest(data.chat.activeRequest);
      setRequestConstraints(data.chat.constraints);
      setChatMessages(data.chat.messages);
      setBodyHeight(data.profile.bodyHeight ? String(data.profile.bodyHeight) : "");
      setBodyWeight(data.profile.bodyWeight ? String(data.profile.bodyWeight) : "");
      setBodyShape(data.profile.bodyShape ?? "匀称");
      setModelPresentation(data.profile.modelPresentation === "男性" || data.profile.modelPresentation === "男生" ? "男生" : "女生");
      setFullBodyImageUrl(data.profile.fullBodyImageUrl ?? null);
      return true;
    } catch {
      if (!quiet) showToast("没有保存成功，请稍后重试");
      return false;
    } finally {
      if (!background) setSaving(false);
    }
  }

  async function completeOnboarding() {
    const ok = await persist({ action: "complete_onboarding", styles });
    if (ok) {
      if (account) window.localStorage.setItem(onboardingStorageKey(account.id), "1");
      setOnboarding(false);
      setOnboardingStep(0);
      return;
    }
    showToast("引导状态还没有保存，请检查网络后重试");
  }

  async function importLegacyWardrobe(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || legacyImporting) return;
    const manifest = selected.find((file) => file.name.toLowerCase().endsWith(".json"));
    const images = selected.filter((file) => /^image\//.test(file.type));
    if (!manifest || !images.length) {
      showToast("请选择备份清单和对应衣物图片");
      return;
    }
    setLegacyImporting(true);
    try {
      const form = new FormData();
      form.append("manifest", manifest);
      images.forEach((file) => form.append("images", file));
      const response = await fetch("/api/garments/import-legacy", { method: "POST", body: form });
      const data = await response.json() as { error?: string; imported?: number; skipped?: number };
      if (!response.ok) throw new Error(data.error ?? "旧衣柜导入失败");
      showToast(`已恢复 ${data.imported ?? 0} 件真实衣服${data.skipped ? `，跳过 ${data.skipped} 件重复衣服` : ""}`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "旧衣柜导入失败");
    } finally {
      setLegacyImporting(false);
    }
  }

  async function saveBodyProfile(event: FormEvent) {
    event.preventDefault();
    const height = Number(bodyHeight);
    const weight = Number(bodyWeight);
    if (!Number.isFinite(height) || height < 120 || height > 220 || !Number.isFinite(weight) || weight < 30 || weight > 200) {
      showToast("请填写有效的身高和体重");
      return;
    }
    const ok = await persist({ action: "update_body_profile", height, weight, bodyShape, modelPresentation });
    if (ok) {
      setVisualizedLooks({});
      setBodyProfileOpen(false);
      showToast("身体资料已保存，可以按需生成试穿效果");
    }
  }

  async function uploadFullBodyPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (selected.size > 12 * 1024 * 1024) {
      showToast("全身照不能超过 12MB");
      return;
    }
    setFullBodyUploading(true);
    try {
      const file = await prepareUploadImage(selected);
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/profile/full-body", { method: "POST", body: form });
      const data = await response.json() as { error?: string; imageUrl?: string };
      if (!response.ok || !data.imageUrl) throw new Error(data.error ?? "全身照上传失败");
      setFullBodyImageUrl(data.imageUrl);
      setVisualizedLooks({});
      showToast("全身照已保存，可以按需生成真人试穿");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "全身照上传失败");
    } finally {
      setFullBodyUploading(false);
    }
  }

  async function removeFullBodyPhoto() {
    setFullBodyUploading(true);
    try {
      const response = await fetch("/api/profile/full-body", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "全身照删除失败");
      setFullBodyImageUrl(null);
      setVisualizedLooks({});
      showToast("已删除全身照，恢复为假人模特");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "全身照删除失败");
    } finally {
      setFullBodyUploading(false);
    }
  }

  async function generateOutfitLook(outfit: Outfit) {
    if (!bodyHeight || !bodyWeight) {
      setBodyProfileOpen(true);
      showToast("请先填写身体资料");
      return;
    }
    setVisualizationErrors((current) => {
      const next = { ...current };
      delete next[outfit.key];
      return next;
    });
    setVisualizingKey(outfit.key);
    try {
      const response = await fetch("/api/outfits/visualize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: outfit.itemIds }),
      });
      const data = await response.json() as { error?: string; imageUrl?: string; needsProfile?: boolean; remaining?: number; developer?: boolean };
      if (!response.ok || !data.imageUrl) {
        if (data.needsProfile) setBodyProfileOpen(true);
        throw new Error(data.error ?? "AI 模特生成失败");
      }
      setVisualizedLooks((current) => ({ ...current, [outfit.key]: data.imageUrl! }));
      showToast(data.developer ? "AI 模特已生成 · 开发者模式不计次数" : typeof data.remaining === "number" ? `AI 模特已生成，今天还可生成 ${data.remaining} 次` : "AI 模特已生成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 模特生成失败";
      setVisualizationErrors((current) => ({ ...current, [outfit.key]: message }));
      showToast(message);
    } finally {
      setVisualizingKey(null);
    }
  }

  async function selectScene(nextScene: string | null) {
    setScene(nextScene);
    setRotation(0);
    await persist({ action: "update_scene", scene: nextScene }, true);
  }

  async function toggleDirty(id: number) {
    const item = garments.find((garment) => garment.id === id);
    const ok = await persist({ action: "toggle_dirty", garmentId: id });
    if (ok) showToast(item?.dirty ? "已恢复到可用衣柜" : "已放入脏衣篓，3 天内不再推荐");
  }

  function closeGarmentModal() {
    setUploadOpen(false);
    setEditingGarmentId(null);
    setUploadPreview(null);
    setUploadFile(null);
    setUploadQueue([]);
    setUploadBatchTotal(0);
    setImageKey(null);
    setProcessedImageKey(null);
  }

  function resetGarmentDraft() {
    setUploadPreview(null);
    setUploadFile(null);
    setImageKey(null);
    setProcessedImageKey(null);
    setRecognitionProvider(null);
    setNewCategory("上衣");
    setNewColor("米白");
    setGarmentDraft({ name: "", category: "上衣", colorName: "米白", colorHex: "#eeeae2", material: "待确认", pattern: "纯色", warmth: 2, styleTags: [], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["常规"], confidence: 0, warnings: [] });
  }

  function openAddGarment() {
    setEditingGarmentId(null);
    resetGarmentDraft();
    setUploadQueue([]);
    setUploadBatchTotal(0);
    setUploadOpen(true);
  }

  function openEditGarment(garment: Garment) {
    const metaParts = garment.meta.split(" · ");
    setEditingGarmentId(garment.id);
    setUploadPreview(garment.image ?? null);
    setUploadFile(null);
    setNewCategory(garment.category);
    setNewColor(garment.colorName);
    setGarmentDraft({
      name: garment.name,
      category: garment.category,
      colorName: garment.colorName,
      colorHex: garment.color,
      material: metaParts[0] ?? "待确认",
      pattern: metaParts[1] ?? "待确认",
      warmth: garment.warmth,
      styleTags: garment.styleTags,
      sceneTags: garment.sceneTags,
      weatherTags: garment.weatherTags,
      confidence: 100,
      warnings: [],
    });
    setUploadOpen(true);
  }

  function toggleGarmentScene(sceneName: string) {
    setGarmentDraft((current) => ({
      ...current,
      sceneTags: current.sceneTags.includes(sceneName)
        ? current.sceneTags.filter((item) => item !== sceneName)
        : [...current.sceneTags, sceneName],
    }));
  }

  async function deleteGarment(garment: Garment) {
    if (!window.confirm(`确定删除“${garment.name}”吗？真实衣物的照片也会一起删除。`)) return;
    const ok = await persist({ action: "delete_garment", garmentId: garment.id });
    if (ok) showToast("衣服及相关照片已删除");
  }

  async function prepareAndAnalyzeGarment(selected: File) {
    try {
      const file = await prepareUploadImage(selected);
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
      await analyzeSelectedFile(file);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "图片读取失败");
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []).slice(0, 10);
    event.target.value = "";
    if (!selectedFiles.length) return;
    const validFiles = selectedFiles.filter((file) => file.size <= 8 * 1024 * 1024);
    if (!validFiles.length) {
      showToast("每张图片不能超过 8MB");
      return;
    }
    if (validFiles.length < selectedFiles.length) showToast("已跳过超过 8MB 的图片");
    resetGarmentDraft();
    setUploadBatchTotal(validFiles.length);
    setUploadQueue(validFiles.slice(1));
    await prepareAndAnalyzeGarment(validFiles[0]);
  }

  async function analyzeSelectedFile(file = uploadFile) {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setImageKey(null);
    setProcessedImageKey(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("enhance", String(enhanceWithSeedream));
      const response = await fetch("/api/garments/analyze", { method: "POST", body: form });
      const data = await response.json() as { error?: string; analysis?: GarmentDraft; imageKey?: string; processedImageKey?: string | null; imageUrl?: string; recognitionProvider?: string; aiReady?: boolean; recognitionsRemaining?: number };
      if (!response.ok || !data.analysis || !data.imageKey) throw new Error(data.error ?? "没有获得识别结果");
      setGarmentDraft(data.analysis);
      setNewCategory(data.analysis.category);
      setNewColor(data.analysis.colorName);
      setImageKey(data.imageKey);
      setProcessedImageKey(data.processedImageKey ?? null);
      setRecognitionProvider(data.recognitionProvider ?? null);
      setAiReady(Boolean(data.aiReady));
      setRecognitionsRemaining(typeof data.recognitionsRemaining === "number" ? data.recognitionsRemaining : null);
      if (data.imageUrl) setUploadPreview(data.imageUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "图片识别失败，请稍后重试");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveGarment() {
    const colorMap: Record<string, string> = { 米白: "#eeeae2", 黑色: "#292927", 灰色: "#858681", 蓝色: "#66819b", 棕色: "#745b48", 其他: "#d8d0c2" };
    const ok = await persist({
      action: editingGarmentId === null ? "add_garment" : "update_garment",
      garmentId: editingGarmentId,
      name: garmentDraft.name.trim() || `${newColor}${newCategory}`,
      category: newCategory,
      color: garmentDraft.colorHex || colorMap[newColor] || colorMap.其他,
      colorName: newColor,
      material: garmentDraft.material,
      pattern: garmentDraft.pattern,
      warmth: garmentDraft.warmth,
      styleTags: garmentDraft.styleTags,
      sceneTags: garmentDraft.sceneTags,
      weatherTags: garmentDraft.weatherTags,
      imageKey,
      processedImageKey,
      recognitionProvider,
      recognitionConfidence: garmentDraft.confidence,
    });
    if (ok) {
      const wasEditing = editingGarmentId !== null;
      if (!wasEditing && uploadQueue.length) {
        const [nextFile, ...remainingFiles] = uploadQueue;
        setUploadQueue(remainingFiles);
        resetGarmentDraft();
        showToast(`这一件已保存，继续确认下一件（还剩 ${remainingFiles.length + 1} 件）`);
        await prepareAndAnalyzeGarment(nextFile);
      } else {
        const savedCount = uploadBatchTotal || 1;
        closeGarmentModal();
        setTab("wardrobe");
        showToast(wasEditing ? "衣服信息已更新" : savedCount > 1 ? `${savedCount} 件衣服已全部保存` : "衣服照片和你确认的信息已保存");
      }
    }
  }

  async function toggleCatalogItem(catalogKey: string) {
    const exists = garments.some((item) => item.catalogKey === catalogKey);
    const ok = await persist({ action: exists ? "remove_catalog" : "add_catalog", catalogKey });
    if (ok) showToast(exists ? "已从示范衣柜移除" : "已加入你的示范衣柜");
  }

  async function recordFeedback(outfitKey: string, feedbackAction: "like" | "save" | "dislike" | "worn") {
    const alreadyDisliked = disliked.includes(outfitKey);
    if (feedbackAction === "dislike" && !alreadyDisliked) {
      // Remove the card immediately; roll it back below if saving fails.
      setDisliked((current) => current.includes(outfitKey) ? current : [...current, outfitKey]);
      setVisualizedLooks((current) => {
        if (!(outfitKey in current)) return current;
        const next = { ...current };
        delete next[outfitKey];
        return next;
      });
      setVisualizationErrors((current) => {
        if (!(outfitKey in current)) return current;
        const next = { ...current };
        delete next[outfitKey];
        return next;
      });
    }
    const ok = await persist({ action: "feedback", outfitKey, feedbackAction });
    if (!ok && feedbackAction === "dislike" && !alreadyDisliked) {
      setDisliked((current) => current.filter((key) => key !== outfitKey));
      return;
    }
    if (ok) showToast(feedbackAction === "worn" ? "已记录：今天穿这套" : feedbackAction === "dislike" ? "收到，已换成下一套并更新偏好" : "你的偏好已经保存");
  }

  async function sendText(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || saving) return;
    setChatInput("");
    setChatMessages((current) => [...current, { id: Date.now(), role: "user", content: message }]);
    const ok = await persist({ action: "send_message", message });
    if (!ok) setChatInput(message);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    await sendText(chatInput);
  }

  async function clearRequest() {
    const ok = await persist({ action: "clear_request" });
    if (ok) showToast("本次对话要求已清除");
  }

  function readableAuthError(message: string) {
    if (/Invalid login credentials/i.test(message)) return "邮箱或密码不正确";
    if (/Email not confirmed/i.test(message)) return "请先打开验证邮件完成邮箱确认";
    if (/User already registered/i.test(message)) return "这个邮箱已经注册，请直接登录";
    if (/Password should be at least/i.test(message)) return "密码至少需要 6 位";
    if (/provider is not enabled|Unsupported provider/i.test(message)) return "该登录方式尚未在 Supabase 中开通";
    if (/Email rate limit exceeded|rate limit/i.test(message)) return "验证邮件发送过于频繁，请稍后再试";
    return message || "操作失败，请稍后重试";
  }

  async function submitEmailAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase || authBusy) return;
    const email = authEmail.trim().toLowerCase();
    if (authView !== "reset" && !email) return setAuthError("请输入邮箱");
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      if (authView === "reset") {
        if (authPassword.length < 6) throw new Error("Password should be at least 6 characters");
        const { error } = await supabase.auth.updateUser({ password: authPassword });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("重置链接已失效，请重新申请");
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: data.session.access_token }),
        });
        window.history.replaceState({}, "", window.location.pathname);
        window.location.reload();
      } else if (authView === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
        if (error) throw error;
        setAuthNotice("重置邮件已发送，请打开邮箱继续操作。测试阶段仅项目成员邮箱能收到邮件。");
      } else if (authView === "register") {
        if (authPassword.length < 6) throw new Error("Password should be at least 6 characters");
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword,
          options: { data: { display_name: authName.trim() || email.split("@")[0] }, emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setAuthPassword("");
        if (!data.session) setAuthNotice("注册成功，请打开验证邮件确认邮箱后再登录。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
        if (error) throw error;
        setAuthPassword("");
      }
    } catch (error) {
      setAuthError(readableAuthError(error instanceof Error ? error.message : "登录失败"));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signInWithSocial(provider: "google" | "github") {
    if (!supabase || authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/` } });
    if (error) {
      setAuthError(readableAuthError(error.message));
      setAuthBusy(false);
    }
  }

  async function signOutAccount() {
    if (account?.provider === "chatgpt") {
      window.location.href = "/signout-with-chatgpt?return_to=%2F";
      return;
    }
    setSaving(true);
    try {
      await supabase?.auth.signOut();
      await fetch("/api/auth/session", { method: "DELETE" });
      setAccount(null);
      setLoading(true);
    } finally {
      setSaving(false);
    }
  }

  function navTo(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (account === undefined) {
    return <main className="auth-shell"><div className="auth-card loading-auth"><span className="brand-mark">易</span><p>正在确认登录状态…</p></div></main>;
  }

  if (account === null) {
    return <main className="auth-shell auth-page"><section className="auth-card auth-form-card">
      <div className="auth-brand"><span className="brand-mark">易</span><div><strong>易搭</strong><small>你的个人 AI 衣柜</small></div></div>
      <div className="auth-heading"><p className="eyebrow">每天少纠结一点</p><h1>{authView === "register" ? "创建你的衣柜" : authView === "forgot" ? "找回密码" : authView === "reset" ? "设置新密码" : "欢迎回来"}</h1><p>{authView === "register" ? "注册后，衣柜、偏好和收藏会安全保存在你的账号中。" : authView === "forgot" ? "输入注册邮箱，我们会向你发送密码重置邮件。" : authView === "reset" ? "输入至少 6 位的新密码，保存后即可继续使用易搭。" : "登录后继续查看属于你的衣柜与穿搭建议。"}</p></div>
      {(authView === "login" || authView === "register") && <div className="auth-tabs"><button className={authView === "login" ? "active" : ""} onClick={() => { setAuthView("login"); setAuthError(""); setAuthNotice(""); }}>邮箱登录</button><button className={authView === "register" ? "active" : ""} onClick={() => { setAuthView("register"); setAuthError(""); setAuthNotice(""); }}>邮箱注册</button></div>}
      <form className="email-auth-form" onSubmit={submitEmailAuth}>
        {authView === "register" && <label>怎么称呼你<input type="text" value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="例如：晚晚" maxLength={30} autoComplete="name" /></label>}
        {authView !== "reset" && <label>邮箱<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required /></label>}
        {authView !== "forgot" && <label><span>密码{authView === "login" && <button type="button" onClick={() => { setAuthView("forgot"); setAuthError(""); setAuthNotice(""); }}>忘记密码？</button>}</span><div className="password-field"><input type={authPasswordVisible ? "text" : "password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={authView === "register" || authView === "reset" ? "至少 6 位" : "输入密码"} minLength={6} autoComplete={authView === "register" || authView === "reset" ? "new-password" : "current-password"} required /><button type="button" onClick={() => setAuthPasswordVisible((current) => !current)} aria-label={authPasswordVisible ? "隐藏密码" : "显示密码"}>{authPasswordVisible ? "隐藏" : "显示"}</button></div></label>}
        {authError && <p className="auth-message error" role="alert">{authError}</p>}
        {authNotice && <p className="auth-message notice" role="status">{authNotice}</p>}
        <button className="email-auth-submit" type="submit" disabled={authBusy || !supabase}>{authBusy ? "请稍候…" : authView === "register" ? "注册" : authView === "forgot" ? "发送重置邮件" : authView === "reset" ? "保存新密码" : "登录"}</button>
        {authView === "forgot" && <button className="auth-back-button" type="button" onClick={() => { setAuthView("login"); setAuthError(""); setAuthNotice(""); }}>返回邮箱登录</button>}
      </form>
      {(authView === "login" || authView === "register") && <><div className="auth-divider"><span>或者使用</span></div><div className="social-auth-buttons"><button onClick={() => signInWithSocial("google")} disabled={authBusy}><span className="google-mark">G</span>Google</button><button onClick={() => signInWithSocial("github")} disabled={authBusy}><span className="github-mark">●</span>GitHub</button></div></>}
      <small className="auth-terms">登录即表示你同意易搭保存衣柜、偏好与穿搭反馈；照片仍由你自主上传和删除。</small>
    </section><aside className="auth-visual" aria-hidden="true"><span className="auth-visual-logo">易搭</span><div className="auth-visual-copy"><p>天气、场景、可用衣物</p><h2>今天穿什么，<br />问问你的衣柜。</h2></div><div className="auth-outfit-cards"><i /><i /><i /></div></aside></main>;
  }

  return (
    <main className="app-shell">
      {(loading || saving) && <div className="sync-indicator"><span>{loading ? "正在打开你的衣柜…" : "正在保存…"}</span></div>}
      {!loading && onboarding && (
        <div className="onboarding">
          <div className="onboarding-brand"><span className="brand-mark">易</span><span>易搭</span></div>
          {onboardingStep === 0 && (
            <section className="onboarding-panel intro-panel">
              <div className="intro-visual" aria-hidden="true">
                <div className="closet-rail" />
                <span className="hanging-piece piece-one" />
                <span className="hanging-piece piece-two" />
                <span className="hanging-piece piece-three" />
                <div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div>
              </div>
              <p className="eyebrow">每天少纠结一点</p>
              <h1>衣服很多，<br />今天穿什么？</h1>
              <p className="lead">易搭会结合天气、可用衣服和你的偏好，从现有衣柜里直接选出今天能穿的搭配。</p>
              <button className="primary-button" onClick={() => setOnboardingStep(1)}>开始认识你 <span>→</span></button>
              <button className="text-button" onClick={completeOnboarding}>跳过，直接使用示范衣柜</button>
            </section>
          )}
          {onboardingStep === 1 && (
            <section className="onboarding-panel preference-panel">
              <div className="step-line"><span className="active" /><span /><span /></div>
              <p className="eyebrow">先从感觉开始</p>
              <h2>你平时更喜欢<br />哪种穿衣感觉？</h2>
              <p className="supporting">可以多选，以后随时能修改。</p>
              <div className="style-grid">
                {styleChoices.map((item, index) => (
                  <button key={item} className={`style-choice choice-${index + 1} ${styles.includes(item) ? "selected" : ""}`} onClick={() => toggleStyle(item)}>
                    <span className="style-swatch" /><span>{item}</span>{styles.includes(item) && <b>✓</b>}
                  </button>
                ))}
              </div>
              <button className="primary-button" disabled={!styles.length} onClick={() => setOnboardingStep(2)}>下一步 <span>→</span></button>
            </section>
          )}
          {onboardingStep === 2 && (
            <section className="onboarding-panel ready-panel">
              <div className="step-line"><span className="active" /><span className="active" /><span className="active" /></div>
              <div className="weather-orb"><span>{weather?.icon ?? "🌤️"}</span><strong>{weather ? `${weather.temperature}°` : "--°"}</strong><small>{weather ? `${weather.city} · ${weather.condition}` : "进入后设置真实天气"}</small></div>
              <p className="eyebrow">准备好了</p>
              <h2>今天的第一套，<br />已经为你搭好</h2>
              <p className="lead">当前使用 8 件演示单品。之后上传真实衣服，推荐会越来越像你。</p>
              <button className="primary-button" onClick={completeOnboarding}>进入易搭 <span>→</span></button>
              <button className="text-button" onClick={() => setOnboardingStep(1)}>返回修改偏好</button>
            </section>
          )}
        </div>
      )}

      <aside className="desktop-sidebar" aria-label="易搭功能导航">
        <button className="desktop-brand" onClick={() => navTo("today")}><span className="brand-mark">易</span><span><strong>易搭</strong><small>AI 穿搭助手</small></span></button>
        <nav>
          <button className={tab === "today" ? "active" : ""} onClick={() => navTo("today")}><span>⌂</span><b>首页</b></button>
          <button className={tab === "wardrobe" ? "active" : ""} onClick={() => navTo("wardrobe")}><span>▦</span><b>个人衣柜</b><em>{recommendationGarments.length}</em></button>
          <button className={tab === "discover" && !inspirationSavedOnly ? "active" : ""} onClick={() => { setInspirationSavedOnly(false); navTo("discover"); }}><span>✦</span><b>穿搭参考</b></button>
          <button className={tab === "discover" && inspirationSavedOnly ? "active" : ""} onClick={() => { setInspirationSavedOnly(true); navTo("discover"); }}><span>♡</span><b>我的收藏</b><em>{saved.filter((key) => key.startsWith("inspiration:")).length}</em></button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => navTo("profile")}><span>○</span><b>我的</b></button>
        </nav>
        <section className="sidebar-progress"><div><span>风格档案</span><strong>{styles.length ? "正在形成" : "等待了解"}</strong></div><div className="sidebar-progress-bar"><i style={{ width: `${Math.min(92, 28 + liked.length * 6)}%` }} /></div><small>每一次喜欢与不喜欢，都会让推荐更像你。</small></section>
        <button className="sidebar-profile" onClick={() => navTo("profile")}><span>{account.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.name.includes("@") ? "易搭用户" : account.name}</strong><small>{account.email}</small></div><b>›</b></button>
      </aside>

      <div className="workspace-main">

      <header className="topbar">
        <button className="logo" onClick={() => navTo("today")} aria-label="返回首页"><span className="brand-mark">易</span><span>{tab === "today" ? "对话" : tab === "wardrobe" ? "个人衣柜" : tab === "discover" ? (inspirationSavedOnly ? "我的收藏" : "穿搭参考") : "我的"}</span></button>
        <div className="top-actions"><button className="weather-top-button" onClick={() => setWeatherOpen(true)}><span>{weather?.icon ?? "🌤️"}</span><strong>{weather ? `${weather.temperature}℃ · ${weather.city}` : "设置天气"}</strong></button><button className="avatar" onClick={() => navTo("profile")} aria-label="个人中心">{account.name.slice(0, 1).toUpperCase()}</button></div>
      </header>

      {tab === "today" && (
        <section className="screen today-screen">
          <section className="assistant-home" aria-labelledby="assistant-home-title">
            <div className="assistant-home-copy"><span className="home-mode">✦ 衣橱模式</span><p>{todayLabel}</p><h1 id="assistant-home-title">今天想穿成什么感觉？</h1><p>告诉我场景、心情或任何具体要求。我会结合天气、脏衣篓和你的真实衣柜来推荐。</p></div>
            {chatMessages.length > 0 && <div className="home-conversation" aria-live="polite">{chatMessages.slice(-2).map((message) => <div key={`home-${message.id}-${message.createdAt ?? "now"}`} className={`home-message ${message.role}`}>{message.role === "assistant" && <span>易</span>}<p>{message.content}</p></div>)}</div>}
            <div className="home-quick-prompts">{["上班见客户，利落一点", "周末和朋友吃饭", "今天想穿得显高", "不想穿得太正式"].map((prompt) => <button key={prompt} onClick={() => sendText(prompt)}>{prompt}</button>)}</div>
            <form className="home-chat-input" onSubmit={sendMessage}>
              <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="例如：今晚和朋友吃饭，想舒服一点，但不要太随意……" maxLength={500} aria-label="输入你的穿搭需求" rows={2} />
              <div><button type="button" className="chat-add-button" onClick={() => navTo("wardrobe")} aria-label="前往添加衣服">＋</button><span>会自动参考天气与可用衣物</span><button type="submit" className="home-send-button" disabled={!chatInput.trim() || saving} aria-label="发送穿搭需求">↑</button></div>
            </form>
          </section>

          <div className="home-section-divider"><span>或者快速选择场景</span></div>
          <div className="greeting-row">
            <div><p className="date-label">{todayLabel}</p><h1>晚上好，晚晚</h1></div>
            <button className="weather-pill" onClick={() => setWeatherOpen(true)} aria-label="设置天气"><span>{weather?.icon ?? "🌤️"}</span><div><strong>{weather ? `${weather.temperature}℃` : "设置天气"}</strong><small>{weather ? `${weather.condition} · ${weather.city}` : "定位或选择城市"}</small></div></button>
          </div>

          <div className="context-card">
            <div><span className="status-dot" />{weather ? "真实天气已更新" : "等待设置真实天气"}</div>
            <p>{weather ? `${weather.temperatureMin}—${weather.temperatureMax}℃，体感 ${weather.apparentTemperature}℃，${weather.precipitation > 0.1 ? "今天可能有雨" : "当前无明显降雨"}${weather.windSpeed >= 25 ? "，风力较明显" : ""}。` : "选择当前位置或城市后，天气会直接参与穿搭推荐。"}</p>
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">可选，不选也能推荐</p><h2>今天准备去哪里？</h2></div>
            {scene && <button className="clear-button" onClick={() => selectScene(null)}>清除</button>}
          </div>
          <div className="scene-row">
            {scenes.map((item) => <button key={item} className={scene === item ? "scene-chip selected" : "scene-chip"} onClick={() => selectScene(scene === item ? null : item)}>{item === "上班" ? "▣" : item === "约会" ? "♡" : item === "休闲" ? "☕" : "◌"}<span>{item}</span></button>)}
            <button className="scene-chip" onClick={() => showToast("以后可以用一句话描述自定义场景")}><span className="plus">＋</span><span>其他</span></button>
          </div>

          <div className={`chat-request-card ${activeRequest ? "active" : ""}`}>
            <button className="chat-request-main" onClick={() => setChatOpen(true)}>
              <span className="assistant-mark">易</span>
              <div><small>{activeRequest ? "易搭正在按你的要求推荐" : "不想选标签？直接告诉易搭"}</small><strong>{activeRequest ? `“${activeRequest}”` : "今晚见朋友，想舒服但有精神一点…"}</strong></div>
              <b>›</b>
            </button>
            {activeRequest && <button className="request-clear" onClick={clearRequest}>清除要求</button>}
          </div>

          <div className="recommendation-heading">
            <div><p className="eyebrow">{hasRealGarments ? "仅使用你的真实衣柜" : scene ? `已加入“${scene}”场景` : "固定示范衣柜体验"}</p><h2>今天为你搭好了</h2></div>
            <button className="refresh-button" onClick={() => {
              if (eligibleOutfits.length <= 3) {
                showToast(`当前还剩 ${eligibleOutfits.length} 组未排除的有效搭配，多上传不同类别的衣服会更丰富`);
                return;
              }
              setRotation((current) => (current + 3) % eligibleOutfits.length);
              showToast("已换成另一组搭配");
            }}>↻ 换一组</button>
          </div>

          <div className="outfit-stack">
            {outfits.length ? outfits.map((outfit, index) => {
              const outfitGarments = outfit.itemIds.map((id) => recommendationGarments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item));
              return (
                <article className={`outfit-card outfit-${index + 1}`} key={outfit.key}>
                  <div className="outfit-visual real-outfit-visual">
                    <div className="match-label"><span>✦</span>{outfit.score}% 匹配</div>
                    <div className={`real-look-layout ${hasRealGarments ? "" : "demo-look-layout"}`}>
                      <div className={`real-piece-grid pieces-${Math.min(outfitGarments.length, 4)}`} aria-label={`本套推荐衣物，共 ${outfitGarments.length} 件`}>
                        {outfitGarments.map((garment) => <div className="real-piece" key={garment.id}>{garment.image ? <img src={garment.image} alt={garment.name} /> : <GarmentArt garment={garment} compact />}<span>{garment.name}</span></div>)}
                      </div>
                      {hasRealGarments && <div className="model-panel effect-panel">
                        {visualizedLooks[outfit.key] ? <><button className="generated-model-button" onClick={() => setExpandedLook({ imageUrl: visualizedLooks[outfit.key], title: outfit.title, items: outfit.items, mode: fullBodyImageUrl ? "本人试穿" : `${modelPresentation}假人` })} aria-label={`放大查看“${outfit.title}”试穿效果`}><img className="generated-model" src={visualizedLooks[outfit.key]} alt={`${outfit.title} ${fullBodyImageUrl ? "真人" : "假人模特"}试穿效果`} /><span className="zoom-hint">⌕ 点击放大</span></button><span className="tryon-mode-badge">{fullBodyImageUrl ? "本人试穿" : `${modelPresentation}假人`}</span></> : <>
                          {visualizingKey === outfit.key ? <div className="effect-status" role="status"><span className="effect-spinner">✦</span><strong>正在生成并质检</strong><small>系统会检查腿脚和鞋子是否完整<br />不合格将自动修复</small></div> : <button className="effect-trigger" onClick={() => generateOutfitLook(outfit)} aria-label={`生成“${outfit.title}”的穿搭效果图`} title={visualizationErrors[outfit.key]}><span>✦</span><strong>{visualizationErrors[outfit.key] ? "重新生成" : "效果图"}</strong><small className={visualizationErrors[outfit.key] ? "effect-error" : ""}>{visualizationErrors[outfit.key] ?? (bodyHeight && bodyWeight ? "点击生成模特试穿" : "先填写身体资料")}</small></button>}
                        </>}
                      </div>}
                    </div>
                    <button className={`save-float ${saved.includes(outfit.key) ? "active" : ""}`} onClick={() => recordFeedback(outfit.key, "save")} aria-label="收藏搭配">{saved.includes(outfit.key) ? "♥" : "♡"}</button>
                  </div>
                  <div className="outfit-content">
                    <div className="outfit-title-row"><div><span className="outfit-tag">{outfit.tag}</span><h3>{outfit.title}</h3></div><button className="tiny-button" onClick={() => showToast("已为你准备单品替换选项")}>换一件</button></div>
                    <p className="outfit-items">{outfit.items}</p>
                    <p className="outfit-reason">{outfit.reason}</p>
                    <div className="feedback-row">
                      <button className={liked.includes(outfit.key) ? "active" : ""} onClick={() => recordFeedback(outfit.key, "like")}>♡ 喜欢</button>
                      <button onClick={() => recordFeedback(outfit.key, "dislike")}>不适合我</button>
                      <button className={`wear-button ${worn.includes(outfit.key) ? "active" : ""}`} onClick={() => recordFeedback(outfit.key, "worn")}>{worn.includes(outfit.key) ? "✓ 已穿" : "今天穿这套"}</button>
                    </div>
                  </div>
                </article>
              );
            }) : <div className="empty-state recommendation-empty"><span>▦</span><h3>{generatedOutfits.length ? "当前有效搭配已经看完了" : hasRealGarments ? "真实衣柜还缺少可搭配的衣服" : "还缺少搭配需要的衣服"}</h3><p>{generatedOutfits.length ? "你点过“不适合我”的组合不会再次出现。上传不同类别的衣服后，会产生新的搭配。" : "需要“上衣＋下装”或连衣裙，再搭配一双鞋。"}</p><button className="upload-button" onClick={hasRealGarments ? openAddGarment : () => setCatalogOpen(true)}>{hasRealGarments ? "继续上传真实衣服" : "从示范衣柜添加"}</button></div>}
          </div>
        </section>
      )}

      {tab === "wardrobe" && (
        <section className="screen wardrobe-screen">
          <div className="page-title-row"><div><p className="eyebrow">你的数字衣橱</p><h1>我的衣柜</h1><p>{availableCount} 件可用 · {garments.length - availableCount} 件在脏衣篓</p></div><button className="upload-button" onClick={openAddGarment}>＋ 添加衣服</button></div>
          {hasRealGarments ? <div className="real-wardrobe-notice"><span>✓</span><div><strong>已切换为你的真实衣柜</strong><small>固定示范衣服已隐藏，不会参与你的私人推荐</small></div></div> : <button className="virtual-closet-entry" onClick={() => setCatalogOpen(true)}><span>▦</span><div><strong>查看固定示范衣柜</strong><small>使用真实衣服照片；上传自己的衣服后自动关闭</small></div><b>›</b></button>}
          <div className="wardrobe-summary">
            <div><span className="summary-icon">✦</span><div><strong>本周穿到 7 件</strong><small>比上周多激活 2 件旧衣服</small></div></div><span className="progress-ring">68%</span>
          </div>
          <div className="filter-row">
            {["全部", "上衣", "下装", "连衣裙", "外套", "鞋子", "脏衣篓"].map((filter) => <button key={filter} className={wardrobeFilter === filter ? "active" : ""} onClick={() => setWardrobeFilter(filter)}>{filter}</button>)}
          </div>
          {filteredGarments.length ? (
            <div className="garment-grid">
              {filteredGarments.map((garment) => (
                <article className={`garment-card ${garment.dirty ? "dirty" : ""}`} key={garment.id}>
                  <GarmentArt garment={garment} />
                  {garment.dirty && <span className="dirty-badge">清洗中</span>}
                  <div className="garment-copy"><small>{garment.category} · {garment.colorName}</small><h3>{garment.name}</h3><p>{garment.meta}</p><div className="scene-tags" aria-label="适用场景">{(garment.sceneTags.length ? garment.sceneTags : ["日常"]).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{garment.sceneTags.length > 3 && <span>+{garment.sceneTags.length - 3}</span>}</div><div className="garment-actions"><button onClick={() => toggleDirty(garment.id)}>{garment.dirty ? "恢复可用" : "放入脏衣篓"}</button><button onClick={() => openEditGarment(garment)}>编辑</button><button className="danger" onClick={() => deleteGarment(garment)}>删除</button></div></div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><span>♨</span><h3>脏衣篓是空的</h3><p>放进去的衣服 3 天内不会参与推荐。</p></div>}
        </section>
      )}

      {tab === "discover" && (
        <section className="screen discover-screen">
          <div className="page-title-row inspiration-heading"><div><p className="eyebrow">为你筛过天气与季节</p><h1>{inspirationSavedOnly ? "我的收藏" : "穿搭参考"}</h1><p>{inspirationSavedOnly ? "你收下的风格灵感都在这里。" : `当前按 ${modelPresentation} · ${weather ? `体感 ${weather.apparentTemperature}℃` : currentSeason} · ${styles.slice(0, 2).join(" / ")} 推荐。`}</p></div>{!inspirationSavedOnly && <button className="filter-summary" onClick={() => setBodyProfileOpen(true)}>调整性别与身材</button>}</div>
          {visibleInspirationLooks.length ? <div className="inspiration-grid">
            {visibleInspirationLooks.map((look) => {
              const feedbackKey = `inspiration:${look.key}`;
              return <article className="inspiration-card" key={look.key}>
                <div className="inspiration-photo"><img src={look.image} alt={look.title} /><span>{look.seasons.join(" / ")} · {look.minTemperature}—{look.maxTemperature}℃</span><button className={saved.includes(feedbackKey) ? "saved" : ""} onClick={() => recordFeedback(feedbackKey, "save")} aria-label="收藏这套参考">{saved.includes(feedbackKey) ? "♥" : "♡"}</button></div>
                <div className="inspiration-copy"><div className="inspiration-tags">{look.styles.map((style) => <span key={style}>{style}</span>)}</div><h2>{look.title}</h2><p>{look.subtitle}</p><small>适合：{look.scenes.join(" · ")}</small><div className="inspiration-actions"><button className={liked.includes(feedbackKey) ? "active" : ""} onClick={() => recordFeedback(feedbackKey, "like")}>♡ 喜欢</button><button onClick={() => recordFeedback(feedbackKey, "dislike")}>不感兴趣</button><a href={look.sourceUrl} target="_blank" rel="noreferrer">图片：{look.sourceName} ↗</a></div></div>
              </article>;
            })}
          </div> : <div className="empty-state inspiration-empty"><span>♡</span><h3>{inspirationSavedOnly ? "还没有收藏穿搭参考" : "这一批参考已经看完了"}</h3><p>{inspirationSavedOnly ? "在穿搭参考中点击收藏，喜欢的风格会出现在这里。" : "你反馈的信息已经保存，下一批会更贴近你的偏好。"}</p>{inspirationSavedOnly && <button className="upload-button" onClick={() => setInspirationSavedOnly(false)}>去看看穿搭参考</button>}</div>}
          <div className="inspiration-note"><strong>为什么暂时不是小红书图片？</strong><p>当前先使用有明确授权来源的公开图片验证推荐闭环。正式接入小红书等平台内容前，需要获得开放接口或内容授权，不能直接抓取和搬运。</p></div>
        </section>
      )}

      {tab === "profile" && (
        <section className="screen profile-screen">
          <div className="profile-hero"><div className="large-avatar">{account.name.slice(0, 1).toUpperCase()}</div><div><h1>{account.name.includes("@") ? "易搭用户" : account.name}</h1><p>{account.email}</p></div><button onClick={() => { setOnboarding(true); setOnboardingStep(0); }}>重新体验引导</button></div>
          <div className="stat-grid"><div><strong>{recommendationGarments.length}</strong><span>{hasRealGarments ? "真实单品" : "体验单品"}</span></div><div><strong>{saved.length}</strong><span>收藏搭配</span></div><div><strong>{worn.length + 7}</strong><span>本月已穿</span></div></div>
          <section className="profile-section"><div className="section-heading"><div><p className="eyebrow">最近 30 天</p><h2>穿搭记录</h2></div><button className="clear-button">查看全部</button></div><div className="history-list"><div><span className="history-date">今天</span><div className="mini-palette"><i style={{ background: "#b8cbd4" }} /><i style={{ background: "#595b5c" }} /><i style={{ background: "#e7ddca" }} /></div><p>雨天也清爽</p><b>已穿 ✓</b></div><div><span className="history-date">周六</span><div className="mini-palette"><i style={{ background: "#d9c8ad" }} /><i style={{ background: "#66819b" }} /></div><p>舒服不费力</p><b>已收藏</b></div></div></section>
          <section className="settings-list"><button onClick={() => setBodyProfileOpen(true)}><span>♙</span><div><strong>AI 模特身体资料</strong><small>{bodyHeight && bodyWeight ? `${bodyHeight}cm · ${bodyWeight}kg · ${bodyShape}` : "填写身高、体重和身材特点"}</small></div><b>›</b></button><button><span>♡</span><div><strong>我的偏爱穿搭</strong><small>收藏与喜欢过的搭配</small></div><b>›</b></button><button><span>♨</span><div><strong>脏衣篓设置</strong><small>默认 3 天后恢复可用</small></div><b>›</b></button><button><span>◌</span><div><strong>个人偏好</strong><small>{styles.join("、")}</small></div><b>›</b></button><label className="legacy-import-setting"><span>⇧</span><div><strong>{legacyImporting ? "正在恢复旧衣柜…" : "导入旧衣柜备份"}</strong><small>恢复旧站真实衣物，不消耗识图次数</small></div><b>›</b><input type="file" accept="application/json,image/jpeg,image/png,image/webp" multiple disabled={legacyImporting} onChange={importLegacyWardrobe} /></label><button><span>⌁</span><div><strong>隐私与数据</strong><small>定位、照片与删除设置</small></div><b>›</b></button><button className="logout-setting" onClick={signOutAccount}><span>↪</span><div><strong>退出登录</strong><small>退出当前账号并返回登录页</small></div><b>›</b></button></section>
        </section>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={tab === "today" ? "active" : ""} onClick={() => navTo("today")}><span>⌂</span>今日</button>
        <button className={tab === "wardrobe" ? "active" : ""} onClick={() => navTo("wardrobe")}><span>▦</span>衣柜</button>
        <button className="center-action assistant-action" onClick={() => setChatOpen(true)} aria-label="打开易搭助手"><span>易</span><small>问易搭</small></button>
        <button className={tab === "discover" ? "active" : ""} onClick={() => navTo("discover")}><span>✦</span>发现</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => navTo("profile")}><span>○</span>我的</button>
      </nav>
      </div>

      {weatherOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWeatherOpen(false); }}>
          <div className="upload-modal weather-modal" role="dialog" aria-modal="true" aria-labelledby="weather-title">
            <div className="modal-handle" />
            <div className="modal-heading"><div><p className="eyebrow">让推荐适合今天</p><h2 id="weather-title">设置天气位置</h2></div><button onClick={() => setWeatherOpen(false)} aria-label="关闭">×</button></div>
            <p className="weather-explanation">易搭会读取温度、体感、降雨和风速，只在你主动点击后申请定位。</p>
            <button className="location-button" disabled={weatherLoading} onClick={useCurrentLocation}><span>⌖</span><div><strong>{weatherLoading ? "正在获取天气…" : "使用我的当前位置"}</strong><small>只保存城市和小数点后两位的模糊坐标</small></div></button>
            {locationError && <div className="location-help" role="alert"><strong>定位没有成功</strong><p>{locationError}</p><small>修改权限后需要刷新本页面再试；你也可以继续使用下方的城市输入。</small></div>}
            <div className="weather-divider"><span>或者手动选择</span></div>
            <form className="city-search" onSubmit={searchWeatherCity}><input value={weatherCityInput} onChange={(event) => setWeatherCityInput(event.target.value)} placeholder="输入城市，例如：上海" maxLength={40} aria-label="城市名称" /><button type="submit" disabled={weatherLoading || !weatherCityInput.trim()}>查询</button></form>
            <p className="weather-source">天气数据由 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> 提供；服务异常时仍可使用常规推荐。</p>
          </div>
        </div>
      )}

      {bodyProfileOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBodyProfileOpen(false); }}>
          <form className="upload-modal body-profile-modal" role="dialog" aria-modal="true" aria-labelledby="body-profile-title" onSubmit={saveBodyProfile}>
            <div className="modal-handle" />
            <div className="modal-heading"><div><p className="eyebrow">建立你的专属比例</p><h2 id="body-profile-title">AI 模特身体资料</h2></div><button type="button" onClick={() => setBodyProfileOpen(false)} aria-label="关闭">×</button></div>
            <p className="body-profile-note">未上传本人照片时，系统生成不露脸假人模特；自愿上传全身照后，系统会生成真人试穿。结果是搭配示意，不代表服装的精确尺码效果。</p>
            <div className="form-row"><label>身高（cm）<input type="number" min="120" max="220" value={bodyHeight} onChange={(event) => setBodyHeight(event.target.value)} placeholder="例如 165" required /></label><label>体重（kg）<input type="number" min="30" max="200" value={bodyWeight} onChange={(event) => setBodyWeight(event.target.value)} placeholder="例如 55" required /></label></div>
            <fieldset className="profile-choice-group"><legend>性别 <small>用于选择假人模特的基础轮廓</small></legend><div className="gender-options">{[{ value: "女生", mark: "♀" }, { value: "男生", mark: "♂" }].map((item) => <button type="button" key={item.value} className={modelPresentation === item.value ? "selected" : ""} aria-pressed={modelPresentation === item.value} onClick={() => setModelPresentation(item.value)}><span>{item.mark}</span><strong>{item.value}</strong></button>)}</div></fieldset>
            <fieldset className="profile-choice-group body-shape-group"><legend>身材特点 <small>选择最接近的轮廓即可，不需要完全一致</small></legend><div className="body-shape-options">{[
              { value: "偏瘦", hint: "肩、腰、胯都较窄" },
              { value: "匀称", hint: "肩胯接近，腰线自然" },
              { value: "肩宽", hint: "肩部明显宽于胯部" },
              { value: "梨形", hint: "胯部宽于肩部" },
              { value: "苹果形", hint: "腰腹轮廓较明显" },
              { value: "曲线型", hint: "肩胯接近，腰线突出" },
            ].map((item) => <button type="button" key={item.value} className={`body-shape-option shape-${item.value} ${bodyShape === item.value ? "selected" : ""}`} aria-pressed={bodyShape === item.value} onClick={() => setBodyShape(item.value)}><span className="body-reference" aria-hidden="true"><i className="body-reference-head" /><i className="body-reference-torso" /><i className="body-reference-legs" /></span><span><strong>{item.value}</strong><small>{item.hint}</small></span>{bodyShape === item.value && <b>✓</b>}</button>)}</div></fieldset>
            <section className="person-reference-section" aria-label="本人全身照">
              <div><strong>本人试穿照片</strong><small>可选；建议正面站立、全身入镜、光线清楚</small></div>
              {fullBodyImageUrl ? <div className="person-reference-ready"><img src={fullBodyImageUrl} alt="已上传的本人全身参考照" /><span><b>已启用真人试穿</b><small>照片仅用于生成你的试穿效果</small></span><button type="button" disabled={fullBodyUploading} onClick={removeFullBodyPhoto}>删除</button></div> : <label className="person-reference-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadFullBodyPhoto} disabled={fullBodyUploading} /><span>{fullBodyUploading ? "正在上传…" : "＋ 上传本人全身照"}</span></label>}
            </section>
            <button className="primary-button" type="submit" disabled={saving}>保存身体资料</button>
            <p className="body-profile-limit">AI 模特由 Seedream 生成，普通用户每天最多生成 10 套，开发者账号不限次数；相同搭配会直接使用已生成结果。</p>
          </form>
        </div>
      )}

      {chatOpen && (
        <div className="modal-backdrop chat-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChatOpen(false); }}>
          <div className="chat-modal" role="dialog" aria-modal="true" aria-labelledby="chat-title">
            <div className="modal-handle" />
            <header className="chat-header"><div className="assistant-mark">易</div><div><h2 id="chat-title">易搭穿搭助手</h2><p><span />在线 · 会结合天气和你的衣柜</p></div><button onClick={() => setChatOpen(false)} aria-label="关闭">×</button></header>
            <div className="chat-messages">
              <div className="message assistant"><span className="mini-assistant">易</span><p>告诉我你今天要去哪里、想穿成什么感觉，也可以直接说“不想穿什么”。</p></div>
              {chatMessages.map((message) => <div key={`${message.id}-${message.createdAt ?? "now"}`} className={`message ${message.role}`}>
                {message.role === "assistant" && <span className="mini-assistant">易</span>}<p>{message.content}</p>
              </div>)}
              {saving && <div className="message assistant thinking"><span className="mini-assistant">易</span><p><i /><i /><i /></p></div>}
            </div>
            <div className="quick-prompts">
              {["今晚和朋友吃饭，不要太正式", "今天有点冷，想更保暖", "上班见客户，要利落一点", "今天不想穿裙子"].map((prompt) => <button key={prompt} onClick={() => sendText(prompt)}>{prompt}</button>)}
            </div>
            <form className="chat-input-row" onSubmit={sendMessage}>
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="说说你今天想怎么穿…" maxLength={500} aria-label="输入穿搭需求" />
              <button type="submit" disabled={!chatInput.trim() || saving} aria-label="发送">↑</button>
            </form>
            <p className="chat-capability-note">当前能理解场景、冷暖、正式度、颜色和不想穿的单品。</p>
          </div>
        </div>
      )}

      {catalogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogOpen(false); }}>
          <div className="upload-modal catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <div className="modal-handle" />
            <div className="modal-heading"><div><p className="eyebrow">固定示范衣柜</p><h2 id="catalog-title">用真实衣服体验搭配</h2><p>这些是固定示范衣物，可自由添加或移除；上传自己的衣服后将不再参与推荐。</p></div><button onClick={() => setCatalogOpen(false)} aria-label="关闭">×</button></div>
            <div className="catalog-grid">
              {virtualCatalog.map((item, index) => {
                const selected = garments.some((garment) => garment.catalogKey === item.key);
                const preview: Garment = { id: index, catalogKey: item.key, ...item, isVirtual: true, dirty: false };
                return <button key={item.key} className={selected ? "catalog-item selected" : "catalog-item"} onClick={() => toggleCatalogItem(item.key)}><GarmentArt garment={preview} compact /><span><strong>{item.name}</strong><small>{item.category} · {item.meta}</small></span><b>{selected ? "✓" : "＋"}</b></button>;
              })}
            </div>
            <button className="primary-button" onClick={() => setCatalogOpen(false)}>完成，看看新的推荐</button>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeGarmentModal(); }}>
          <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
            <div className="modal-handle" /><div className="modal-heading"><div><p className="eyebrow">{editingGarmentId === null ? "放进你的数字衣柜" : "修改衣物信息"}</p><h2 id="upload-title">{editingGarmentId === null ? uploadBatchTotal > 1 ? "批量添加衣服" : "添加衣服" : "编辑这件衣服"}</h2>{editingGarmentId === null && uploadBatchTotal > 1 && <small className="batch-progress">正在确认第 {uploadBatchTotal - uploadQueue.length} / {uploadBatchTotal} 件</small>}</div><button onClick={closeGarmentModal} aria-label="关闭">×</button></div>
            {editingGarmentId !== null && uploadPreview && <div className="edit-image-preview"><img src={uploadPreview} alt="当前衣物" /></div>}
            {editingGarmentId === null && <>
            <label className={`upload-zone ${uploadPreview ? "has-image" : ""}`}>
              {uploadPreview ? <><img src={uploadPreview} alt="待上传衣服预览" />{analyzing && <span className="image-processing">AI 正在看这件衣服…</span>}</> : <><span>＋</span><strong>拍照或从相册批量选择</strong><small>一次最多 10 张；每张照片只放一件衣服</small></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleUpload} />
            </label>
            <label className="seedream-option"><input type="checkbox" aria-label="用 Seedream 整理展示图" checked={enhanceWithSeedream} onChange={(event) => setEnhanceWithSeedream(event.target.checked)} /><span><strong>用 Seedream 整理展示图（可选）</strong><small>默认关闭；开启后会产生图片处理费用，用于去除杂乱背景并平整展示，原图仍会保留</small></span></label>
                <div className={`recognition-note ${aiReady === false || (Boolean(imageKey) && recognitionProvider === "manual-fallback") ? "setup-needed" : ""}`}><span>✦</span><div><strong>{analyzing ? "正在识别衣物属性…" : imageKey ? (recognitionProvider && recognitionProvider !== "manual-fallback" && garmentDraft.confidence > 0 ? `识别完成 · ${garmentDraft.confidence}% 可信` : aiReady ? "AI 识别没有成功，请重新识别或手动确认" : "演示识别 · 等待配置模型密钥") : "上传后自动识别类型、颜色、材质和适用场景"}</strong>{garmentDraft.warnings.length > 0 && <small>{garmentDraft.warnings.join(" ")}</small>}{recognitionsRemaining !== null && <small>今日还可识别 {recognitionsRemaining} 次</small>}</div></div>
            {uploadFile && !analyzing && <button className="reanalyze-button" onClick={() => analyzeSelectedFile()}>↻ 按当前设置重新识别{enhanceWithSeedream ? "并整理图片" : ""}</button>}
            </>}
            <div className="single-form-row"><label>衣服名称<input value={garmentDraft.name} onChange={(event) => setGarmentDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：浅蓝牛津纺衬衫" maxLength={30} /></label></div>
            <div className="form-row"><label>衣服类型<select value={newCategory} onChange={(event) => { setNewCategory(event.target.value); setGarmentDraft((current) => ({ ...current, category: event.target.value })); }}><option>上衣</option><option>下装</option><option>外套</option><option>连衣裙</option><option>鞋子</option><option>配饰</option></select></label><label>主要颜色<select value={newColor} onChange={(event) => { setNewColor(event.target.value); setGarmentDraft((current) => ({ ...current, colorName: event.target.value })); }}>{Array.from(new Set([newColor, "米白", "白色", "黑色", "灰色", "蓝色", "棕色", "粉色", "红色", "绿色", "其他"])).map((color) => <option key={color}>{color}</option>)}</select></label></div>
            <div className="form-row"><label>材质<input value={garmentDraft.material} onChange={(event) => setGarmentDraft((current) => ({ ...current, material: event.target.value }))} maxLength={20} /></label><label>图案<input value={garmentDraft.pattern} onChange={(event) => setGarmentDraft((current) => ({ ...current, pattern: event.target.value }))} maxLength={20} /></label></div>
            <details className="scene-multiselect">
              <summary><span><small>适用场景（可多选）</small><strong>{garmentDraft.sceneTags.length ? garmentDraft.sceneTags.join("、") : "请选择至少一个场景"}</strong></span><b>⌄</b></summary>
              <div className="scene-dropdown">{garmentSceneGroups.map((group) => <section key={group.label}><h4>{group.label}</h4><div>{group.options.map((sceneName) => <button type="button" key={sceneName} className={garmentDraft.sceneTags.includes(sceneName) ? "selected" : ""} onClick={() => toggleGarmentScene(sceneName)}>{garmentDraft.sceneTags.includes(sceneName) ? "✓ " : ""}{sceneName}</button>)}</div></section>)}</div>
            </details>
            <p className="confirmation-hint">AI 识别可能出错，请确认后再保存。展示图不会替代原始照片。</p>
            <button className="primary-button" disabled={saving || analyzing || !garmentDraft.name.trim() || !garmentDraft.sceneTags.length} onClick={saveGarment}>{saving ? "正在保存…" : analyzing ? "正在识别…" : editingGarmentId !== null ? "保存修改" : uploadQueue.length ? `保存并继续下一件（剩余 ${uploadQueue.length} 件）` : "确认信息，加入衣柜"}</button>
          </div>
        </div>
      )}
      {expandedLook && <div className="look-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpandedLook(null); }}>
        <section className="look-modal" role="dialog" aria-modal="true" aria-labelledby="look-modal-title">
          <button className="look-modal-close" onClick={() => setExpandedLook(null)} aria-label="关闭效果图">×</button>
          <div className="look-modal-image"><img src={expandedLook.imageUrl} alt={`${expandedLook.title} 放大试穿效果`} /></div>
          <div className="look-modal-copy"><small>{expandedLook.mode} · AI 搭配示意</small><h2 id="look-modal-title">{expandedLook.title}</h2><p>{expandedLook.items}</p></div>
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
