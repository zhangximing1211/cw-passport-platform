import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { apiError } from "./lib/errors";
import { requireAuth, type AuthEnv } from "./middleware/auth";
import { requireJsonWrites } from "./middleware/csrf";
import { adminRoutes, auditRoutes, notificationRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { documentRoutes } from "./routes/documents";
import { listingRoutes } from "./routes/listings";
import { companyRoutes, demandRoutes, marketplaceRoutes, matchRoutes, tradeRoutes } from "./routes/marketplace";
import { passportRoutes } from "./routes/passports";
import { statsRoutes } from "./routes/stats";
import { transferRoutes } from "./routes/transfers";

// wrangler.jsonc routes only /api/* here (assets.run_worker_first); the SPA is served from dist/.
const app = new Hono<AuthEnv>().basePath("/api");

app.use(logger());
app.use(requireJsonWrites);

// ── Public ──────────────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().then(() => "ok" as const, () => "error" as const);
  return c.json({ status: db === "ok" ? "ok" : "degraded", db, time: new Date().toISOString() }, db === "ok" ? 200 : 503);
});
// Sign-in, sign-up and password reset are public; /auth/me and the account routes check the session themselves.
app.route("/auth", authRoutes);

// ── Signed-in users only ────────────────────────────────────────────────────
const PROTECTED = [
  "/passports", "/transfers", "/listings", "/documents", "/demands", "/companies", "/matches",
  "/trades", "/marketplace", "/stats", "/notifications", "/audit", "/admin",
];
for (const prefix of PROTECTED) {
  app.use(prefix, requireAuth);
  app.use(`${prefix}/*`, requireAuth);
}
app.route("/passports", passportRoutes);
app.route("/transfers", transferRoutes);
app.route("/listings", listingRoutes);
app.route("/documents", documentRoutes);
app.route("/demands", demandRoutes);
app.route("/companies", companyRoutes);
app.route("/matches", matchRoutes);
app.route("/trades", tradeRoutes);
app.route("/marketplace", marketplaceRoutes);
app.route("/stats", statsRoutes);
app.route("/notifications", notificationRoutes);
app.route("/audit", auditRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => apiError(c, 404, "NOT_FOUND", `No API route for ${c.req.method} ${c.req.path}`));

app.onError((err, c) => {
  if (err instanceof HTTPException) return apiError(c, err.status, "HTTP_ERROR", err.message);
  console.error(err);
  return apiError(c, 500, "INTERNAL_ERROR", "Unexpected server error");
});

export default app;
