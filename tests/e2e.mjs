// Browser walkthrough of the whole platform against the running dev server.
//
//   npm run dev          (in one terminal)
//   npm run test:e2e     (in another; afterwards `npm run db:reset` restores the demo data)
//
// Drives the installed Microsoft Edge by default; set E2E_BROWSER=chrome to use Google Chrome.
// Screenshots of each step are written to tests/e2e-shots/.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = fileURLToPath(new URL("./e2e-shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER === "chrome" ? "chrome" : "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const problems = [];
// 401 (session check before sign-in) and 404 (no company profile yet) are expected responses.
page.on("console", (msg) => { if (msg.type() === "error" && !/status of 40[14]/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
page.on("response", (res) => { if (res.url().includes("/api/") && res.status() >= 500) problems.push(`HTTP ${res.status()} ${res.url()}`); });

let step = 0;
const shot = async (name) => page.screenshot({ path: `${SHOTS}${String(++step).padStart(2, "0")}-${name}.png`, fullPage: false });
const log = (message) => console.log(`✓ ${message}`);
const toast = async (text) => { await page.locator(".toast").filter({ hasText: text }).first().waitFor(); };
const nav = (label) => page.locator(".nav-item", { hasText: label }).click();

async function signIn(username, password) {
  await page.goto(BASE);
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.locator(".app-shell").waitFor();
}
async function signOut() {
  await page.locator(".avatar.dark").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.locator(".auth-form").waitFor();
}

try {
  // 1. Sign-in page and demo login
  await page.goto(BASE);
  await page.locator(".auth-form").waitFor();
  await shot("login");
  await signIn("demo", "demo1234");
  await page.locator(".kpi-card").first().waitFor();
  await shot("overview");
  log("signed in as demo; overview rendered");
  await page.getByLabel("Date range for overview trends").selectOption("90");
  await page.getByText("vs the previous 90 days").first().waitFor();
  log("date range switches overview trends");

  // 2. Registry filters + pagination
  await nav("Passport Registry");
  await page.locator(".registry-table tbody tr").first().waitFor();
  const firstBefore = await page.locator(".registry-table tbody tr td").first().innerText();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.waitForFunction((before) => document.querySelector(".registry-table tbody tr td")?.textContent !== before, firstBefore);
  log("registry pagination works");
  await page.getByLabel("Material filter").selectOption("Timber");
  await page.waitForFunction(() => [...document.querySelectorAll(".registry-table tbody tr td:nth-child(3)")].every((td) => td.textContent === "Timber"));
  await page.getByLabel("Status filter").selectOption("Verified");
  await page.waitForTimeout(400);
  await shot("registry-filtered");
  log("registry category + status filters work");

  // 3. Register a passport → detail
  await page.getByRole("button", { name: "+ Register Passport" }).click();
  await page.getByLabel("Material Type").selectOption("Concrete");
  await page.getByLabel("Material Name").fill("E2E Crushed Concrete");
  await page.getByLabel("Source Project").fill("E2E Browser Test Site");
  await page.getByLabel("Quantity (t)").fill("150");
  await page.getByLabel("Lifecycle Stage").selectOption("Sorted");
  await page.getByLabel("Current Location").fill("EcoPark, Tuen Mun");
  await page.locator(".modal-card").getByRole("button", { name: "Register Passport" }).click();
  await page.locator(".passport-identity h1", { hasText: "E2E Crushed Concrete" }).waitFor();
  const passportId = (await page.locator(".large-id").innerText()).trim();
  await shot("passport-registered");
  log(`registered ${passportId}; landed on its detail page`);

  // 4. Verify, record event, start transfer
  await page.getByRole("button", { name: "Verify passport" }).click();
  await toast("Passport verified");
  await page.getByRole("button", { name: "Record lifecycle event" }).click();
  await page.getByLabel("New stage").selectOption("Processing");
  await page.getByLabel("Place", { exact: true }).fill("EcoPark");
  await page.locator(".modal-card").getByRole("button", { name: "Record event" }).click();
  await toast("Lifecycle event recorded");
  await page.getByText("Current: Processed").waitFor();
  log("verified passport and recorded Processing event");
  await page.getByRole("button", { name: "Start cross-border transfer" }).click();
  await page.getByLabel("Destination").selectOption("Dongguan");
  await page.locator(".modal-card").getByRole("button", { name: "Create transfer" }).click();
  await page.locator(".transfer-hero h1").waitFor();
  const transferId = (await page.locator(".transfer-hero h1").innerText()).trim();
  log(`created transfer ${transferId}`);

  // 5. Upload a document and run the seven steps
  await page.locator(".upload-row input[type=file]").setInputFiles({ name: "declaration.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e\n%%EOF\n") });
  await page.locator(".upload-row").getByRole("button", { name: "Upload" }).click();
  await page.locator(".doc-row", { hasText: "declaration.pdf" }).waitFor();
  log("uploaded a PDF to the transfer");
  for (const s of ["Documentation Submitted", "Inspection", "Customs / Compliance Review", "Cleared", "Transport", "Received"]) {
    await page.getByRole("button", { name: `Record: ${s}` }).click();
    await page.locator(".modal-card").getByRole("button", { name: "Record step" }).click();
    await toast(`${s} recorded`);
  }
  await page.locator(".transfer-hero .badge", { hasText: "Completed" }).waitFor();
  await shot("transfer-completed");
  log("ran all seven transfer steps");
  await page.locator(".transfer-hero dd .id-link").first().click();
  await page.locator(".quick-drawer.open").getByText("Completed").first().waitFor();
  log("business rule: received transfer completed the passport (drawer shows Completed)");
  await page.keyboard.press("Escape");

  // 6. Second passport → listing → mint → publish
  await nav("Passport Registry");
  await page.getByRole("button", { name: "+ Register Passport" }).click();
  await page.getByLabel("Material Type").selectOption("Concrete");
  await page.getByLabel("Material Name").fill("E2E Recycled Aggregate");
  await page.getByLabel("Source Project").fill("E2E Browser Test Site");
  await page.getByLabel("Quantity (t)").fill("80");
  await page.getByLabel("Lifecycle Stage").selectOption("Processing");
  await page.getByLabel("Current Location").fill("Kwai Tsing Yard");
  await page.locator(".modal-card").getByRole("button", { name: "Register Passport" }).click();
  await page.locator(".passport-identity h1", { hasText: "E2E Recycled Aggregate" }).waitFor();
  await page.getByRole("button", { name: "Verify passport" }).click();
  await toast("Passport verified");
  await page.getByRole("button", { name: "List on marketplace" }).click();
  await page.locator(".modal-card").getByRole("button", { name: "Create listing" }).click();
  await page.locator(".nft-passport").waitFor();
  const listingUrl = page.url();
  await page.getByRole("button", { name: /Mint to blockchain/ }).click();
  await toast("Minted");
  await page.getByRole("button", { name: /List on platform/ }).click();
  await toast("Listing is now live");
  await shot("listing-live");
  log("created listing, minted and published it");

  // 7. Buyer opens a trade; seller (CW Passport = demo) confirms delivery
  await signOut();
  await signIn("buyer", "buyer1234");
  await page.goto(listingUrl);
  await page.getByRole("button", { name: "Open a trade" }).click();
  await page.getByLabel("Quantity (t)").fill("80");
  await page.getByLabel("Total price (HK$)").fill("12000");
  await page.locator(".modal-card").getByRole("button", { name: "Open trade" }).click();
  await toast("opened");
  log("buyer opened a trade for the full 80 t");
  await signOut();
  await signIn("demo", "demo1234");
  await page.locator(".notif-button").click();
  await page.locator(".notif-popover li").first().waitFor();
  await shot("notifications");
  log("seller sees the trade notification");
  await page.keyboard.press("Escape");
  await nav("Match & Trades");
  await page.getByRole("button", { name: "Confirm delivery" }).first().click();
  await toast("Delivery confirmed");
  await page.goto(listingUrl);
  await page.locator(".nft-passport .badge", { hasText: "delisted" }).waitFor();
  await shot("listing-sold-out");
  log("business rule: selling out delisted the listing");

  // 8. Demands, admin, audit, compliance, materials
  await nav("Buyer Demands");
  await page.getByRole("button", { name: "+ Post a demand" }).click();
  await page.getByLabel("Industry").fill("E2E Road Works");
  await page.getByLabel("Quantity (t)").fill("99");
  await page.getByLabel("Deadline").fill("2099-01-31");
  await page.locator(".modal-card").getByRole("button", { name: "Post demand" }).click();
  await toast("Demand posted");
  await page.getByRole("cell", { name: "E2E Road Works" }).waitFor();
  log("posted a buyer demand");
  await nav("Users");
  await page.getByRole("button", { name: "Grant regulator" }).first().click();
  await toast("Regulator role granted");
  await shot("users");
  log("granted the regulator role to a pending user");
  await nav("Audit Log");
  await page.locator("table tbody tr").first().waitFor();
  await shot("audit");
  log("audit log lists recent actions");
  await nav("Compliance Queue");
  await page.locator(".kpi-card").first().waitFor();
  await nav("Material Records");
  await page.locator("table tbody tr").first().waitFor();
  await nav("Shipment / Transfer Details");
  await page.locator(".route-panel").waitFor();
  await page.getByLabel("Destination").selectOption("Zhuhai");
  await page.waitForTimeout(400);
  await shot("transfers");
  log("compliance queue, material records and transfer list render");

  // 9. Chinese UI + profile
  await page.locator(".lang-toggle").click();
  await nav("護照登記冊");
  await page.getByText("數碼護照登記冊").waitFor();
  await shot("zh-registry");
  log("Traditional Chinese interface renders");
  await page.locator(".avatar.dark").click();
  await page.getByRole("button", { name: "使用者資料及密碼" }).click();
  await page.locator(".modal-card").waitFor();
  await shot("profile");
  log("profile dialog opens");
} catch (error) {
  problems.push(`FAILED: ${error.message.split("\n")[0]}`);
  await shot("failure");
} finally {
  await browser.close();
}

console.log(problems.length ? `\nProblems:\n${problems.map((p) => `  - ${p}`).join("\n")}` : "\nNo console errors, page errors or 5xx responses.");
process.exit(problems.some((p) => p.startsWith("FAILED") || p.startsWith("pageerror")) ? 1 : 0);
