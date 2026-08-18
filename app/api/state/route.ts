import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { chatMessages, chatSessions, feedback, garments, profiles } from "../../../db/schema";
import { getVisitor, visitorCookie } from "../../../lib/visitor";
import { defaultCatalogKeys, virtualCatalog } from "../../catalog";

export const dynamic = "force-dynamic";

async function ensureSchema() {
  const d1 = env.DB;
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT DEFAULT '晚晚' NOT NULL,
      preferred_styles TEXT DEFAULT '["简约通勤","清爽休闲"]' NOT NULL,
      last_scene TEXT,
      weather_city TEXT,
      weather_latitude REAL,
      weather_longitude REAL,
      body_height INTEGER,
      body_weight INTEGER,
      body_shape TEXT,
      model_presentation TEXT,
      full_body_image_key TEXT,
      onboarding_completed INTEGER DEFAULT false NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      catalog_key TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      color_name TEXT NOT NULL,
      meta TEXT DEFAULT '' NOT NULL,
      warmth INTEGER DEFAULT 2 NOT NULL,
      style_tags TEXT DEFAULT '[]' NOT NULL,
      scene_tags TEXT DEFAULT '[]' NOT NULL,
      weather_tags TEXT DEFAULT '[]' NOT NULL,
      is_virtual INTEGER DEFAULT true NOT NULL,
      image_key TEXT,
      processed_image_key TEXT,
      recognition_status TEXT DEFAULT 'manual' NOT NULL,
      recognition_confidence INTEGER DEFAULT 0 NOT NULL,
      recognition_provider TEXT,
      recognized_at TEXT,
      dirty_until TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      outfit_key TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS chat_sessions (
      user_id TEXT PRIMARY KEY NOT NULL,
      active_request TEXT,
      constraints TEXT DEFAULT '{}' NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_garments_user_catalog ON garments(user_id, catalog_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON feedback(user_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at)"),
  ]);
  const profileColumns = await d1.prepare("PRAGMA table_info(profiles)").all<{ name: string }>();
  const existingProfileColumns = new Set(profileColumns.results.map((column) => column.name));
  const profileAdditions: Array<[string, string]> = [
    ["weather_city", "ALTER TABLE profiles ADD COLUMN weather_city TEXT"],
    ["weather_latitude", "ALTER TABLE profiles ADD COLUMN weather_latitude REAL"],
    ["weather_longitude", "ALTER TABLE profiles ADD COLUMN weather_longitude REAL"],
    ["body_height", "ALTER TABLE profiles ADD COLUMN body_height INTEGER"],
    ["body_weight", "ALTER TABLE profiles ADD COLUMN body_weight INTEGER"],
    ["body_shape", "ALTER TABLE profiles ADD COLUMN body_shape TEXT"],
    ["model_presentation", "ALTER TABLE profiles ADD COLUMN model_presentation TEXT"],
    ["full_body_image_key", "ALTER TABLE profiles ADD COLUMN full_body_image_key TEXT"],
  ];
  for (const [column, statement] of profileAdditions) {
    if (!existingProfileColumns.has(column)) await d1.prepare(statement).run();
  }
  const garmentColumns = await d1.prepare("PRAGMA table_info(garments)").all<{ name: string }>();
  const existingColumns = new Set(garmentColumns.results.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["image_key", "ALTER TABLE garments ADD COLUMN image_key TEXT"],
    ["processed_image_key", "ALTER TABLE garments ADD COLUMN processed_image_key TEXT"],
    ["recognition_status", "ALTER TABLE garments ADD COLUMN recognition_status TEXT DEFAULT 'manual' NOT NULL"],
    ["recognition_confidence", "ALTER TABLE garments ADD COLUMN recognition_confidence INTEGER DEFAULT 0 NOT NULL"],
    ["recognition_provider", "ALTER TABLE garments ADD COLUMN recognition_provider TEXT"],
    ["recognized_at", "ALTER TABLE garments ADD COLUMN recognized_at TEXT"],
  ];
  for (const [column, statement] of additions) {
    if (!existingColumns.has(column)) await d1.prepare(statement).run();
  }
  await d1.prepare("PRAGMA optimize").run();
}

