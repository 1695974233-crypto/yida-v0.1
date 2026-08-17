import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { feedback, garments, profiles } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
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
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_garments_user_catalog ON garments(user_id, catalog_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON feedback(user_id, created_at)"),
  ]);
  await d1.prepare("PRAGMA optimize").run();
}

function parseList(value: string): string[] {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

async function currentUser(request: Request) {
  const user = await getChatGPTUser();
  if (user) return { id: user.userId, name: user.fullName ?? "晚晚" };
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return { id: "local-preview", name: "晚晚" };
  return null;
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
  const existing = await db.select({ id: garments.id }).from(garments).where(eq(garments.userId, userId)).limit(1);
  if (!existing.length) {
    const seed = defaultCatalogKeys.map((key) => catalogValues(userId, key)).filter(Boolean) as NonNullable<ReturnType<typeof catalogValues>>[];
    await db.insert(garments).values(seed).onConflictDoNothing();
    await db.update(garments).set({ dirtyUntil: new Date(Date.now() + 3 * 86400000).toISOString() }).where(and(eq(garments.userId, userId), eq(garments.catalogKey, "pink-skirt")));
  }
}

async function stateFor(userId: string) {
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const clothing = await db.select().from(garments).where(eq(garments.userId, userId)).orderBy(desc(garments.createdAt), desc(garments.id));
  const actions = await db.select().from(feedback).where(eq(feedback.userId, userId)).orderBy(desc(feedback.createdAt)).limit(100);
  const now = new Date().toISOString();
  return {
    profile: { displayName: profile?.displayName ?? "晚晚", preferredStyles: parseList(profile?.preferredStyles ?? "[]"), lastScene: profile?.lastScene ?? null, onboardingCompleted: Boolean(profile?.onboardingCompleted) },
    garments: clothing.map((item) => ({ ...item, dirty: Boolean(item.dirtyUntil && item.dirtyUntil > now), styleTags: parseList(item.styleTags), sceneTags: parseList(item.sceneTags), weatherTags: parseList(item.weatherTags) })),
    feedback: actions,
    catalog: virtualCatalog,
  };
}

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ error: "请先登录后使用衣柜" }, { status: 401 });
    await ensureUser(user.id, user.name);
    return Response.json(await stateFor(user.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "衣柜加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ error: "请先登录后使用衣柜" }, { status: 401 });
    await ensureUser(user.id, user.name);
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();

    if (payload.action === "toggle_dirty" && typeof payload.garmentId === "number") {
      const [item] = await db.select().from(garments).where(and(eq(garments.id, payload.garmentId), eq(garments.userId, user.id))).limit(1);
      if (item) await db.update(garments).set({ dirtyUntil: item.dirtyUntil && item.dirtyUntil > new Date().toISOString() ? null : new Date(Date.now() + 3 * 86400000).toISOString() }).where(and(eq(garments.id, item.id), eq(garments.userId, user.id)));
    } else if (payload.action === "add_catalog" && typeof payload.catalogKey === "string") {
      const values = catalogValues(user.id, payload.catalogKey);
      if (values) await db.insert(garments).values(values).onConflictDoNothing();
    } else if (payload.action === "remove_catalog" && typeof payload.catalogKey === "string") {
      await db.delete(garments).where(and(eq(garments.userId, user.id), eq(garments.catalogKey, payload.catalogKey)));
    } else if (payload.action === "update_scene") {
      await db.update(profiles).set({ lastScene: typeof payload.scene === "string" ? payload.scene : null, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "update_styles" && Array.isArray(payload.styles)) {
      await db.update(profiles).set({ preferredStyles: JSON.stringify(payload.styles), updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "complete_onboarding") {
      await db.update(profiles).set({ onboardingCompleted: true, preferredStyles: Array.isArray(payload.styles) ? JSON.stringify(payload.styles) : undefined, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.id));
    } else if (payload.action === "feedback" && typeof payload.outfitKey === "string" && typeof payload.feedbackAction === "string") {
      await db.insert(feedback).values({ userId: user.id, outfitKey: payload.outfitKey, action: payload.feedbackAction, reason: typeof payload.reason === "string" ? payload.reason : null });
    } else if (payload.action === "add_garment" && typeof payload.name === "string" && typeof payload.category === "string") {
      await db.insert(garments).values({ userId: user.id, catalogKey: null, name: payload.name, category: payload.category, color: typeof payload.color === "string" ? payload.color : "#d8d0c2", colorName: typeof payload.colorName === "string" ? payload.colorName : "其他", meta: "手动添加 · 信息可修改", warmth: 2, styleTags: JSON.stringify([]), sceneTags: JSON.stringify(["上班", "约会", "休闲"]), weatherTags: JSON.stringify(["常规"]), isVirtual: false });
    } else {
      return Response.json({ error: "无法识别的操作" }, { status: 400 });
    }

    return Response.json(await stateFor(user.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
