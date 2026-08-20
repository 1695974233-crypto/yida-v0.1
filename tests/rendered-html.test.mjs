import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const projectRoot = new URL("../", import.meta.url);

async function loadTypeScriptModule(url) {
  const source = await readFile(url, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("removes disliked outfits before filling and rotating recommendations", async () => {
  const { selectEligibleOutfits } = await loadTypeScriptModule(new URL("../lib/outfit-selection.ts", import.meta.url));
  const generated = ["a", "b", "c", "d", "e"].map((key) => ({ key }));

  assert.deepEqual(selectEligibleOutfits(generated, ["b"], 0).visible.map((item) => item.key), ["a", "c", "d"]);
  assert.deepEqual(selectEligibleOutfits(generated, ["a", "b"], 1).visible.map((item) => item.key), ["d", "e", "c"]);
  assert.deepEqual(selectEligibleOutfits(generated, ["a", "b", "c", "d", "e"], 0).visible, []);
});

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

test("includes Supabase sign-in and account-bound data", async () => {
  const [page, authRoute, supabaseData, supabaseState, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260819_yida_core.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /邮箱登录/);
  assert.match(page, /signInWithOAuth/);
  assert.doesNotMatch(page, /signin-with-chatgpt/);
  assert.match(page, /今天穿什么/);
  assert.match(page, /useState\(false\).*onboarding|\[onboarding, setOnboarding\] = useState\(false\)/s);
  assert.match(page, /yida_onboarding_completed:/);
  assert.match(page, /!loading && onboarding/);
  assert.match(page, /导入旧衣柜备份/);
  await access(new URL("../app/api/garments/import-legacy/route.ts", import.meta.url));
  assert.match(authRoute, /getSupabaseUser/);
  assert.match(supabaseData, /requireUserData/);
  assert.match(supabaseState, /hasLegacyWardrobe/);
  assert.match(migration, /users_manage_own_rows/);
  assert.match(migration, /garment-images/);
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
  assert.match(arkAdapter, /所有字符串值都必须使用英文双引号/);
  assert.match(arkAdapter, /const repaired = source/);
  assert.match(page, /AI 识别没有成功，请重新识别或手动确认/);
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
  const [page, styles, visualizeRoute, arkAdapter, schema, visitor] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/outfits/visualize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ark.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/visitor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /已切换为真实衣柜/);
  assert.match(page, /效果图/);
  assert.match(page, /正在生成并质检/);
  assert.match(page, /multiple onChange=\{handleUpload\}/);
  assert.match(page, /保存并继续下一件/);
  assert.match(page, /current \+ 3/);
  assert.match(page, /mostSharedItems/);
  assert.match(page, /selectEligibleOutfits\(generatedOutfits, disliked, rotation\)/);
  assert.match(page, /setDisliked\(\(current\) => current\.includes\(outfitKey\)/);
  assert.match(page, /setDisliked\(\(current\) => current\.filter\(\(key\) => key !== outfitKey\)\)/);
  assert.match(page, /current还剩.*未排除的有效搭配|当前还剩.*未排除的有效搭配/);
  assert.match(page, /你点过“不适合我”的组合不会再次出现/);
  assert.match(page, /放大查看/);
  assert.match(page, /look-modal/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /pieces-/);
  assert.match(page, /AI 模特身体资料/);
  assert.match(page, /性别/);
  assert.match(page, /女生/);
  assert.match(page, /男生/);
  assert.doesNotMatch(page, /value: "不指定"/);
  assert.match(page, /肩胯接近，腰线自然/);
  assert.match(page, /body-reference/);
  assert.match(page, /上传本人全身照/);
  assert.match(visualizeRoute, /checkVisualizationAllowance/);
  assert.match(visualizeRoute, /recordSuccessfulVisualization/);
  assert.match(visualizeRoute, /今天已成功生成 10 套/);
  assert.match(visualizeRoute, /fullBodyImageKey/);
  assert.match(arkAdapter, /visualizeOutfitWithSeedream/);
  assert.match(arkAdapter, /真人虚拟试穿生成器/);
  const visualizationSize = arkAdapter.match(/SEEDREAM_VISUALIZATION_SIZE = "(\d+)x(\d+)"/);
  assert.ok(visualizationSize, "Seedream visualization size must be an explicit width and height");
  const visualizationWidth = Number(visualizationSize[1]);
  const visualizationHeight = Number(visualizationSize[2]);
  assert.ok(visualizationWidth * visualizationHeight >= 3_686_400, "Seedream visualization must meet the provider's minimum pixel count");
  assert.equal(visualizationWidth * 4, visualizationHeight * 3, "Seedream visualization must remain portrait 3:4");
  assert.match(arkAdapter, /assertSeedreamVisualizationSize/);
  assert.match(arkAdapter, /requestVisualization\("2K", requestPrompt, requestImages\)/);
  assert.match(arkAdapter, /reviewFullBodyComposition/);
  assert.match(arkAdapter, /bothFeetVisible/);
  assert.match(page, /不合格将自动修复/);
  assert.match(arkAdapter, /效果图尺寸配置暂时异常/);
  assert.match(styles, /\.look-modal-image img[^}]*width: auto[^}]*height: auto[^}]*max-width: 100%[^}]*max-height: 100%[^}]*object-fit: contain/);
  assert.doesNotMatch(styles, /\.look-modal-image img[^}]*transform:/);
  assert.match(visualizeRoute, /portrait-wide-full-body/);
  assert.match(visualizeRoute, /full-body-v2/);
  assert.match(arkAdapter, /人物只占画面高度的 60%—68%/);
  assert.match(arkAdapter, /鞋底下方保留至少画面高度 12%/);
  assert.match(arkAdapter, /seedreamError/);
  assert.match(arkAdapter, /清单没有外套时绝对不能生成外套/);
  assert.match(schema, /bodyHeight/);
  assert.match(schema, /visualizationUsage/);
  assert.match(visitor, /yida_visitor/);
  assert.match(visitor, /Max-Age=31536000/);
  await access(new URL("../drizzle/0006_jittery_skaar.sql", import.meta.url));
  await access(new URL("../drizzle/0007_exotic_whizzer.sql", import.meta.url));
  await access(new URL("../drizzle/0008_illegal_roulette.sql", import.meta.url));
});
