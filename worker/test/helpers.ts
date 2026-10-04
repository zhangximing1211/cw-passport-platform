import { exports } from "cloudflare:workers";
import type { PassportDto, UserType } from "../../shared/api";

const BASE = "http://example.com/api";

export function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const { cookie, headers, ...rest } = init;
  return exports.default.fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  });
}

export const postJson = (path: string, body: unknown, cookie?: string) =>
  api(path, { method: "POST", body: JSON.stringify(body), cookie });

/** Signs in and returns the session cookie ("cw_session=…"). */
export async function login(username = "demo", password = "demo1234"): Promise<string> {
  const res = await postJson("/auth/login", { username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  return res.headers.get("Set-Cookie")!.split(";")[0];
}

let userCounter = 0;
/** Registers a fresh member account and returns its session cookie. */
export async function newMember(company: string, userType: UserType = "Construction Waste Generator"): Promise<string> {
  const username = `member_${Date.now().toString(36)}_${userCounter++}`;
  const res = await postJson("/auth/register", { username, email: `${username}@example.com`, password: "Str0ng!pass", company, userType });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return login(username, "Str0ng!pass");
}

export const pdfBytes = (text = "test document") => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);

/** multipart upload the way the SPA does it (X-Requested-With satisfies the CSRF check). */
export function upload(path: string, cookie: string, { bytes = pdfBytes(), filename = "declaration.pdf", kind = "Material Declaration", headers = {} as Record<string, string> } = {}) {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: "application/pdf" }));
  form.append("kind", kind);
  return exports.default.fetch(`${BASE}${path}`, { method: "POST", body: form, headers: { Cookie: cookie, "X-Requested-With": "fetch", ...headers } });
}

export const newPassportBody = (overrides: Record<string, unknown> = {}) => ({
  material: "Recycled Concrete Aggregate", category: "Concrete", project: "Test Site", quantity: { value: 100, unit: "t" },
  location: "EcoPark, Tuen Mun", origin: "Hong Kong", stage: "Processing", ...overrides,
});

/** Registers a passport as `cookie`; when `verifyWith` is given, verifies it with that (regulator) session. */
export async function createPassport(cookie: string, overrides: Record<string, unknown> = {}, verifyWith?: string): Promise<PassportDto> {
  const res = await postJson("/passports", newPassportBody(overrides), cookie);
  if (res.status !== 201) throw new Error(`create passport failed: ${res.status} ${await res.text()}`);
  const passport = await res.json<PassportDto>();
  if (!verifyWith) return passport;
  const verified = await postJson(`/passports/${passport.id}/verify`, {}, verifyWith);
  if (verified.status !== 200) throw new Error(`verify failed: ${verified.status} ${await verified.text()}`);
  return verified.json<PassportDto>();
}

export const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
