import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { getSupabaseAccessToken, getSupabaseUser, type SupabaseIdentity } from "./supabase-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const garmentBucket = "garment-images";
const tosMountPath = process.env.YIDA_TOS_MOUNT_PATH ?? "";

export type UserDataContext = {
  client: SupabaseClient;
  user: SupabaseIdentity;
  accessToken: string;
};

export function usesSupabaseData() {
  return process.env.YIDA_DATA_BACKEND === "supabase";
}

export function usesTosImages() {
  return process.env.YIDA_IMAGE_BACKEND === "tos";
}

function contentTypeForKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function mountedTosPath(key: string) {
  if (!tosMountPath) throw new Error("TOS 图片存储尚未配置");
  const path = await import("node:path");
  const root = path.resolve(tosMountPath);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("无效的图片路径");
  return { path, target };
}

async function uploadMountedTos(key: string, bytes: Uint8Array) {
  const fs = await import("node:fs/promises");
  const { path, target } = await mountedTosPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}

async function downloadMountedTos(key: string) {
  const fs = await import("node:fs/promises");
  const { target } = await mountedTosPath(key);
  try {
    const bytes = await fs.readFile(target);
    return new Blob([new Uint8Array(bytes)], { type: contentTypeForKey(key) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function removeMountedTos(keys: string[]) {
  const fs = await import("node:fs/promises");
  await Promise.all(keys.map(async (key) => {
    const { target } = await mountedTosPath(key);
    await fs.rm(target, { force: true });
  }));
}

async function mountedTosImageExists(key: string) {
  const fs = await import("node:fs/promises");
  const { target } = await mountedTosPath(key);
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function requireUserData(request: Request): Promise<UserDataContext> {
  const accessToken = getSupabaseAccessToken(request);
  if (!accessToken) throw new Error("请先登录");
  const user = await getSupabaseUser(request, accessToken);
  if (!user) throw new Error("登录状态已失效，请重新登录");
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // veFaaS currently runs this app on Node.js 20, which has no native
    // WebSocket. Supabase initializes its Realtime client even though our API
    // routes only use PostgREST and Storage, so provide a compatible transport
    // to keep client construction from failing.
    realtime: { transport: WebSocket },
  });
  return { client, user, accessToken };
}

export async function uploadUserImage(
  client: SupabaseClient,
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  if (usesTosImages()) {
    await uploadMountedTos(key, bytes);
    return;
  }
  const { error } = await client.storage.from(garmentBucket).upload(key, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(`图片上传失败：${error.message}`);
}

export async function downloadUserImage(client: SupabaseClient, key: string) {
  if (usesTosImages()) {
    const stored = await downloadMountedTos(key);
    if (stored) return stored;

    // During migration, read an existing Supabase object once and copy it into
    // the Beijing TOS mount. New uploads never write back to Supabase.
    const legacy = await client.storage.from(garmentBucket).download(key);
    if (legacy.error || !legacy.data) return null;
    const bytes = new Uint8Array(await legacy.data.arrayBuffer());
    await uploadMountedTos(key, bytes);
    return new Blob([bytes], { type: legacy.data.type || contentTypeForKey(key) });
  }
  const { data, error } = await client.storage.from(garmentBucket).download(key);
  if (error || !data) return null;
  return data;
}

export async function removeUserImages(client: SupabaseClient, keys: string[]) {
  if (!keys.length) return;
  if (usesTosImages()) await removeMountedTos(keys);
  const { error } = await client.storage.from(garmentBucket).remove(keys);
  if (error) throw new Error(`图片删除失败：${error.message}`);
}

export async function userImageExists(client: SupabaseClient, key: string) {
  if (usesTosImages() && await mountedTosImageExists(key)) return true;
  const segments = key.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");
  if (!fileName) return false;
  const { data, error } = await client.storage.from(garmentBucket).list(directory, {
    search: fileName,
    limit: 10,
  });
  if (error) return false;
  return data.some((item) => item.name === fileName);
}
