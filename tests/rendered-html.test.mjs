import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Yida product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /易搭/);
  assert.match(html, /正在确认登录状态/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("includes ChatGPT sign-in, sign-out and account-bound data", async () => {
  const [page, authRoute, visitor, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/visitor.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /signin-with-chatgpt/);
  assert.match(page, /signout-with-chatgpt/);
  assert.match(page, /今天穿什么/);
  assert.match(authRoute, /getChatGPTUser/);
  assert.match(visitor, /account_links/);
  assert.match(schema, /accountLinks/);
  await access(new URL("../drizzle/0009_salty_shriek.sql", import.meta.url));
});

test("includes the phase-three garment pipeline", async () => {
  const [page, analyzeRoute, schema, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/garments/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Seedream/);
  assert.match(page, /确认信息，加入衣柜/);
  assert.match(analyzeRoute, /enhanceGarmentWithSeedream/);
  assert.match(analyzeRoute, /analyzeGarmentWithArk/);
  const arkAdapter = await readFile(new URL("../lib/ark.ts", import.meta.url), "utf8");
  assert.match(arkAdapter, /ark\.cn-beijing\.volces\.com\/api\/v3/);
  assert.doesNotMatch(arkAdapter, /bytepluses|ap-southeast/);
  assert.match(schema, /recognitionConfidence/);
  assert.equal(JSON.parse(hosting).r2, "GARMENT_IMAGES");
  await access(new URL("../drizzle/0003_chubby_sprite.sql", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});

test("includes real weather and privacy-aware location", async () => {
  const [page, weatherRoute, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /使用我的当前位置/);
  assert.match(page, /手动选择/);
  assert.match(weatherRoute, /api\.open-meteo\.com/);
  assert.match(weatherRoute, /apparent_temperature/);
  assert.match(schema, /weatherLatitude/);
  await access(new URL("../drizzle/0005_breezy_natasha_romanoff.sql", import.meta.url));
});

test("switches to real wardrobe photos and supports Seedream mannequin previews", async () => {
  const [page, visualizeRoute, arkAdapter, schema, visitor] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/outfits/visualize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ark.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/visitor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /已切换为真实衣柜/);
  assert.match(page, /重新生成试穿/);
  assert.match(page, /AI 模特身体资料/);
  assert.match(page, /性别/);
  assert.match(page, /女生/);
  assert.match(page, /男生/);
  assert.doesNotMatch(page, /value: "不指定"/);
  assert.match(page, /肩胯接近，腰线自然/);
  assert.match(page, /body-reference/);
  assert.match(page, /上传本人全身照/);
  assert.match(page, /正在给.*穿上这套衣服/);
  assert.match(visualizeRoute, /checkVisualizationAllowance/);
  assert.match(visualizeRoute, /recordSuccessfulVisualization/);
  assert.match(visualizeRoute, /fullBodyImageKey/);
  assert.match(arkAdapter, /visualizeOutfitWithSeedream/);
  assert.match(arkAdapter, /真人虚拟试穿生成器/);
  assert.match(schema, /bodyHeight/);
  assert.match(schema, /visualizationUsage/);
  assert.match(visitor, /yida_visitor/);
  assert.match(visitor, /Max-Age=31536000/);
  await access(new URL("../drizzle/0006_jittery_skaar.sql", import.meta.url));
  await access(new URL("../drizzle/0007_exotic_whizzer.sql", import.meta.url));
  await access(new URL("../drizzle/0008_illegal_roulette.sql", import.meta.url));
});
