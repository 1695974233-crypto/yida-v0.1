import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultCatalogKeys, virtualCatalog } from "../app/catalog";
import { removeUserImages, requireUserData } from "./supabase-data";

type RequestConstraints = {
  scene?: string;
  warmth?: "warmer" | "lighter";
  formality?: "formal" | "casual";
  avoid?: string[];
  colors?: string[];
};

function parseRequest(message: string): RequestConstraints {
  const result: RequestConstraints = {};
  if (/上班|通勤|公司|见客户|开会/.test(message)) result.scene = "上班";
  else if (/约会|相亲/.test(message)) result.scene = "约会";
  else if (/运动|健身|跑步|瑜伽/.test(message)) result.scene = "运动";
  else if (/休闲|逛街|咖啡|朋友|聚会|吃饭/.test(message)) result.scene = "休闲";
  if (/保暖|怕冷|暖和|有点冷|很冷/.test(message)) result.warmth = "warmer";
  if (/凉快|怕热|轻薄|别太热|有点热|很热/.test(message)) result.warmth = "lighter";
  if (/正式|见客户|开会|商务|有精神|利落/.test(message) && !/不要太正式|别太正式|不正式/.test(message)) result.formality = "formal";
  if (/不要太正式|别太正式|不正式|随意|松弛|休闲一点/.test(message)) result.formality = "casual";
  const avoid: string[] = [];
  if (/不想穿裙|不要裙|不穿裙/.test(message)) avoid.push("裙");
  if (/不想穿裤|不要裤|不穿裤/.test(message)) avoid.push("裤");
  if (/不想穿外套|不要外套|不穿外套/.test(message)) avoid.push("外套");
  if (/不想穿黑|不要黑|避开黑/.test(message)) avoid.push("黑");
  if (avoid.length) result.avoid = avoid;
  const colorPairs: Array<[RegExp, string]> = [[/白色|米白|奶油白/, "白"], [/黑色|黑灰/, "黑"], [/蓝色|浅蓝|牛仔蓝/, "蓝"], [/灰色|深灰/, "灰"], [/棕色|咖色/, "棕"], [/粉色|雾粉/, "粉"]];
  const colors = colorPairs.filter(([pattern]) => pattern.test(message)).map(([, color]) => color);
  if (colors.length && !/不想|不要|避开/.test(message)) result.colors = colors;
  return result;
}

function assistantReply(constraints: RequestConstraints, availableCount: number) {
  const understood = [constraints.scene, constraints.warmth === "warmer" ? "更保暖" : constraints.warmth === "lighter" ? "更轻薄" : null, constraints.formality === "formal" ? "更利落" : constraints.formality === "casual" ? "不要太正式" : null, constraints.avoid?.length ? `避开${constraints.avoid.join("、")}` : null, constraints.colors?.length ? `偏向${constraints.colors.join("、")}色` : null].filter(Boolean);
  if (!understood.length) return `收到，我先记下你的原话。现在可用的 ${availableCount} 件衣服会继续按天气和偏好推荐；你也可以补充场景、冷暖、正式程度、颜色或不想穿什么。`;
  return `明白，今天按“${understood.join(" + ")}”来搭。我已经从 ${availableCount} 件可用衣服里重新筛选，推荐马上更新。`;
}

function catalogRow(userId: string, key: string) {
  const item = virtualCatalog.find((entry) => entry.key === key);
  if (!item) return null;
  return {
    user_id: userId,
    catalog_key: item.key,
    name: item.name,
    category: item.category,
    color: item.color,
    color_name: item.colorName,
    meta: item.meta,
    warmth: item.warmth,
    style_tags: item.styleTags,
    scene_tags: item.sceneTags,
    weather_tags: item.weatherTags,
    is_virtual: true,
  };
}

