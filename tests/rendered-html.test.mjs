import assert from "node:assert/strict";
import test from "node:test";

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

test("renders the CW Passport platform", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /CW Passport/);
  assert.match(html, /Construction Waste Intelligence Overview/);
  assert.match(html, /Passport Registry/);
  assert.match(html, /Material Flow Overview/);
  assert.match(html, /DPP-HK-2026-00428/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Building your site/);
});

test("emits site-specific sharing metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /<title>CW Passport — Construction Waste Intelligence Platform<\/title>/);
  assert.match(html, /property="og:title"[^>]*content="CW Passport — Construction Waste Intelligence Platform"/);
  assert.match(html, /name="twitter:card"[^>]*content="summary_large_image"/);
  assert.match(html, /http:\/\/localhost(?::\d+)?\/og\.png/);
});
