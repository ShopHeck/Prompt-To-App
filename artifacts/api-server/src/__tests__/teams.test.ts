import { describe, it, expect } from "vitest";
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
  return { agent, res, userId: res.body.user?.id };
}

// ── Team CRUD ─────────────────────────────────────────────────────────────────

describe("Teams API", () => {
  describe("POST /api/teams", () => {
    it("creates a team and makes creator the owner", async () => {
      const { agent } = await registerUser("owner@test.com");
      const res = await agent
        .post("/api/teams")
        .send({ name: "My Team", slug: "my-team" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("My Team");
      expect(res.body.slug).toBe("my-team");
      expect(res.body.id).toBeDefined();

      // Verify user is owner by fetching team details
      const details = await agent.get(`/api/teams/${res.body.id}`);
      expect(details.status).toBe(200);
      expect(details.body.members).toHaveLength(1);
      expect(details.body.members[0].role).toBe("owner");
      expect(details.body.members[0].email).toBe("owner@test.com");
    });

    it("rejects duplicate slug with 409", async () => {
      const { agent } = await registerUser("owner@test.com");
      await agent.post("/api/teams").send({ name: "Team A", slug: "same-slug" });
      const res = await agent.post("/api/teams").send({ name: "Team B", slug: "same-slug" });
      expect(res.status).toBe(409);
    });

    it("rejects invalid slug format", async () => {
      const { agent } = await registerUser("owner@test.com");
      const res = await agent
        .post("/api/teams")
        .send({ name: "My Team", slug: "Invalid Slug!" });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/teams")
        .send({ name: "My Team", slug: "my-team" });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/teams", () => {
    it("lists teams for the authenticated user", async () => {
      const { agent } = await registerUser("owner@test.com");
      await agent.post("/api/teams").send({ name: "Team 1", slug: "team-1" });
      await agent.post("/api/teams").send({ name: "Team 2", slug: "team-2" });

      const res = await agent.get("/api/teams");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].role).toBe("owner");
      expect(res.body[1].role).toBe("owner");
    });

    it("does not list teams user is not a member of", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      await ownerAgent.post("/api/teams").send({ name: "Secret Team", slug: "secret" });

      const { agent: otherAgent } = await registerUser("other@test.com");
      const res = await otherAgent.get("/api/teams");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("PUT /api/teams/:id", () => {
    it("allows owner/admin to update team", async () => {
      const { agent } = await registerUser("owner@test.com");
      const createRes = await agent.post("/api/teams").send({ name: "Old Name", slug: "old-slug" });
      const teamId = createRes.body.id;

      const res = await agent
        .put(`/api/teams/${teamId}`)
        .send({ name: "New Name", slug: "new-slug" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Name");
      expect(res.body.slug).toBe("new-slug");
    });

    it("rejects non-members with 403", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const { agent: otherAgent } = await registerUser("other@test.com");
      const res = await otherAgent
        .put(`/api/teams/${teamId}`)
        .send({ name: "Hacked" });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/teams/:id/members (invite)", () => {
    it("adds an existing user as a member directly", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      await registerUser("member@test.com");

      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const res = await ownerAgent
        .post(`/api/teams/${teamId}/members`)
        .send({ email: "member@test.com", role: "member" });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Member added");

      // Verify member is in the team
      const details = await ownerAgent.get(`/api/teams/${teamId}`);
      expect(details.body.members).toHaveLength(2);
    });

    it("creates an invitation for non-existing user", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const res = await ownerAgent
        .post(`/api/teams/${teamId}/members`)
        .send({ email: "new@test.com", role: "viewer" });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Invitation created");
      expect(res.body.invitation.email).toBe("new@test.com");
    });

    it("rejects if user is already a member", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });
      const res = await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });
      expect(res.status).toBe(409);
    });

    it("rejects viewer trying to invite", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: viewerAgent } = await registerUser("viewer@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      // Add viewer
      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "viewer@test.com", role: "viewer" });

      // Viewer tries to invite
      const res = await viewerAgent
        .post(`/api/teams/${teamId}/members`)
        .send({ email: "new@test.com", role: "member" });
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/teams/:id/members/:userId", () => {
    it("allows admin to remove member", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { userId: memberId } = await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });

      const res = await ownerAgent.delete(`/api/teams/${teamId}/members/${memberId}`);
      expect(res.status).toBe(204);
    });

    it("cannot remove the last owner", async () => {
      const { agent: ownerAgent, userId: ownerId } = await registerUser("owner@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const res = await ownerAgent.delete(`/api/teams/${teamId}/members/${ownerId}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("last owner");
    });
  });

  describe("PUT /api/teams/:id/members/:userId/role", () => {
    it("allows owner to change roles", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { userId: memberId } = await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });

      const res = await ownerAgent
        .put(`/api/teams/${teamId}/members/${memberId}/role`)
        .send({ role: "admin" });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("admin");
    });

    it("rejects non-owner trying to change roles", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: adminAgent, userId: adminId } = await registerUser("admin@test.com");
      const { userId: memberId } = await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "admin@test.com", role: "admin" });
      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });

      const res = await adminAgent
        .put(`/api/teams/${teamId}/members/${memberId}/role`)
        .send({ role: "viewer" });
      expect(res.status).toBe(403);
    });
  });

  // ── Team Projects ─────────────────────────────────────────────────────────────

  describe("Team project access", () => {
    it("allows member to create project in team", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: memberAgent } = await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });

      const projectRes = await memberAgent
        .post("/api/projects")
        .send({ name: "Team Project", prompt: "Build something", framework: "swiftui", teamId });
      expect(projectRes.status).toBe(201);
      expect(projectRes.body.teamId).toBe(teamId);
    });

    it("non-member cannot create project in team", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: outsiderAgent } = await registerUser("outsider@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const res = await outsiderAgent
        .post("/api/projects")
        .send({ name: "Hack Project", prompt: "Hack", framework: "swiftui", teamId });
      expect(res.status).toBe(403);
    });

    it("team members can access team projects", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: memberAgent } = await registerUser("member@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "member@test.com", role: "member" });

      const projectRes = await ownerAgent
        .post("/api/projects")
        .send({ name: "Team Project", prompt: "Build something", framework: "swiftui", teamId });
      const projectId = projectRes.body.id;

      const res = await memberAgent.get(`/api/projects/${projectId}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Team Project");
    });

    it("non-members cannot access team projects", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: outsiderAgent } = await registerUser("outsider@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      const projectRes = await ownerAgent
        .post("/api/projects")
        .send({ name: "Team Project", prompt: "Build something", framework: "swiftui", teamId });
      const projectId = projectRes.body.id;

      const res = await outsiderAgent.get(`/api/projects/${projectId}`);
      expect(res.status).toBe(404);
    });

    it("lists team projects via ?team_id query param", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post("/api/projects").send({ name: "Personal", prompt: "Hello", framework: "swiftui" });
      await ownerAgent.post("/api/projects").send({ name: "Team Proj", prompt: "Hello team", framework: "swiftui", teamId });

      const personalRes = await ownerAgent.get("/api/projects");
      expect(personalRes.body.data).toHaveLength(1);
      expect(personalRes.body.data[0].name).toBe("Personal");

      const teamRes = await ownerAgent.get(`/api/projects?team_id=${teamId}`);
      expect(teamRes.body.data).toHaveLength(1);
      expect(teamRes.body.data[0].name).toBe("Team Proj");
    });

    it("viewer can read but admin+ can delete team project", async () => {
      const { agent: ownerAgent } = await registerUser("owner@test.com");
      const { agent: viewerAgent } = await registerUser("viewer@test.com");
      const createRes = await ownerAgent.post("/api/teams").send({ name: "Team", slug: "team" });
      const teamId = createRes.body.id;

      await ownerAgent.post(`/api/teams/${teamId}/members`).send({ email: "viewer@test.com", role: "viewer" });

      const projectRes = await ownerAgent
        .post("/api/projects")
        .send({ name: "Team Project", prompt: "Build", framework: "swiftui", teamId });
      const projectId = projectRes.body.id;

      // Viewer can read
      const getRes = await viewerAgent.get(`/api/projects/${projectId}`);
      expect(getRes.status).toBe(200);

      // Viewer cannot delete
      const delRes = await viewerAgent.delete(`/api/projects/${projectId}`);
      expect(delRes.status).toBe(403);

      // Owner can delete
      const ownerDelRes = await ownerAgent.delete(`/api/projects/${projectId}`);
      expect(ownerDelRes.status).toBe(204);
    });
  });
});
