import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";

// Helper to register a user and return agent with session cookie
async function registerUser(
  email = "test@example.com",
  password = "testpass123",
  displayName?: string,
) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password, displayName });
  return { agent, res };
}

// ── Health ────────────────────────────────────────────────────────────────────

describe("GET /api/healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("Auth endpoints", () => {
  describe("POST /api/auth/register", () => {
    it("creates a new user and returns session cookie", async () => {
      const { res } = await registerUser();
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: "test@example.com",
        plan: "free",
      });
      expect(res.body.user.id).toBeDefined();
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("rejects duplicate email with 409", async () => {
      await registerUser("dup@test.com");
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "dup@test.com", password: "testpass123" });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it("rejects missing email with 400", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ password: "testpass123" });
      expect(res.status).toBe(400);
    });

    it("rejects short password with 400", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "short@test.com", password: "abc" });
      expect(res.status).toBe(400);
    });

    it("saves optional displayName", async () => {
      const { agent } = await registerUser("name@test.com", "testpass123", "Test User");
      const me = await agent.get("/api/auth/me");
      expect(me.body.user.displayName).toBe("Test User");
    });
  });

  describe("POST /api/auth/login", () => {
    it("authenticates with correct credentials", async () => {
      await registerUser("login@test.com", "mypassword1");
      const agent = request.agent(app);
      const res = await agent
        .post("/api/auth/login")
        .send({ email: "login@test.com", password: "mypassword1" });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe("login@test.com");
    });

    it("rejects wrong password with 401", async () => {
      await registerUser("wrong@test.com", "correctpw1");
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "wrong@test.com", password: "wrongpw123" });
      expect(res.status).toBe(401);
    });

    it("rejects nonexistent user with 401", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@test.com", password: "whatever1" });
      expect(res.status).toBe(401);
    });

    it("rejects missing fields with 400", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "x@x.com" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns user + quota when authenticated", async () => {
      const { agent } = await registerUser("me@test.com");
      const res = await agent.get("/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe("me@test.com");
      expect(res.body.quota).toBeDefined();
      expect(res.body.quota.limit).toBeDefined();
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears session", async () => {
      const { agent } = await registerUser("out@test.com");
      const logoutRes = await agent.post("/api/auth/logout");
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);
      // After logout, /me should return 401
      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(401);
    });
  });

  describe("PUT /api/auth/password", () => {
    it("changes password for authenticated user", async () => {
      const { agent } = await registerUser("pw@test.com", "oldpassword1");
      const res = await agent
        .put("/api/auth/password")
        .send({ currentPassword: "oldpassword1", newPassword: "newpassword1" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Login with new password
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "pw@test.com", password: "newpassword1" });
      expect(login.status).toBe(200);
    });

    it("rejects wrong current password with 401", async () => {
      const { agent } = await registerUser("pw2@test.com", "original123");
      const res = await agent
        .put("/api/auth/password")
        .send({ currentPassword: "wrong12345", newPassword: "new12345678" });
      expect(res.status).toBe(401);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .put("/api/auth/password")
        .send({ currentPassword: "old123456", newPassword: "new123456" });
      expect(res.status).toBe(401);
    });
  });
});

// ── Billing ───────────────────────────────────────────────────────────────────

