import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull().default("晚晚"),
  preferredStyles: text("preferred_styles").notNull().default('["简约通勤","清爽休闲"]'),
  lastScene: text("last_scene"),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const garments = sqliteTable("garments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  catalogKey: text("catalog_key"),
  name: text("name").notNull(),
  category: text("category").notNull(),
  color: text("color").notNull(),
  colorName: text("color_name").notNull(),
  meta: text("meta").notNull().default(""),
  warmth: integer("warmth").notNull().default(2),
  styleTags: text("style_tags").notNull().default("[]"),
  sceneTags: text("scene_tags").notNull().default("[]"),
  weatherTags: text("weather_tags").notNull().default("[]"),
  isVirtual: integer("is_virtual", { mode: "boolean" }).notNull().default(true),
  dirtyUntil: text("dirty_until"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_garments_user_catalog").on(table.userId, table.catalogKey),
]);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  outfitKey: text("outfit_key").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_feedback_user_created").on(table.userId, table.createdAt),
]);

export const chatSessions = sqliteTable("chat_sessions", {
  userId: text("user_id").primaryKey(),
  activeRequest: text("active_request"),
  constraints: text("constraints").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_chat_messages_user_created").on(table.userId, table.createdAt),
]);
