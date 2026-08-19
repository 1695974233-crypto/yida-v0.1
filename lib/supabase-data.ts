import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAccessToken, getSupabaseUser, type SupabaseIdentity } from "./supabase-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const garmentBucket = "garment-images";

export type UserDataContext = {
  client: SupabaseClient;
  user: SupabaseIdentity;
  accessToken: string;
};

export function usesSupabaseData() {
  return process.env.YIDA_DATA_BACKEND === "supabase";
}

export async function requireUserData(request: Request): Promise<UserDataContext> {
  const accessToken = getSupabaseAccessToken(request);
  if (!accessToken) throw new Error("请先登录");
  const user = await getSupabaseUser(request, accessToken);
  if (!user) throw new Error("登录状态已失效，请重新登录");
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, user, accessToken };
}

export async function uploadUserImage(
  client: SupabaseClient,
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { error } = await client.storage.from(garmentBucket).upload(key, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(`图片上传失败：${error.message}`);
}

export async function downloadUserImage(client: SupabaseClient, key: string) {
  const { data, error } = await client.storage.from(garmentBucket).download(key);
  if (error || !data) return null;
  return data;
}

export async function removeUserImages(client: SupabaseClient, keys: string[]) {
  if (!keys.length) return;
  const { error } = await client.storage.from(garmentBucket).remove(keys);
  if (error) throw new Error(`图片删除失败：${error.message}`);
}

export async function userImageExists(client: SupabaseClient, key: string) {
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