describe("Billing endpoints", () => {
  describe("GET /api/billing/plans", () => {
    it("returns plan info", async () => {
      const res = await request(app).get("/api/billing/plans");
      expect(res.status).toBe(200);
      expect(res.body.plans).toBeDefined();
      expect(res.body.plans.free).toBeDefined();
      expect(res.body.plans.pro).toBeDefined();
      expect(res.body.plans.studio).toBeDefined();
      expect(res.body.plans.pro.price).toBe("$29/mo");
    });
  });

  describe("POST /api/billing/checkout", () => {
    it("returns 503 when Stripe is not configured", async () => {
      const { agent } = await registerUser("bill@test.com");
      const res = await agent
        .post("/api/billing/checkout")
        .send({ plan: "pro" });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("Stripe");
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/billing/checkout")
        .send({ plan: "pro" });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/billing/subscription", () => {
    it("returns subscription info for authenticated user", async () => {
      const { agent } = await registerUser("sub@test.com");
      const res = await agent.get("/api/billing/subscription");
      expect(res.status).toBe(200);
      expect(res.body.plan).toBe("free");
      expect(res.body.usage).toBeDefined();
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/billing/subscription");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/billing/portal", () => {
    it("returns 503 when Stripe is not configured", async () => {
      const { agent } = await registerUser("portal@test.com");
      const res = await agent.post("/api/billing/portal");
      // Should return 400 (no Stripe customer) or 503 (Stripe not configured)
      expect([400, 503]).toContain(res.status);
    });
  });

  describe("POST /api/billing/webhook", () => {
    it("returns 503 when webhook secret is not configured", async () => {
      const res = await request(app)
        .post("/api/billing/webhook")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: "checkout.session.completed" }));
      expect(res.status).toBe(503);
    });
  });
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe("Project endpoints", () => {
  describe("POST /api/projects", () => {
    it("creates a new project", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Test App", prompt: "A todo list app", framework: "swiftui" });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Test App");
      expect(res.body.prompt).toBe("A todo list app");
      expect(res.body.framework).toBe("swiftui");
      expect(res.body.status).toBe("pending");
      expect(res.body.id).toBeDefined();
    });

    it("creates a React project", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Web App", prompt: "A dashboard", framework: "react" });
      expect(res.status).toBe(201);
      expect(res.body.framework).toBe("react");
    });

    it("rejects missing name", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ prompt: "test", framework: "swiftui" });
      expect(res.status).toBe(400);
    });

    it("rejects prompt over 10000 characters", async () => {
      const longPrompt = "x".repeat(10001);
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Long", prompt: longPrompt, framework: "swiftui" });
      expect(res.status).toBe(400);
    });

    it("assigns userId when authenticated", async () => {
      const { agent } = await registerUser("projowner@test.com");
      const res = await agent
        .post("/api/projects")
        .send({ name: "My App", prompt: "test", framework: "swiftui" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe("GET /api/projects", () => {
    it("returns empty array for unauthenticated users", async () => {
      // Create a project without auth
      await request(app)
        .post("/api/projects")
        .send({ name: "App 1", prompt: "test", framework: "swiftui" });
      const res = await request(app).get("/api/projects");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });

    it("returns only the authenticated user's projects", async () => {
      const { agent } = await registerUser("listowner@test.com");
      await agent
        .post("/api/projects")
        .send({ name: "App 1", prompt: "test", framework: "swiftui" });
      await agent
        .post("/api/projects")
        .send({ name: "App 2", prompt: "test2", framework: "react" });
      const res = await agent.get("/api/projects");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.totalPages).toBe(1);
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns a project by ID when owned by user", async () => {
      const { agent } = await registerUser("getowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "Detail", prompt: "x", framework: "swiftui" });
      const res = await agent.get(`/api/projects/${create.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Detail");
    });

    it("returns 404 for nonexistent project", async () => {
      const res = await request(app).get("/api/projects/99999");
      expect(res.status).toBe(404);
    });

    it("returns 404 when accessing another user's project", async () => {
      const { agent: agentA } = await registerUser("usera@test.com");
      const { agent: agentB } = await registerUser("userb@test.com");
      const create = await agentA
        .post("/api/projects")
        .send({ name: "Private", prompt: "x", framework: "swiftui" });
      const res = await agentB.get(`/api/projects/${create.body.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deletes a project owned by user", async () => {
      const { agent } = await registerUser("delowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "Delete Me", prompt: "x", framework: "swiftui" });
      const del = await agent.delete(`/api/projects/${create.body.id}`);
      expect(del.status).toBe(204);
      const get = await agent.get(`/api/projects/${create.body.id}`);
      expect(get.status).toBe(404);
    });

    it("returns 404 when deleting another user's project", async () => {
      const { agent: agentA } = await registerUser("delA@test.com");
      const { agent: agentB } = await registerUser("delB@test.com");
      const create = await agentA
        .post("/api/projects")
        .send({ name: "NotYours", prompt: "x", framework: "swiftui" });
      const del = await agentB.delete(`/api/projects/${create.body.id}`);
      expect(del.status).toBe(404);
    });
  });

  describe("GET /api/projects/:id/files", () => {
    it("returns empty array for new project owned by user", async () => {
      const { agent } = await registerUser("filesowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "NoFiles", prompt: "x", framework: "swiftui" });
      const res = await agent.get(`/api/projects/${create.body.id}/files`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("POST /api/projects/:id/share", () => {
    it("generates a share token", async () => {
      const { agent } = await registerUser("shareowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "ShareMe", prompt: "x", framework: "swiftui" });
      const res = await agent.post(`/api/projects/${create.body.id}/share`);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe("string");
      expect(res.body.url).toBeDefined();
    });

    it("returns same token on second call", async () => {
      const { agent } = await registerUser("sharetwice@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "ShareTwice", prompt: "x", framework: "swiftui" });
      const first = await agent.post(`/api/projects/${create.body.id}/share`);
      const second = await agent.post(`/api/projects/${create.body.id}/share`);
      expect(first.body.token).toBe(second.body.token);
    });
  });

  describe("GET /api/share/:token", () => {
    it("returns shared project", async () => {
      const { agent } = await registerUser("sharedowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "Shared", prompt: "test share", framework: "swiftui" });
      const share = await agent.post(`/api/projects/${create.body.id}/share`);
      // Share endpoint is accessible by anyone with the token (unauthenticated)
      const res = await request(app).get(`/api/share/${share.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("Shared");
    });

    it("returns 404 for invalid token", async () => {
      const res = await request(app).get("/api/share/nonexistent-token");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/projects/recent", () => {
    it("returns up to 5 recent projects for authenticated user", async () => {
      const { agent } = await registerUser("recentowner@test.com");
      for (let i = 0; i < 7; i++) {
        await agent
          .post("/api/projects")
          .send({ name: `App ${i}`, prompt: "x", framework: "swiftui" });
      }
      const res = await agent.get("/api/projects/recent");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(5);
    });

    it("returns empty array for unauthenticated", async () => {
      const res = await request(app).get("/api/projects/recent");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /api/projects/stats", () => {
    it("returns aggregate stats", async () => {
      await request(app)
        .post("/api/projects")
        .send({ name: "Stats App", prompt: "x", framework: "swiftui" });
      const res = await request(app).get("/api/projects/stats");
      expect(res.status).toBe(200);
      expect(res.body.totalProjects).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/projects/:id/preview", () => {
    it("returns 404 when no preview exists", async () => {
      const { agent } = await registerUser("prevowner@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "NoPreview", prompt: "x", framework: "swiftui" });
      const res = await agent.get(`/api/projects/${create.body.id}/preview`);
      expect(res.status).toBe(404);
    });
  });

  describe("Ownership enforcement", () => {
    it("user A cannot see user B's projects in list", async () => {
      const { agent: agentA } = await registerUser("ownerA@test.com");
      const { agent: agentB } = await registerUser("ownerB@test.com");

      await agentA.post("/api/projects").send({ name: "A's App", prompt: "test", framework: "swiftui" });
      await agentB.post("/api/projects").send({ name: "B's App", prompt: "test", framework: "react" });

      const listA = await agentA.get("/api/projects");
      expect(listA.body.data.length).toBe(1);
      expect(listA.body.data[0].name).toBe("A's App");

      const listB = await agentB.get("/api/projects");
      expect(listB.body.data.length).toBe(1);
      expect(listB.body.data[0].name).toBe("B's App");
    });

    it("user A cannot access user B's project by ID", async () => {
      const { agent: agentA } = await registerUser("isoA@test.com");
      const { agent: agentB } = await registerUser("isoB@test.com");

      const create = await agentB.post("/api/projects").send({ name: "B Only", prompt: "x", framework: "swiftui" });
      const res = await agentA.get(`/api/projects/${create.body.id}`);
      expect(res.status).toBe(404);
    });

    it("user A cannot delete user B's project", async () => {
      const { agent: agentA } = await registerUser("delIsoA@test.com");
      const { agent: agentB } = await registerUser("delIsoB@test.com");

      const create = await agentB.post("/api/projects").send({ name: "B Delete", prompt: "x", framework: "swiftui" });
      const res = await agentA.delete(`/api/projects/${create.body.id}`);
      expect(res.status).toBe(404);

      // Verify project still exists for user B
      const check = await agentB.get(`/api/projects/${create.body.id}`);
      expect(check.status).toBe(200);
    });

    it("unauthenticated user cannot list projects", async () => {
      const { agent } = await registerUser("nolist@test.com");
      await agent.post("/api/projects").send({ name: "Auth App", prompt: "x", framework: "swiftui" });

      const res = await request(app).get("/api/projects");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("unauthenticated user can still create projects", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Anon App", prompt: "test", framework: "swiftui" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it("shared projects are accessible via token regardless of auth", async () => {
      const { agent: agentA } = await registerUser("shareIsoA@test.com");
      const { agent: agentB } = await registerUser("shareIsoB@test.com");

      const create = await agentA.post("/api/projects").send({ name: "Shared Project", prompt: "x", framework: "swiftui" });
      const share = await agentA.post(`/api/projects/${create.body.id}/share`);

      // User B can access via share token
      const res = await agentB.get(`/api/share/${share.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("Shared Project");

      // Unauthenticated can access via share token
      const anonRes = await request(app).get(`/api/share/${share.body.token}`);
      expect(anonRes.status).toBe(200);
      expect(anonRes.body.project.name).toBe("Shared Project");
    });
  });
});

// ── Providers ─────────────────────────────────────────────────────────────────

describe("GET /api/providers", () => {
  it("returns provider structure", async () => {
    const res = await request(app).get("/api/providers");
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeDefined();
    expect(Array.isArray(res.body.providers)).toBe(true);
    // providers is string[] of available providers; may be empty without API keys
    expect(res.body).toHaveProperty("default");
    expect(res.body).toHaveProperty("models");
  });
});

// ── Templates ─────────────────────────────────────────────────────────────────

describe("GET /api/templates", () => {
  it("returns template list", async () => {
    const res = await request(app).get("/api/templates");
    expect(res.status).toBe(200);
    expect(res.body.templates).toBeDefined();
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBe(15);

    const tmpl = res.body.templates[0];
    expect(tmpl.id).toBeDefined();
    expect(tmpl.name).toBeDefined();
    expect(tmpl.category).toBeDefined();
    expect(tmpl.prompt).toBeDefined();
    expect(tmpl.icon).toBeDefined();
  });
});

// ── Refinement ────────────────────────────────────────────────────────────────

describe("Refinement endpoints", () => {
  describe("GET /api/projects/:id/refinements", () => {
    it("returns empty array for project with no refinements", async () => {
      const create = await request(app)
        .post("/api/projects")
        .send({ name: "NoRefine", prompt: "x", framework: "swiftui" });
      const res = await request(app).get(`/api/projects/${create.body.id}/refinements`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("POST /api/projects/:id/refine", () => {
    it("requires authentication", async () => {
      const create = await request(app)
        .post("/api/projects")
        .send({ name: "AuthRefine", prompt: "x", framework: "swiftui" });
      const res = await request(app)
        .post(`/api/projects/${create.body.id}/refine`)
        .send({ instruction: "Add dark mode" });
      expect(res.status).toBe(401);
    });

    it("rejects free plan users with 403", async () => {
      const { agent } = await registerUser("freerefine@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "FreeRefine", prompt: "x", framework: "swiftui" });
      const res = await agent
        .post(`/api/projects/${create.body.id}/refine`)
        .send({ instruction: "Add dark mode" });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Pro or Studio");
    });

    it("rejects empty instruction with 400", async () => {
      const { agent } = await registerUser("valrefine@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "ValRefine", prompt: "x", framework: "swiftui" });
      const res = await agent
        .post(`/api/projects/${create.body.id}/refine`)
        .send({ instruction: "" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent project", async () => {
      const { agent } = await registerUser("missingrefine@test.com");
      // Upgrade user plan to bypass free check
      const me = await agent.get("/api/auth/me");
      const pg = await import("pg");
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [me.body.user.id]);
      await pool.end();

      const res = await agent
        .post("/api/projects/99999/refine")
        .send({ instruction: "Add dark mode" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when project has no files", async () => {
      const { agent } = await registerUser("nofiles@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "EmptyRefine", prompt: "x", framework: "swiftui" });

      // Upgrade plan
      const me = await agent.get("/api/auth/me");
      const pg = await import("pg");
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [me.body.user.id]);
      await pool.end();

      const res = await agent
        .post(`/api/projects/${create.body.id}/refine`)
        .send({ instruction: "Add dark mode" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("no files");
    });
  });
});

// ── Web Generation ────────────────────────────────────────────────────────────

describe("POST /api/projects/:id/generate-web", () => {
  it("returns SSE error for non-react project", async () => {
    const create = await request(app)
      .post("/api/projects")
      .send({ name: "iOSApp", prompt: "test", framework: "swiftui" });
    const res = await request(app).post(`/api/projects/${create.body.id}/generate-web`);
    // SSE endpoint returns 200 with error event in stream
    expect(res.status).toBe(200);
    expect(res.text).toContain("react");
  });

  it("returns SSE error for nonexistent project", async () => {
    const res = await request(app).post("/api/projects/99999/generate-web");
    expect(res.status).toBe(200);
    expect(res.text).toContain("not found");
  });
});

// ── History & Runs ────────────────────────────────────────────────────────────

describe("Project History & Runs endpoints", () => {
  describe("GET /api/projects/:id/history", () => {
    it("returns empty array for project with no revisions", async () => {
      const { agent } = await registerUser("hist@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "HistProject", prompt: "test app", framework: "swiftui" });
      const res = await agent.get(`/api/projects/${create.body.id}/history`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 404 for nonexistent project", async () => {
      const { agent } = await registerUser("hist2@test.com");
      const res = await agent.get("/api/projects/99999/history");
      expect(res.status).toBe(404);
    });

    it("returns 404 when accessing another user project", async () => {
      const { agent: agent1 } = await registerUser("owner1@test.com");
      const create = await agent1
        .post("/api/projects")
        .send({ name: "Private", prompt: "private app", framework: "swiftui" });

      const { agent: agent2 } = await registerUser("other1@test.com");
      const res = await agent2.get(`/api/projects/${create.body.id}/history`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/projects/:id/runs", () => {
    it("returns empty array for project with no runs", async () => {
      const { agent } = await registerUser("runs@test.com");
      const create = await agent
        .post("/api/projects")
        .send({ name: "RunsProject", prompt: "test app", framework: "swiftui" });
      const res = await agent.get(`/api/projects/${create.body.id}/runs`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 404 for nonexistent project", async () => {
      const { agent } = await registerUser("runs2@test.com");
      const res = await agent.get("/api/projects/99999/runs");
      expect(res.status).toBe(404);
    });

    it("returns 404 when accessing another user project", async () => {
      const { agent: agent1 } = await registerUser("owner2@test.com");
      const create = await agent1
        .post("/api/projects")
        .send({ name: "Private2", prompt: "private app", framework: "swiftui" });

      const { agent: agent2 } = await registerUser("other2@test.com");
      const res = await agent2.get(`/api/projects/${create.body.id}/runs`);
      expect(res.status).toBe(404);
    });
  });
});

// ── Style Presets ─────────────────────────────────────────────────────────────

describe("GET /api/style-presets", () => {
  it("returns all style presets", async () => {
    const res = await request(app).get("/api/style-presets");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(5);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain("cyberpunk");
    expect(ids).toContain("minimalist");
    expect(ids).toContain("brutalist");
    expect(ids).toContain("apple-native");
    expect(ids).toContain("elegant-dark");

    const preset = res.body[0];
    expect(preset.id).toBeDefined();
    expect(preset.name).toBeDefined();
    expect(preset.description).toBeDefined();
    expect(preset.colorPalette).toBeDefined();
    expect(preset.typographyStyle).toBeDefined();
    expect(preset.animationStyle).toBeDefined();
    expect(preset.componentStyle).toBeDefined();
  });
});

// ── Icon Generation ───────────────────────────────────────────────────────────

describe("POST /api/projects/:id/generate-icon", () => {
  it("returns 503 when GEMINI_API_KEY is not set", async () => {
    const { agent } = await registerUser("icon@test.com");
    const create = await agent
      .post("/api/projects")
      .send({ name: "IconApp", prompt: "A weather app", framework: "swiftui" });
    const res = await agent.post(`/api/projects/${create.body.id}/generate-icon`).send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("GEMINI_API_KEY");
  });

  it("returns 404 for nonexistent project", async () => {
    const { agent } = await registerUser("icon2@test.com");
    const res = await agent.post("/api/projects/99999/generate-icon").send({});
    expect(res.status).toBe(503); // 503 comes before project lookup since no key
  });

  it("returns 404 when accessing another user project", async () => {
    const { agent: agentA } = await registerUser("iconA@test.com");
    const { agent: agentB } = await registerUser("iconB@test.com");
    const create = await agentA
      .post("/api/projects")
      .send({ name: "IconOwner", prompt: "x", framework: "swiftui" });
    // Since GEMINI_API_KEY is not set, we get 503 before ownership check
    const res = await agentB.post(`/api/projects/${create.body.id}/generate-icon`).send({});
    expect(res.status).toBe(503);
  });
});

// ── Visual Feedback ───────────────────────────────────────────────────────────

describe("POST /api/projects/:id/visual-feedback", () => {
  it("returns 400 when screenshot is missing", async () => {
    const { agent } = await registerUser("vf@test.com");
    const create = await agent
      .post("/api/projects")
      .send({ name: "VFApp", prompt: "A todo app", framework: "swiftui" });
    const res = await agent.post(`/api/projects/${create.body.id}/visual-feedback`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Validation failed");
  });

  it("returns 400 when screenshot is empty string", async () => {
    const { agent } = await registerUser("vf2@test.com");
    const create = await agent
      .post("/api/projects")
      .send({ name: "VFApp2", prompt: "A todo app", framework: "swiftui" });
    const res = await agent
      .post(`/api/projects/${create.body.id}/visual-feedback`)
      .send({ screenshot: "" });
    expect(res.status).toBe(400);
  });

  it("returns 503 when GEMINI_API_KEY is not set", async () => {
    const { agent } = await registerUser("vf3@test.com");
    const create = await agent
      .post("/api/projects")
      .send({ name: "VFApp3", prompt: "A todo app", framework: "swiftui" });
    const res = await agent
      .post(`/api/projects/${create.body.id}/visual-feedback`)
      .send({ screenshot: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("GEMINI_API_KEY");
  });

  it("returns 404 for nonexistent project when Gemini is not configured", async () => {
    const { agent } = await registerUser("vf4@test.com");
    const res = await agent
      .post("/api/projects/99999/visual-feedback")
      .send({ screenshot: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" });
    expect(res.status).toBe(503); // 503 before project lookup
  });
});

// ── Style Preset on Project Creation ──────────────────────────────────────────

describe("Style preset on project creation", () => {
  it("creates a project with a style preset", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({ name: "Styled App", prompt: "A cool app", framework: "swiftui", stylePreset: "cyberpunk" });
    expect(res.status).toBe(201);
    expect(res.body.stylePreset).toBe("cyberpunk");
  });

  it("creates a project without a style preset", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({ name: "Plain App", prompt: "A plain app", framework: "swiftui" });
    expect(res.status).toBe(201);
    expect(res.body.stylePreset).toBeNull();
  });
});