import { env } from "cloudflare:workers";
import { requireUserData, usesSupabaseData } from "./supabase-data";

const DAILY_VISUALIZATION_LIMIT = 10;

type RuntimeEnv = { DB?: D1Database; YIDA_DEVELOPER_EMAILS?: string };

function isDeveloper(email?: string) {
  if (!email) return false;
  const configured = (env as unknown as RuntimeEnv).YIDA_DEVELOPER_EMAILS ?? process.env.YIDA_DEVELOPER_EMAILS ?? "";
  return configured.split(",").some((item) => item.trim().toLowerCase() === email.trim().toLowerCase());
}

function chinaDateKey(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function ensureVisualizationTable(database: D1Database) {
  await database.prepare(`CREATE TABLE IF NOT EXISTS visualization_usage (
    visitor_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    count INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY(visitor_id, usage_date)
  )`).run();
}

export async function checkVisualizationAllowance(visitorId: string, email?: string, request?: Request) {
  if (isDeveloper(email)) return { allowed: true as const, limit: null, remaining: null, developer: true as const };
  if (usesSupabaseData()) {
    if (!request) throw new Error("缺少登录请求信息");
    const { client, user } = await requireUserData(request);
    const usageDate = chinaDateKey();
    const current = await client.from("visualization_usage").select("count").eq("user_id", user.id).eq("usage_date", usageDate).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const count = current.data?.count ?? 0;
    return { allowed: count < DAILY_VISUALIZATION_LIMIT, limit: DAILY_VISUALIZATION_LIMIT, remaining: Math.max(0, DAILY_VISUALIZATION_LIMIT - count), developer: false as const };
  }
  const database = (env as unknown as RuntimeEnv).DB;
  if (!database) throw new Error("AI 模特额度服务暂时不可用");
  await ensureVisualizationTable(database);
  const usageDate = chinaDateKey();
  const current = await database.prepare("SELECT count FROM visualization_usage WHERE visitor_id = ? AND usage_date = ?").bind(visitorId, usageDate).first<{ count: number }>();
  const count = current?.count ?? 0;
  return { allowed: count < DAILY_VISUALIZATION_LIMIT, limit: DAILY_VISUALIZATION_LIMIT, remaining: Math.max(0, DAILY_VISUALIZATION_LIMIT - count), developer: false as const };
}

export async function recordSuccessfulVisualization(visitorId: string, email?: string, request?: Request) {
  if (isDeveloper(email)) return { allowed: true as const, limit: null, remaining: null, developer: true as const };
  if (usesSupabaseData()) {
    if (!request) throw new Error("缺少登录请求信息");
    const { client, user } = await requireUserData(request);
    const usageDate = chinaDateKey();
    const current = await client.from("visualization_usage").select("count").eq("user_id", user.id).eq("usage_date", usageDate).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const nextCount = (current.data?.count ?? 0) + 1;
    if (nextCount > DAILY_VISUALIZATION_LIMIT) return { allowed: false as const, limit: DAILY_VISUALIZATION_LIMIT, remaining: 0, developer: false as const };
    const saved = await client.from("visualization_usage").upsert({ user_id: user.id, usage_date: usageDate, count: nextCount, updated_at: new Date().toISOString() }, { onConflict: "user_id,usage_date" });
    if (saved.error) throw new Error(saved.error.message);
    return { allowed: true as const, limit: DAILY_VISUALIZATION_LIMIT, remaining: DAILY_VISUALIZATION_LIMIT - nextCount, developer: false as const };
  }
  const database = (env as unknown as RuntimeEnv).DB;
  if (!database) throw new Error("AI 模特额度服务暂时不可用");
  await ensureVisualizationTable(database);
  const usageDate = chinaDateKey();
  const result = await database.prepare(`INSERT INTO visualization_usage (visitor_id, usage_date, count, updated_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(visitor_id, usage_date) DO UPDATE SET
      count = visualization_usage.count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE visualization_usage.count < ?
    RETURNING count`).bind(visitorId, usageDate, DAILY_VISUALIZATION_LIMIT).first<{ count: number }>();
  if (!result) return { allowed: false as const, limit: DAILY_VISUALIZATION_LIMIT, remaining: 0, developer: false as const };
  return { allowed: true as const, limit: DAILY_VISUALIZATION_LIMIT, remaining: DAILY_VISUALIZATION_LIMIT - result.count, developer: false as const };
}
