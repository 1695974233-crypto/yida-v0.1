"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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
type Outfit = { key: string; title: string; tag: string; score: number; colors: string[]; items: string; reason: string; itemIds: number[] };
type RequestConstraints = { scene?: string; warmth?: "warmer" | "lighter"; formality?: "formal" | "casual"; avoid?: string[]; colors?: string[] };
type ChatMessage = { id: number; role: "user" | "assistant"; content: string; createdAt?: string };
type WeatherData = { city: string; latitude: number; longitude: number; temperature: number; apparentTemperature: number; precipitation: number; windSpeed: number; weatherCode: number; temperatureMax: number; temperatureMin: number; condition: string; icon: string };
type WeatherLocation = { latitude?: number; longitude?: number; name?: string; city?: string };
type WeatherGeocodingResponse = { results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string }> };
type WeatherForecastResponse = {
  current?: { temperature_2m: number; apparent_temperature: number; precipitation: number; weather_code: number; wind_speed_10m: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] };
};
type ProfileData = { preferredStyles: string[]; lastScene: string | null; onboardingCompleted?: boolean; weatherCity?: string | null; weatherLatitude?: number | null; weatherLongitude?: number | null };
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
  return { id: index + 1, catalogKey: key, ...item, isVirtual: true, dirty: key === "pink-skirt" };
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
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const chosen: Outfit[] = [];
  for (const candidate of sorted) {
    if (!chosen.some((item) => item.itemIds.slice(0, 2).join("-") === candidate.itemIds.slice(0, 2).join("-"))) chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  return chosen.length === 3 ? chosen : sorted.slice(0, 3);
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
  try {
    const response = await fetch(`/api/weather?${query.toString()}`, { cache: "no-store" });
    const data = await response.json() as WeatherData & { error?: string };
    if (response.ok && !data.error) return data;
    if (response.status < 500) throw new Error(data.error ?? "天气获取失败");
  } catch (error) {
    if (error instanceof Error && (error.message.includes("没有找到") || error.message.includes("请提供"))) throw error;
  }
  return fetchWeatherDirectly(location);
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
    return <img className="garment-photo" src={garment.image} alt={garment.name} />;
  }
  return (
    <div className={`garment-art ${compact ? "compact" : ""}`} style={{ background: garment.color }} aria-hidden="true">
      <span className={`clothing-shape ${garment.category === "下装" ? "bottom" : garment.category === "鞋子" ? "shoe" : garment.category === "外套" ? "coat" : garment.category === "连衣裙" ? "dress" : "top"}`} />
    </div>
  );
}

