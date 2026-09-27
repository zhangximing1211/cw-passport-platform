import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));

async function readBuiltApp() {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const assetDir = path.join(distDir, "assets");
  const files = await readdir(assetDir);
  const scripts = await Promise.all(
    files
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFile(path.join(assetDir, file), "utf8")),
  );
  return { html, js: scripts.join("\n") };
}

test("emits CW Passport sharing metadata", async () => {
  const { html } = await readBuiltApp();
  assert.match(html, /<title>CW Passport — Construction Waste Intelligence Platform<\/title>/);
  assert.match(html, /property="og:title"[^>]*content="CW Passport — Construction Waste Intelligence Platform"/);
  assert.match(html, /name="twitter:card"[^>]*content="summary_large_image"/);
  assert.match(html, /\/og\.png/);
});

test("bundles the CW Passport sign-in and demo credentials", async () => {
  const { js } = await readBuiltApp();
  assert.match(js, /CW Passport/);
  assert.match(js, /Sign in to your workspace/);
  assert.match(js, /demo1234/);
  assert.doesNotMatch(js, /signin-with-chatgpt|Sign in with ChatGPT/);
});
