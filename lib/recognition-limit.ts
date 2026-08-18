import { env } from "cloudflare:workers";

const DAILY_RECOGNITION_LIMIT = 10;

type RuntimeEnv = { DB?: D1Database };

function chinaDateKey(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function consumeRecognition(visitorId: string) {
  const database = (env as unknown as RuntimeEnv).DB;
  if (!database) throw new Error("每日识别额度服务暂时不可用");

  await database.prepare(`CREATE TABLE IF NOT EXISTS recognition_usage (
    visitor_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    count INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY(visitor_id, usage_date)
  )`).run();

  const usageDate = chinaDateKey();
  const result = await database.prepare(`INSERT INTO recognition_usage (visitor_id, usage_date, count, updated_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(visitor_id, usage_date) DO UPDATE SET
      count = recognition_usage.count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE recognition_usage.count < ?
    RETURNING count`).bind(visitorId, usageDate, DAILY_RECOGNITION_LIMIT).first<{ count: number }>();

  if (!result) return { allowed: false as const, limit: DAILY_RECOGNITION_LIMIT, remaining: 0 };
  return {
    allowed: true as const,
    limit: DAILY_RECOGNITION_LIMIT,
    remaining: Math.max(0, DAILY_RECOGNITION_LIMIT - result.count),
  };
}