function parseList(value: string): string[] {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

type RequestConstraints = { scene?: string; warmth?: "warmer" | "lighter"; formality?: "formal" | "casual"; avoid?: string[]; colors?: string[] };

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

function catalogValues(userId: string, key: string) {
  const item = virtualCatalog.find((entry) => entry.key === key);
  if (!item) return null;
  return {
    userId,
    catalogKey: item.key,
    name: item.name,
    category: item.category,
    color: item.color,
    colorName: item.colorName,
    meta: item.meta,
    warmth: item.warmth,
    styleTags: JSON.stringify(item.styleTags),
    sceneTags: JSON.stringify(item.sceneTags),
    weatherTags: JSON.stringify(item.weatherTags),
    isVirtual: true,
  };
}

async function ensureUser(userId: string, displayName: string) {
  await ensureSchema();
  const db = getDb();
  await db.insert(profiles).values({ userId, displayName }).onConflictDoNothing();
  await db.insert(chatSessions).values({ userId }).onConflictDoNothing();
  const existing = await db.select({ id: garments.id }).from(garments).where(eq(garments.userId, userId)).limit(1);
  if (!existing.length) {
    const seed = defaultCatalogKeys.map((key) => catalogValues(userId, key)).filter(Boolean) as NonNullable<ReturnType<typeof catalogValues>>[];
    // D1 limits the number of bound parameters in one statement. Inserting all
    // catalog garments at once exceeds that limit as garment metadata grows.
    for (const item of seed) await db.insert(garments).values(item).onConflictDoNothing();
    await db.update(garments).set({ dirtyUntil: new Date(Date.now() + 3 * 86400000).toISOString() }).where(and(eq(garments.userId, userId), eq(garments.catalogKey, "pink-skirt")));
  }
}

async function stateFor(userId: string) {
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const clothing = await db.select().from(garments).where(eq(garments.userId, userId)).orderBy(desc(garments.createdAt), desc(garments.id));
  const actions = await db.select().from(feedback).where(eq(feedback.userId, userId)).orderBy(desc(feedback.createdAt)).limit(100);
  const [chatSession] = await db.select().from(chatSessions).where(eq(chatSessions.userId, userId)).limit(1);
  const messages = (await db.select().from(chatMessages).where(eq(chatMessages.userId, userId)).orderBy(desc(chatMessages.createdAt), desc(chatMessages.id)).limit(40)).reverse();
  const now = new Date().toISOString();
  return {
    profile: {
      displayName: profile?.displayName ?? "晚晚",
      preferredStyles: parseList(profile?.preferredStyles ?? "[]"),
      lastScene: profile?.lastScene ?? null,
      onboardingCompleted: Boolean(profile?.onboardingCompleted),
      weatherCity: profile?.weatherCity ?? null,
      weatherLatitude: profile?.weatherLatitude ?? null,
      weatherLongitude: profile?.weatherLongitude ?? null,
      bodyHeight: profile?.bodyHeight ?? null,
      bodyWeight: profile?.bodyWeight ?? null,
      bodyShape: profile?.bodyShape ?? null,
      modelPresentation: profile?.modelPresentation ?? null,
      fullBodyImageUrl: profile?.fullBodyImageKey ? `/api/garments/image?key=${encodeURIComponent(profile.fullBodyImageKey)}` : null,
    },
    garments: clothing.map((item) => ({
      ...item,
      image: item.processedImageKey || item.imageKey ? `/api/garments/image?key=${encodeURIComponent(item.processedImageKey ?? item.imageKey ?? "")}` : undefined,
      dirty: Boolean(item.dirtyUntil && item.dirtyUntil > now),
      styleTags: parseList(item.styleTags),
      sceneTags: parseList(item.sceneTags),
      weatherTags: parseList(item.weatherTags),
    })),
    feedback: actions,
    chat: { activeRequest: chatSession?.activeRequest ?? null, constraints: JSON.parse(chatSession?.constraints ?? "{}") as RequestConstraints, messages },
    catalog: virtualCatalog,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getVisitor(request);
    await ensureUser(user.id, user.name);
    const response = Response.json(await stateFor(user.id));
    const cookie = visitorCookie(user);
    if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    console.error("state GET failed", error);
    return Response.json({ error: "衣柜加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getVisitor(request);
    await ensureUser(user.id, user.name);
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();

    if (payload.action === "delete_garment" && typeof payload.garmentId === "number") {
      const [item] = await db.select().from(garments).where(and(eq(garments.id, payload.garmentId), eq(garments.userId, user.id))).limit(1);
      if (item) {
        const bucket = (env as unknown as { GARMENT_IMAGES?: R2Bucket }).GARMENT_IMAGES;
        const imageKeys = [item.imageKey, item.processedImageKey].filter((key): key is string => Boolean(key && key.startsWith(`${user.id}/`)));
        if (bucket) await Promise.all(imageKeys.map((key) => bucket.delete(key)));
        await db.delete(garments).where(and(eq(garments.id, item.id), eq(garments.userId, user.id)));
      }
    } else if (payload.action === "update_garment" && typeof payload.garmentId === "number" && typeof payload.name === "string" && typeof payload.category === "string") {
      const material = typeof payload.material === "string" ? payload.material.slice(0, 20) : "待确认";
      const pattern = typeof payload.pattern === "string" ? payload.pattern.slice(0, 20) : "待确认";
      await db.update(garments).set({
        name: payload.name.slice(0, 30),
        category: payload.category.slice(0, 12),
        color: typeof payload.color === "string" ? payload.color : "#d8d0c2",
        colorName: typeof payload.colorName === "string" ? payload.colorName.slice(0, 12) : "其他",
        meta: `${material} · ${pattern} · 已确认`,
        warmth: typeof payload.warmth === "number" ? Math.min(5, Math.max(1, Math.round(payload.warmth))) : 2,
        styleTags: JSON.stringify(Array.isArray(payload.styleTags) ? payload.styleTags.slice(0, 5) : []),
        sceneTags: JSON.stringify(Array.isArray(payload.sceneTags) ? payload.sceneTags.slice(0, 5) : []),
        weatherTags: JSON.stringify(Array.isArray(payload.weatherTags) ? payload.weatherTags.slice(0, 5) : ["常规"]),
      }).where(and(eq(garments.id, payload.garmentId), eq(garments.userId, user.id)));
    } else if (payload.action === "toggle_dirty" && typeof payload.garmentId === "number") {
      const [item] = await db.select().from(garments).where(and(eq(garments.id, payload.garmentId), eq(garments.userId, user.id))).limit(1);
      if (item) await db.update(garments).set({ dirtyUntil: item.dirtyUntil && item.dirtyUntil > new Date().toISOString() ? null : new Date(Date.now() + 3 * 86400000).toISOString() }).where(and(eq(garments.id, item.id), eq(garments.userId, user.id)));
    } else if (payload.action === "add_catalog" && typeof payload.catalogKey === "string") {
      const values = catalogValues(user.id, payload.catalogKey);
      if (values) await db.insert(garments).values(values).onConflictDoNothing();
    } else if (payload.action === "remove_catalog" && typeof payload.catalogKey === "string") {
      await db.delete(garments).where(and(eq(garments.userId, user.id), eq(garments.catalogKey, payload.catalogKey)));
    } else if (payload.action === "update_scene") {
      await db.update(profiles).set({ lastScene: typeof payload.scene === "string" ? payload.scene : null, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "update_location") {
      const latitude = typeof payload.latitude === "number" && Number.isFinite(payload.latitude) ? Math.round(payload.latitude * 100) / 100 : null;
      const longitude = typeof payload.longitude === "number" && Number.isFinite(payload.longitude) ? Math.round(payload.longitude * 100) / 100 : null;
      if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return Response.json({ error: "位置数据无效" }, { status: 400 });
      }
      await db.update(profiles).set({
        weatherCity: typeof payload.city === "string" ? payload.city.slice(0, 40) : "当前位置",
        weatherLatitude: latitude,
        weatherLongitude: longitude,
        updatedAt: new Date().toISOString(),
      }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "update_styles" && Array.isArray(payload.styles)) {
      await db.update(profiles).set({ preferredStyles: JSON.stringify(payload.styles), updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "update_body_profile") {
      const height = typeof payload.height === "number" ? Math.round(payload.height) : null;
      const weight = typeof payload.weight === "number" ? Math.round(payload.weight) : null;
      const allowedShapes = ["匀称", "偏瘦", "肩宽", "梨形", "苹果形", "曲线型"];
      const allowedPresentations = ["女生", "男生"];
      if (height === null || height < 120 || height > 220 || weight === null || weight < 30 || weight > 200) {
        return Response.json({ error: "请填写有效的身高和体重" }, { status: 400 });
      }
      await db.update(profiles).set({
        bodyHeight: height,
        bodyWeight: weight,
        bodyShape: typeof payload.bodyShape === "string" && allowedShapes.includes(payload.bodyShape) ? payload.bodyShape : "匀称",
        modelPresentation: typeof payload.modelPresentation === "string" && allowedPresentations.includes(payload.modelPresentation) ? payload.modelPresentation : "女生",
        updatedAt: new Date().toISOString(),
      }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "complete_onboarding") {
      await db.update(profiles).set({ onboardingCompleted: true, preferredStyles: Array.isArray(payload.styles) ? JSON.stringify(payload.styles) : undefined, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "feedback" && typeof payload.outfitKey === "string" && typeof payload.feedbackAction === "string") {
      await db.insert(feedback).values({ userId: user.id, outfitKey: payload.outfitKey, action: payload.feedbackAction, reason: typeof payload.reason === "string" ? payload.reason : null });
    } else if (payload.action === "send_message" && typeof payload.message === "string" && payload.message.trim()) {
      const message = payload.message.trim().slice(0, 500);
      const parsed = parseRequest(message);
      const [session] = await db.select().from(chatSessions).where(eq(chatSessions.userId, user.id)).limit(1);
      let previous: RequestConstraints = {};
      try { previous = JSON.parse(session?.constraints ?? "{}") as RequestConstraints; } catch { previous = {}; }
      const merged: RequestConstraints = { ...previous, ...parsed, avoid: parsed.avoid ? [...new Set([...(previous.avoid ?? []), ...parsed.avoid])] : previous.avoid, colors: parsed.colors ?? previous.colors };
      const clothingState = await db.select({ dirtyUntil: garments.dirtyUntil }).from(garments).where(eq(garments.userId, user.id));
      const availableCount = clothingState.filter((item) => !item.dirtyUntil || item.dirtyUntil <= new Date().toISOString()).length;
      const reply = assistantReply(merged, availableCount);
      await db.insert(chatMessages).values([{ userId: user.id, role: "user", content: message }, { userId: user.id, role: "assistant", content: reply }]);
      await db.insert(chatSessions).values({ userId: user.id, activeRequest: message, constraints: JSON.stringify(merged), updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: chatSessions.userId, set: { activeRequest: message, constraints: JSON.stringify(merged), updatedAt: new Date().toISOString() } });
      if (parsed.scene) await db.update(profiles).set({ lastScene: parsed.scene, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "clear_request") {
      await db.update(chatSessions).set({ activeRequest: null, constraints: "{}", updatedAt: new Date().toISOString() }).where(eq(chatSessions.userId, user.id));
    } else if (payload.action === "add_garment" && typeof payload.name === "string" && typeof payload.category === "string") {
      const imageKey = typeof payload.imageKey === "string" && payload.imageKey.startsWith(`${user.id}/`) ? payload.imageKey : null;
      const processedImageKey = typeof payload.processedImageKey === "string" && payload.processedImageKey.startsWith(`${user.id}/`) ? payload.processedImageKey : null;
      const material = typeof payload.material === "string" ? payload.material.slice(0, 20) : "待确认";
      const pattern = typeof payload.pattern === "string" ? payload.pattern.slice(0, 20) : "待确认";
      const recognitionProvider = typeof payload.recognitionProvider === "string" ? payload.recognitionProvider.slice(0, 80) : null;
      await db.insert(garments).values({
        userId: user.id,
        catalogKey: null,
        name: payload.name.slice(0, 30),
        category: payload.category.slice(0, 12),
        color: typeof payload.color === "string" ? payload.color : "#d8d0c2",
        colorName: typeof payload.colorName === "string" ? payload.colorName.slice(0, 12) : "其他",
        meta: `${material} · ${pattern} · 已确认`,
        warmth: typeof payload.warmth === "number" ? Math.min(5, Math.max(1, Math.round(payload.warmth))) : 2,
        styleTags: JSON.stringify(Array.isArray(payload.styleTags) ? payload.styleTags.slice(0, 5) : []),
        sceneTags: JSON.stringify(Array.isArray(payload.sceneTags) ? payload.sceneTags.slice(0, 5) : ["上班", "约会", "休闲"]),
        weatherTags: JSON.stringify(Array.isArray(payload.weatherTags) ? payload.weatherTags.slice(0, 5) : ["常规"]),
        isVirtual: false,
        imageKey,
        processedImageKey,
        recognitionStatus: recognitionProvider && recognitionProvider !== "manual-fallback" ? "confirmed_ai" : "confirmed_manual",
        recognitionConfidence: typeof payload.recognitionConfidence === "number" ? Math.min(100, Math.max(0, Math.round(payload.recognitionConfidence))) : 0,
        recognitionProvider,
        recognizedAt: new Date().toISOString(),
      });
    } else {
      return Response.json({ error: "无法识别的操作" }, { status: 400 });
    }

    const response = Response.json(await stateFor(user.id));
    const cookie = visitorCookie(user);
    if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    console.error("state POST failed", error);
    return Response.json({ error: "保存失败" }, { status: 500 });
  }
}
