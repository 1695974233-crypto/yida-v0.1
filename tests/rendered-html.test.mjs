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
  assert.match(html, /今天穿什么/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
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
