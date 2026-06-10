import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";

/**
 * Reproduces the production "Could not create project" failure: browsers
 * attach an Origin header to same-origin POST requests (but not GETs), so
 * with the frontend served from the API's own domain every state-changing
 * request was rejected by the CORS allow-list check unless the deployment
 * also listed its own domain in ALLOWED_ORIGINS.
 */

const HOST = "myapp.up.railway.app";

async function loadApp(env: Record<string, string>): Promise<Express> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v);
  }
  const mod = await import("../app");
  return mod.default;
}

/** Fetch a CSRF cookie/token pair the way the SPA does (any GET sets it). */
async function getCsrf(app: Express): Promise<{ cookie: string; token: string }> {
  const resp = await request(app).get("/api/templates").set("Host", HOST);
  const setCookie = resp.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
  const csrf = cookies.find((c: string) => c.startsWith("pta_csrf="));
  expect(csrf).toBeDefined();
  const token = csrf!.split(";")[0].split("=")[1];
  return { cookie: `pta_csrf=${token}`, token };
}

const TEMPLATE_BODY = {
  name: "Habit Streak Tracker",
  prompt:
    "A daily habit tracker that motivates users through streak counting and visual progress. The main screen shows today's habits as a checklist with one-tap completion.",
  framework: "swiftui",
};

describe("CORS same-origin handling (production mode)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows a same-origin POST when ALLOWED_ORIGINS is empty", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: "" });
    const { cookie, token } = await getCsrf(app);

    const resp = await request(app)
      .post("/api/projects")
      .set("Host", HOST)
      .set("Origin", `https://${HOST}`)
      .set("Cookie", cookie)
      .set("x-csrf-token", token)
      .send(TEMPLATE_BODY);

    expect(resp.status).toBe(201);
    expect(resp.body.name).toBe(TEMPLATE_BODY.name);
  });

  it("allows a same-origin POST when ALLOWED_ORIGINS lists other domains", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://other.example.com" });
    const { cookie, token } = await getCsrf(app);

    const resp = await request(app)
      .post("/api/projects")
      .set("Host", HOST)
      .set("Origin", `https://${HOST}`)
      .set("Cookie", cookie)
      .set("x-csrf-token", token)
      .send(TEMPLATE_BODY);

    expect(resp.status).toBe(201);
  });

  it("still rejects cross-origin POSTs from unlisted origins", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.example.com" });
    const { cookie, token } = await getCsrf(app);

    const resp = await request(app)
      .post("/api/projects")
      .set("Host", HOST)
      .set("Origin", "https://evil.example.com")
      .set("Cookie", cookie)
      .set("x-csrf-token", token)
      .send(TEMPLATE_BODY);

    expect(resp.status).toBeGreaterThanOrEqual(400);
    expect(resp.body.name).toBeUndefined();
  });

  it("still allows cross-origin POSTs from origins in ALLOWED_ORIGINS", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: `https://app.example.com` });
    const { cookie, token } = await getCsrf(app);

    const resp = await request(app)
      .post("/api/projects")
      .set("Host", HOST)
      .set("Origin", "https://app.example.com")
      .set("Cookie", cookie)
      .set("x-csrf-token", token)
      .send(TEMPLATE_BODY);

    expect(resp.status).toBe(201);
  });

  it("still enforces CSRF on same-origin POSTs", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: "" });

    const resp = await request(app)
      .post("/api/projects")
      .set("Host", HOST)
      .set("Origin", `https://${HOST}`)
      .send(TEMPLATE_BODY);

    expect(resp.status).toBe(403);
  });

  it("accepts every shipped template prompt through the create-project schema", async () => {
    const app = await loadApp({ NODE_ENV: "production", ALLOWED_ORIGINS: "" });
    const { cookie, token } = await getCsrf(app);
    const { EXAMPLE_PROMPTS } = await import("../lib/prompt-templates");

    for (const template of EXAMPLE_PROMPTS) {
      const resp = await request(app)
        .post("/api/projects")
        .set("Host", HOST)
        .set("Origin", `https://${HOST}`)
        .set("Cookie", cookie)
        .set("x-csrf-token", token)
        .send({ name: template.name, prompt: template.prompt, framework: "swiftui" });

      expect(resp.status, `template ${template.id}`).toBe(201);
    }
  });
});