export default function Home() {
  const [onboarding, setOnboarding] = useState(true);
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
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [requestConstraints, setRequestConstraints] = useState<RequestConstraints>({});
  const [wardrobeFilter, setWardrobeFilter] = useState("全部");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingGarmentId, setEditingGarmentId] = useState<number | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
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
  const [worn, setWorn] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const availableCount = garments.filter((item) => !item.dirty).length;
  const filteredGarments = useMemo(
    () => garments.filter((item) => wardrobeFilter === "全部" || (wardrobeFilter === "脏衣篓" ? item.dirty : item.category === wardrobeFilter)),
    [garments, wardrobeFilter],
  );
  const generatedOutfits = useMemo(() => buildOutfits(garments, scene, styles, requestConstraints, weather), [garments, scene, styles, requestConstraints, weather]);
  const outfits = useMemo(() => [...generatedOutfits.slice(rotation), ...generatedOutfits.slice(0, rotation)], [generatedOutfits, rotation]);
  const todayLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date());

  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法连接你的衣柜");
        return response.json();
      })
      .then((data: { profile: ProfileData; garments: Garment[]; feedback: FeedbackRecord[]; chat: { activeRequest: string | null; constraints: RequestConstraints; messages: ChatMessage[] } }) => {
        setGarments(data.garments);
        setStyles(data.profile.preferredStyles.length ? data.profile.preferredStyles : ["简约通勤", "清爽休闲"]);
        setScene(data.profile.lastScene);
        setOnboarding(!data.profile.onboardingCompleted);
        setLiked(data.feedback.filter((item) => item.action === "like").map((item) => item.outfitKey));
        setSaved(data.feedback.filter((item) => item.action === "save").map((item) => item.outfitKey));
        setWorn(data.feedback.filter((item) => item.action === "worn").map((item) => item.outfitKey));
        setActiveRequest(data.chat.activeRequest);
        setRequestConstraints(data.chat.constraints);
        setChatMessages(data.chat.messages);
        if (typeof data.profile.weatherLatitude === "number" && typeof data.profile.weatherLongitude === "number") {
          void fetchWeatherData({ latitude: data.profile.weatherLatitude, longitude: data.profile.weatherLongitude, name: data.profile.weatherCity ?? "当前位置" })
            .then((savedWeather) => { setWeather(savedWeather); setWeatherCityInput(savedWeather.city.split(" · ")[0]); })
            .catch(() => showToast("上次城市的天气暂时无法更新"));
        }
      })
      .catch(() => showToast("当前使用演示数据，稍后会自动重试"))
      .finally(() => setLoading(false));
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function loadWeather(location: WeatherLocation, saveLocation = true) {
    setWeatherLoading(true);
    try {
      const data = await fetchWeatherData(location);
      setWeather(data);
      setWeatherCityInput(data.city.split(" · ")[0]);
      setRotation(0);
      if (saveLocation) await persist({ action: "update_location", city: data.city, latitude: data.latitude, longitude: data.longitude }, true);
      setWeatherOpen(false);
      showToast(`已更新 ${data.city} 的真实天气`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "天气获取失败，请稍后重试");
    } finally {
      setWeatherLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      showToast("当前浏览器不支持定位，请手动输入城市");
      return;
    }
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { void loadWeather({ latitude: position.coords.latitude, longitude: position.coords.longitude, name: "当前位置" }); },
      () => { setWeatherLoading(false); showToast("没有获得定位权限，请手动输入城市"); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60 * 1000 },
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

  async function persist(action: Record<string, unknown>, quiet = false) {
    setSaving(true);
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!response.ok) throw new Error("保存失败");
      const data = await response.json() as { profile: ProfileData; garments: Garment[]; feedback: FeedbackRecord[]; chat: { activeRequest: string | null; constraints: RequestConstraints; messages: ChatMessage[] } };
      setGarments(data.garments);
      setStyles(data.profile.preferredStyles);
      setScene(data.profile.lastScene);
      setLiked(data.feedback.filter((item) => item.action === "like").map((item) => item.outfitKey));
      setSaved(data.feedback.filter((item) => item.action === "save").map((item) => item.outfitKey));
      setWorn(data.feedback.filter((item) => item.action === "worn").map((item) => item.outfitKey));
      setActiveRequest(data.chat.activeRequest);
      setRequestConstraints(data.chat.constraints);
      setChatMessages(data.chat.messages);
      return true;
    } catch {
      if (!quiet) showToast("没有保存成功，请稍后重试");
      return false;
    } finally { setSaving(false); }
  }

  async function completeOnboarding() {
    const ok = await persist({ action: "complete_onboarding", styles });
    if (ok) setOnboarding(false);
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
    setImageKey(null);
    setProcessedImageKey(null);
  }

  function openAddGarment() {
    setEditingGarmentId(null);
    setUploadPreview(null);
    setUploadFile(null);
    setImageKey(null);
    setProcessedImageKey(null);
    setNewCategory("上衣");
    setNewColor("米白");
    setGarmentDraft({ name: "", category: "上衣", colorName: "米白", colorHex: "#eeeae2", material: "待确认", pattern: "纯色", warmth: 2, styleTags: [], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["常规"], confidence: 0, warnings: [] });
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

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 8 * 1024 * 1024) {
      showToast("图片不能超过 8MB");
      return;
    }
    try {
      const file = await prepareUploadImage(selected);
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
      await analyzeSelectedFile(file);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "图片读取失败");
    }
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
      closeGarmentModal();
      setTab("wardrobe");
      showToast(wasEditing ? "衣服信息已更新" : "衣服照片和你确认的信息已保存");
    }
  }

  async function toggleCatalogItem(catalogKey: string) {
    const exists = garments.some((item) => item.catalogKey === catalogKey);
    const ok = await persist({ action: exists ? "remove_catalog" : "add_catalog", catalogKey });
    if (ok) showToast(exists ? "已从虚拟衣柜移除" : "已加入你的虚拟衣柜");
  }

  async function recordFeedback(outfitKey: string, feedbackAction: "like" | "save" | "dislike" | "worn") {
    const ok = await persist({ action: "feedback", outfitKey, feedbackAction });
    if (ok) showToast(feedbackAction === "worn" ? "已记录：今天穿这套" : feedbackAction === "dislike" ? "收到，下次会减少类似搭配" : "你的偏好已经保存");
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

  function navTo(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      {(loading || saving) && <div className="sync-indicator"><span>{loading ? "正在打开你的衣柜…" : "正在保存…"}</span></div>}
      {onboarding && (
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
              <button className="text-button" onClick={completeOnboarding}>跳过，直接使用虚拟衣柜</button>
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

      <header className="topbar">
        <button className="logo" onClick={() => navTo("today")} aria-label="返回今日推荐"><span className="brand-mark">易</span><span>易搭</span></button>
        <div className="top-actions"><button className="icon-button" aria-label="消息">♡</button><button className="avatar" onClick={() => navTo("profile")} aria-label="个人中心">晚</button></div>
      </header>

      {tab === "today" && (
        <section className="screen today-screen">
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
            <div><p className="eyebrow">{scene ? `已加入“${scene}”场景` : "天气 + 可用衣物 + 你的偏好"}</p><h2>今天为你搭好了</h2></div>
            <button className="refresh-button" onClick={() => { setRotation(generatedOutfits.length ? (rotation + 1) % generatedOutfits.length : 0); showToast("已根据当前衣柜重新排序"); }}>↻ 换一组</button>
          </div>

          <div className="outfit-stack">
            {outfits.length ? outfits.map((outfit, index) => {
              return (
                <article className={`outfit-card outfit-${index + 1}`} key={outfit.key}>
                  <div className="outfit-visual">
                    <div className="match-label"><span>✦</span>{outfit.score}% 匹配</div>
                    <div className="look-canvas">
                      {outfit.colors.map((color, colorIndex) => <span key={`${color}-${colorIndex}`} className={`look-piece look-piece-${colorIndex + 1}`} style={{ background: color }} />)}
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
            }) : <div className="empty-state recommendation-empty"><span>▦</span><h3>还缺少搭配需要的衣服</h3><p>需要“上衣＋下装”或连衣裙，再搭配一双鞋。</p><button className="upload-button" onClick={() => setCatalogOpen(true)}>从虚拟衣柜添加</button></div>}
          </div>
        </section>
      )}

      {tab === "wardrobe" && (
        <section className="screen wardrobe-screen">
          <div className="page-title-row"><div><p className="eyebrow">你的数字衣橱</p><h1>我的衣柜</h1><p>{availableCount} 件可用 · {garments.length - availableCount} 件在脏衣篓</p></div><button className="upload-button" onClick={openAddGarment}>＋ 添加衣服</button></div>
          <button className="virtual-closet-entry" onClick={() => setCatalogOpen(true)}><span>▦</span><div><strong>从虚拟衣柜添加基础款</strong><small>不用拍照，勾选“我有类似款”即可参与推荐</small></div><b>›</b></button>
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
          <div className="page-title-row"><div><p className="eyebrow">发现新的可能</p><h1>风格灵感</h1><p>喜欢或跳过，易搭会慢慢读懂你。</p></div></div>
          <div className="mood-board">
            <article className="mood-card mood-large"><div className="editorial-look look-a"><span /><span /><span /></div><div><small>本周灵感 · 通勤</small><h2>清爽的低饱和叠穿</h2><p>蓝灰与奶油白，是阴雨天也不沉闷的组合。</p><button onClick={() => showToast("已收藏到我的偏爱穿搭")}>♡ 收下这个风格</button></div></article>
            <article className="mood-card"><div className="editorial-look look-b"><span /><span /></div><small>松弛日常</small><h3>针织衫与牛仔裤</h3></article>
            <article className="mood-card"><div className="editorial-look look-c"><span /><span /></div><small>轻通勤</small><h3>西装也可以不严肃</h3></article>
          </div>
          <div className="taste-card"><div><span>你的偏好正在成形</span><strong>简约通勤 82%</strong><strong>清爽休闲 71%</strong></div><button onClick={() => showToast("偏好设置将在下一阶段开放")}>查看偏好 →</button></div>
        </section>
      )}

      {tab === "profile" && (
        <section className="screen profile-screen">
          <div className="profile-hero"><div className="large-avatar">晚</div><div><h1>晚晚</h1><p>和易搭一起生活的第 12 天</p></div><button onClick={() => { setOnboarding(true); setOnboardingStep(0); }}>重新体验引导</button></div>
          <div className="stat-grid"><div><strong>{garments.length}</strong><span>衣柜单品</span></div><div><strong>{saved.length}</strong><span>收藏搭配</span></div><div><strong>{worn.length + 7}</strong><span>本月已穿</span></div></div>
          <section className="profile-section"><div className="section-heading"><div><p className="eyebrow">最近 30 天</p><h2>穿搭记录</h2></div><button className="clear-button">查看全部</button></div><div className="history-list"><div><span className="history-date">今天</span><div className="mini-palette"><i style={{ background: "#b8cbd4" }} /><i style={{ background: "#595b5c" }} /><i style={{ background: "#e7ddca" }} /></div><p>雨天也清爽</p><b>已穿 ✓</b></div><div><span className="history-date">周六</span><div className="mini-palette"><i style={{ background: "#d9c8ad" }} /><i style={{ background: "#66819b" }} /></div><p>舒服不费力</p><b>已收藏</b></div></div></section>
          <section className="settings-list"><button><span>♡</span><div><strong>我的偏爱穿搭</strong><small>收藏与喜欢过的搭配</small></div><b>›</b></button><button><span>♨</span><div><strong>脏衣篓设置</strong><small>默认 3 天后恢复可用</small></div><b>›</b></button><button><span>◌</span><div><strong>个人偏好</strong><small>{styles.join("、")}</small></div><b>›</b></button><button><span>⌁</span><div><strong>隐私与数据</strong><small>定位、照片与删除设置</small></div><b>›</b></button></section>
        </section>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={tab === "today" ? "active" : ""} onClick={() => navTo("today")}><span>⌂</span>今日</button>
        <button className={tab === "wardrobe" ? "active" : ""} onClick={() => navTo("wardrobe")}><span>▦</span>衣柜</button>
        <button className="center-action assistant-action" onClick={() => setChatOpen(true)} aria-label="打开易搭助手"><span>易</span><small>问易搭</small></button>
        <button className={tab === "discover" ? "active" : ""} onClick={() => navTo("discover")}><span>✦</span>发现</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => navTo("profile")}><span>○</span>我的</button>
      </nav>

      {weatherOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWeatherOpen(false); }}>
          <div className="upload-modal weather-modal" role="dialog" aria-modal="true" aria-labelledby="weather-title">
            <div className="modal-handle" />
            <div className="modal-heading"><div><p className="eyebrow">让推荐适合今天</p><h2 id="weather-title">设置天气位置</h2></div><button onClick={() => setWeatherOpen(false)} aria-label="关闭">×</button></div>
            <p className="weather-explanation">易搭会读取温度、体感、降雨和风速，只在你主动点击后申请定位。</p>
            <button className="location-button" disabled={weatherLoading} onClick={useCurrentLocation}><span>⌖</span><div><strong>{weatherLoading ? "正在获取天气…" : "使用我的当前位置"}</strong><small>只保存城市和小数点后两位的模糊坐标</small></div></button>
            <div className="weather-divider"><span>或者手动选择</span></div>
            <form className="city-search" onSubmit={searchWeatherCity}><input value={weatherCityInput} onChange={(event) => setWeatherCityInput(event.target.value)} placeholder="输入城市，例如：上海" maxLength={40} aria-label="城市名称" /><button type="submit" disabled={weatherLoading || !weatherCityInput.trim()}>查询</button></form>
            <p className="weather-source">天气数据由 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> 提供；服务异常时仍可使用常规推荐。</p>
          </div>
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
            <div className="modal-heading"><div><p className="eyebrow">降低第一次使用门槛</p><h2 id="catalog-title">我有这些基础款</h2><p>选择相似单品，它们会马上参与今日推荐。</p></div><button onClick={() => setCatalogOpen(false)} aria-label="关闭">×</button></div>
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
            <div className="modal-handle" /><div className="modal-heading"><div><p className="eyebrow">{editingGarmentId === null ? "放进你的数字衣柜" : "修改衣物信息"}</p><h2 id="upload-title">{editingGarmentId === null ? "添加一件衣服" : "编辑这件衣服"}</h2></div><button onClick={closeGarmentModal} aria-label="关闭">×</button></div>
            {editingGarmentId !== null && uploadPreview && <div className="edit-image-preview"><img src={uploadPreview} alt="当前衣物" /></div>}
            {editingGarmentId === null && <>
            <label className={`upload-zone ${uploadPreview ? "has-image" : ""}`}>
              {uploadPreview ? <><img src={uploadPreview} alt="待上传衣服预览" />{analyzing && <span className="image-processing">AI 正在看这件衣服…</span>}</> : <><span>＋</span><strong>拍照或从相册选择</strong><small>尽量只拍一件，保持光线自然</small></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} />
            </label>
            <label className="seedream-option"><input type="checkbox" aria-label="用 Seedream 整理展示图" checked={enhanceWithSeedream} onChange={(event) => setEnhanceWithSeedream(event.target.checked)} /><span><strong>用 Seedream 整理展示图（可选）</strong><small>默认关闭；开启后会产生图片处理费用，用于去除杂乱背景并平整展示，原图仍会保留</small></span></label>
            <div className={`recognition-note ${aiReady === false ? "setup-needed" : ""}`}><span>✦</span><div><strong>{analyzing ? "正在识别衣物属性…" : imageKey ? (aiReady ? `识别完成 · ${garmentDraft.confidence}% 可信` : "演示识别 · 等待配置模型密钥") : "上传后自动识别类型、颜色、材质和适用场景"}</strong>{garmentDraft.warnings.length > 0 && <small>{garmentDraft.warnings.join(" ")}</small>}{recognitionsRemaining !== null && <small>今日还可识别 {recognitionsRemaining} 次</small>}</div></div>
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
            <button className="primary-button" disabled={saving || analyzing || !garmentDraft.name.trim() || !garmentDraft.sceneTags.length} onClick={saveGarment}>{saving ? "正在保存…" : analyzing ? "正在识别…" : editingGarmentId === null ? "确认信息，加入衣柜" : "保存修改"}</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