function fail(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function ensureUser(client: SupabaseClient, userId: string, displayName: string) {
  const profile = await client.from("profiles").upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id", ignoreDuplicates: true });
  fail(profile.error, "个人资料初始化失败");
  const chat = await client.from("chat_sessions").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  fail(chat.error, "聊天初始化失败");
  const existing = await client.from("garments").select("id", { count: "exact", head: true }).eq("user_id", userId);
  fail(existing.error, "衣柜读取失败");
  if ((existing.count ?? 0) === 0) {
    const rows = defaultCatalogKeys.map((key) => catalogRow(userId, key)).filter(Boolean);
    const seeded = await client.from("garments").insert(rows);
    fail(seeded.error, "体验衣柜初始化失败");
    await client.from("garments").update({ dirty_until: new Date(Date.now() + 3 * 86400000).toISOString() }).eq("user_id", userId).eq("catalog_key", "pink-skirt");
  }
}

function mapGarment(item: Record<string, unknown>) {
  const imageKey = (item.processed_image_key || item.image_key) as string | null;
  return {
    id: Number(item.id),
    userId: item.user_id,
    catalogKey: item.catalog_key,
    name: item.name,
    category: item.category,
    color: item.color,
    colorName: item.color_name,
    meta: item.meta,
    warmth: item.warmth,
    styleTags: Array.isArray(item.style_tags) ? item.style_tags : [],
    sceneTags: Array.isArray(item.scene_tags) ? item.scene_tags : [],
    weatherTags: Array.isArray(item.weather_tags) ? item.weather_tags : [],
    isVirtual: Boolean(item.is_virtual),
    imageKey: item.image_key,
    processedImageKey: item.processed_image_key,
    recognitionStatus: item.recognition_status,
    recognitionConfidence: item.recognition_confidence,
    recognitionProvider: item.recognition_provider,
    recognizedAt: item.recognized_at,
    dirtyUntil: item.dirty_until,
    createdAt: item.created_at,
    image: imageKey ? `/api/garments/image?key=${encodeURIComponent(imageKey)}` : undefined,
    dirty: Boolean(item.dirty_until && String(item.dirty_until) > new Date().toISOString()),
  };
}

async function stateFor(client: SupabaseClient, userId: string) {
  const [profileResult, garmentsResult, feedbackResult, chatResult, messagesResult] = await Promise.all([
    client.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    client.from("garments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }),
    client.from("outfit_feedback").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    client.from("chat_sessions").select("*").eq("user_id", userId).maybeSingle(),
    client.from("chat_messages").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40),
  ]);
  for (const result of [profileResult, garmentsResult, feedbackResult, chatResult, messagesResult]) fail(result.error, "用户数据读取失败");
  const profile = profileResult.data;
  const garmentRows = garmentsResult.data ?? [];
  const hasLegacyWardrobe = garmentRows.some((item) => item.recognition_provider === "legacy-import");
  const onboardingCompleted = Boolean(profile?.onboarding_completed || hasLegacyWardrobe);
  if (!profile?.onboarding_completed && hasLegacyWardrobe) {
    fail((await client.from("profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "新手引导状态修复失败");
  }
  const chat = chatResult.data;
  return {
    profile: {
      displayName: profile?.display_name ?? "晚晚",
      preferredStyles: profile?.preferred_styles ?? [],
      lastScene: profile?.last_scene ?? null,
      onboardingCompleted,
      weatherCity: profile?.weather_city ?? null,
      weatherLatitude: profile?.weather_latitude ?? null,
      weatherLongitude: profile?.weather_longitude ?? null,
      bodyHeight: profile?.body_height ?? null,
      bodyWeight: profile?.body_weight ?? null,
      bodyShape: profile?.body_shape ?? null,
      modelPresentation: profile?.model_presentation ?? null,
      fullBodyImageUrl: profile?.full_body_image_key ? `/api/garments/image?key=${encodeURIComponent(profile.full_body_image_key)}` : null,
    },
    garments: garmentRows.map((item) => mapGarment(item)),
    feedback: (feedbackResult.data ?? []).map((item) => ({ id: item.id, userId: item.user_id, outfitKey: item.outfit_key, action: item.action, reason: item.reason, createdAt: item.created_at })),
    chat: {
      activeRequest: chat?.active_request ?? null,
      constraints: chat?.constraints ?? {},
      messages: [...(messagesResult.data ?? [])].reverse().map((item) => ({ id: item.id, userId: item.user_id, role: item.role, content: item.content, createdAt: item.created_at })),
    },
    catalog: virtualCatalog,
  };
}

export async function getSupabaseState(request: Request) {
  const { client, user } = await requireUserData(request);
  await ensureUser(client, user.id, user.name);
  return Response.json(await stateFor(client, user.id));
}

export async function postSupabaseState(request: Request) {
  const { client, user } = await requireUserData(request);
  await ensureUser(client, user.id, user.name);
  const payload = await request.json() as Record<string, unknown>;
  const userId = user.id;

  if (payload.action === "delete_garment" && typeof payload.garmentId === "number") {
    const current = await client.from("garments").select("id,image_key,processed_image_key").eq("id", payload.garmentId).eq("user_id", userId).maybeSingle();
    fail(current.error, "衣物读取失败");
    if (current.data) {
      const keys = [current.data.image_key, current.data.processed_image_key].filter((key): key is string => Boolean(key?.startsWith(`${userId}/`)));
      await removeUserImages(client, keys);
      fail((await client.from("garments").delete().eq("id", payload.garmentId).eq("user_id", userId)).error, "衣物删除失败");
    }
  } else if (payload.action === "update_garment" && typeof payload.garmentId === "number" && typeof payload.name === "string" && typeof payload.category === "string") {
    const material = typeof payload.material === "string" ? payload.material.slice(0, 20) : "待确认";
    const pattern = typeof payload.pattern === "string" ? payload.pattern.slice(0, 20) : "待确认";
    fail((await client.from("garments").update({
      name: payload.name.slice(0, 30), category: payload.category.slice(0, 12), color: typeof payload.color === "string" ? payload.color : "#d8d0c2", color_name: typeof payload.colorName === "string" ? payload.colorName.slice(0, 12) : "其他", meta: `${material} · ${pattern} · 已确认`, warmth: typeof payload.warmth === "number" ? Math.min(5, Math.max(1, Math.round(payload.warmth))) : 2, style_tags: Array.isArray(payload.styleTags) ? payload.styleTags.slice(0, 5) : [], scene_tags: Array.isArray(payload.sceneTags) ? payload.sceneTags.slice(0, 5) : [], weather_tags: Array.isArray(payload.weatherTags) ? payload.weatherTags.slice(0, 5) : ["常规"],
    }).eq("id", payload.garmentId).eq("user_id", userId)).error, "衣物更新失败");
  } else if (payload.action === "toggle_dirty" && typeof payload.garmentId === "number") {
    const current = await client.from("garments").select("dirty_until").eq("id", payload.garmentId).eq("user_id", userId).maybeSingle();
    fail(current.error, "衣物读取失败");
    const dirtyUntil = current.data?.dirty_until && current.data.dirty_until > new Date().toISOString() ? null : new Date(Date.now() + 3 * 86400000).toISOString();
    fail((await client.from("garments").update({ dirty_until: dirtyUntil }).eq("id", payload.garmentId).eq("user_id", userId)).error, "脏衣篓更新失败");
  } else if (payload.action === "add_catalog" && typeof payload.catalogKey === "string") {
    const row = catalogRow(userId, payload.catalogKey);
    if (row) fail((await client.from("garments").upsert(row, { onConflict: "user_id,catalog_key", ignoreDuplicates: true })).error, "体验衣物添加失败");
  } else if (payload.action === "remove_catalog" && typeof payload.catalogKey === "string") {
    fail((await client.from("garments").delete().eq("user_id", userId).eq("catalog_key", payload.catalogKey)).error, "体验衣物移除失败");
  } else if (payload.action === "update_scene") {
    fail((await client.from("profiles").update({ last_scene: typeof payload.scene === "string" ? payload.scene : null, updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "场景保存失败");
  } else if (payload.action === "update_location") {
    const latitude = typeof payload.latitude === "number" && Number.isFinite(payload.latitude) ? Math.round(payload.latitude * 100) / 100 : null;
    const longitude = typeof payload.longitude === "number" && Number.isFinite(payload.longitude) ? Math.round(payload.longitude * 100) / 100 : null;
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return Response.json({ error: "位置数据无效" }, { status: 400 });
    fail((await client.from("profiles").update({ weather_city: typeof payload.city === "string" ? payload.city.slice(0, 40) : "当前位置", weather_latitude: latitude, weather_longitude: longitude, updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "位置保存失败");
  } else if (payload.action === "update_styles" && Array.isArray(payload.styles)) {
    fail((await client.from("profiles").update({ preferred_styles: payload.styles, updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "偏好保存失败");
  } else if (payload.action === "update_body_profile") {
    const height = typeof payload.height === "number" ? Math.round(payload.height) : null;
    const weight = typeof payload.weight === "number" ? Math.round(payload.weight) : null;
    const allowedShapes = ["匀称", "偏瘦", "肩宽", "梨形", "苹果形", "曲线型"];
    const allowedPresentations = ["女生", "男生"];
    if (height === null || height < 120 || height > 220 || weight === null || weight < 30 || weight > 200) return Response.json({ error: "请填写有效的身高和体重" }, { status: 400 });
    fail((await client.from("profiles").update({ body_height: height, body_weight: weight, body_shape: typeof payload.bodyShape === "string" && allowedShapes.includes(payload.bodyShape) ? payload.bodyShape : "匀称", model_presentation: typeof payload.modelPresentation === "string" && allowedPresentations.includes(payload.modelPresentation) ? payload.modelPresentation : "女生", updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "身体资料保存失败");
  } else if (payload.action === "complete_onboarding") {
    const updates: Record<string, unknown> = { onboarding_completed: true, updated_at: new Date().toISOString() };
    if (Array.isArray(payload.styles)) updates.preferred_styles = payload.styles;
    fail((await client.from("profiles").update(updates).eq("user_id", userId)).error, "新手引导保存失败");
  } else if (payload.action === "feedback" && typeof payload.outfitKey === "string" && typeof payload.feedbackAction === "string") {
    fail((await client.from("outfit_feedback").insert({ user_id: userId, outfit_key: payload.outfitKey, action: payload.feedbackAction, reason: typeof payload.reason === "string" ? payload.reason : null })).error, "反馈保存失败");
  } else if (payload.action === "send_message" && typeof payload.message === "string" && payload.message.trim()) {
    const message = payload.message.trim().slice(0, 500);
    const parsed = parseRequest(message);
    const session = await client.from("chat_sessions").select("constraints").eq("user_id", userId).maybeSingle();
    fail(session.error, "聊天状态读取失败");
    const previous = (session.data?.constraints ?? {}) as RequestConstraints;
    const merged: RequestConstraints = { ...previous, ...parsed, avoid: parsed.avoid ? [...new Set([...(previous.avoid ?? []), ...parsed.avoid])] : previous.avoid, colors: parsed.colors ?? previous.colors };
    const clothing = await client.from("garments").select("dirty_until").eq("user_id", userId);
    fail(clothing.error, "衣柜读取失败");
    const availableCount = (clothing.data ?? []).filter((item) => !item.dirty_until || item.dirty_until <= new Date().toISOString()).length;
    const reply = assistantReply(merged, availableCount);
    fail((await client.from("chat_messages").insert([{ user_id: userId, role: "user", content: message }, { user_id: userId, role: "assistant", content: reply }])).error, "聊天消息保存失败");
    fail((await client.from("chat_sessions").upsert({ user_id: userId, active_request: message, constraints: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" })).error, "聊天状态保存失败");
    if (parsed.scene) await client.from("profiles").update({ last_scene: parsed.scene, updated_at: new Date().toISOString() }).eq("user_id", userId);
  } else if (payload.action === "clear_request") {
    fail((await client.from("chat_sessions").update({ active_request: null, constraints: {}, updated_at: new Date().toISOString() }).eq("user_id", userId)).error, "对话要求清除失败");
  } else if (payload.action === "add_garment" && typeof payload.name === "string" && typeof payload.category === "string") {
    const imageKey = typeof payload.imageKey === "string" && payload.imageKey.startsWith(`${userId}/`) ? payload.imageKey : null;
    const processedImageKey = typeof payload.processedImageKey === "string" && payload.processedImageKey.startsWith(`${userId}/`) ? payload.processedImageKey : null;
    const material = typeof payload.material === "string" ? payload.material.slice(0, 20) : "待确认";
    const pattern = typeof payload.pattern === "string" ? payload.pattern.slice(0, 20) : "待确认";
    const recognitionProvider = typeof payload.recognitionProvider === "string" ? payload.recognitionProvider.slice(0, 80) : null;
    fail((await client.from("garments").insert({ user_id: userId, catalog_key: null, name: payload.name.slice(0, 30), category: payload.category.slice(0, 12), color: typeof payload.color === "string" ? payload.color : "#d8d0c2", color_name: typeof payload.colorName === "string" ? payload.colorName.slice(0, 12) : "其他", meta: `${material} · ${pattern} · 已确认`, warmth: typeof payload.warmth === "number" ? Math.min(5, Math.max(1, Math.round(payload.warmth))) : 2, style_tags: Array.isArray(payload.styleTags) ? payload.styleTags.slice(0, 5) : [], scene_tags: Array.isArray(payload.sceneTags) ? payload.sceneTags.slice(0, 5) : ["上班", "约会", "休闲"], weather_tags: Array.isArray(payload.weatherTags) ? payload.weatherTags.slice(0, 5) : ["常规"], is_virtual: false, image_key: imageKey, processed_image_key: processedImageKey, recognition_status: recognitionProvider && recognitionProvider !== "manual-fallback" ? "confirmed_ai" : "confirmed_manual", recognition_confidence: typeof payload.recognitionConfidence === "number" ? Math.min(100, Math.max(0, Math.round(payload.recognitionConfidence))) : 0, recognition_provider: recognitionProvider, recognized_at: new Date().toISOString() })).error, "衣物保存失败");
  } else {
    return Response.json({ error: "无法识别的操作" }, { status: 400 });
  }

  return Response.json(await stateFor(client, userId));
}
