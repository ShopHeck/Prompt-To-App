import { Router, type IRouter, type Request, type Response } from "express";
import { db, teamsTable, teamMembersTable, teamInvitationsTable, usersTable, eq, and } from "@workspace/db";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth";
import { requireTeamRole, resolveTeamAccess, hasMinRole, type TeamRole } from "../middleware/team-auth";

const router: IRouter = Router();

// All team routes require authentication
router.use(requireAuth);

/** Safely extract a param that may be string or string[] */
function paramToString(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

// ── Validation schemas ──────────────────────────────────────────────────────

const CreateTeamBody = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const UpdateTeamBody = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
});

const InviteMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

const UpdateRoleBody = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

// ── POST /api/teams - Create a team ─────────────────────────────────────────

router.post("/teams", async (req: Request, res: Response) => {
  try {
    const body = CreateTeamBody.parse(req.body);

    // Check slug uniqueness
    const [existing] = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.slug, body.slug));
    if (existing) {
      res.status(409).json({ error: "A team with this slug already exists" });
      return;
    }

    const [team] = await db.insert(teamsTable).values({
      name: body.name,
      slug: body.slug,
    }).returning();

    // Creator becomes owner
    await db.insert(teamMembersTable).values({
      teamId: team.id,
      userId: req.user!.id,
      role: "owner",
    });

    res.status(201).json(team);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request body", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create team");
    res.status(500).json({ error: "Failed to create team" });
  }
});

// ── GET /api/teams - List user's teams ──────────────────────────────────────

router.get("/teams", async (req: Request, res: Response) => {
  try {
    const memberships = await db
      .select({
        teamId: teamMembersTable.teamId,
        role: teamMembersTable.role,
        teamName: teamsTable.name,
        teamSlug: teamsTable.slug,
        teamPlan: teamsTable.plan,
        teamCreatedAt: teamsTable.createdAt,
      })
      .from(teamMembersTable)
      .innerJoin(teamsTable, eq(teamMembersTable.teamId, teamsTable.id))
      .where(eq(teamMembersTable.userId, req.user!.id));

    const teams = memberships.map((m) => ({
      id: m.teamId,
      name: m.teamName,
      slug: m.teamSlug,
      plan: m.teamPlan,
      role: m.role,
      createdAt: m.teamCreatedAt,
    }));

    res.json(teams);
  } catch (err) {
    req.log.error({ err }, "Failed to list teams");
    res.status(500).json({ error: "Failed to list teams" });
  }
});

// ── GET /api/teams/:id - Get team details + members ─────────────────────────

router.get("/teams/:id", requireTeamRole("viewer"), async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(paramToString(req.params.id), 10);

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const members = await db
      .select({
        id: teamMembersTable.id,
        userId: teamMembersTable.userId,
        role: teamMembersTable.role,
        joinedAt: teamMembersTable.joinedAt,
        email: usersTable.email,
        displayName: usersTable.displayName,
      })
      .from(teamMembersTable)
      .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
      .where(eq(teamMembersTable.teamId, teamId));

    res.json({ ...team, members });
  } catch (err) {
    req.log.error({ err }, "Failed to get team details");
    res.status(500).json({ error: "Failed to get team details" });
  }
});

// ── PUT /api/teams/:id - Update team (owner/admin) ──────────────────────────

router.put("/teams/:id", requireTeamRole("admin"), async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(paramToString(req.params.id), 10);
    const body = UpdateTeamBody.parse(req.body);

    if (!body.name && !body.slug) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    // If changing slug, check uniqueness
    if (body.slug) {
      const [existing] = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.slug, body.slug));
      if (existing && existing.id !== teamId) {
        res.status(409).json({ error: "A team with this slug already exists" });
        return;
      }
    }

    const updateData: Record<string, any> = {};
    if (body.name) updateData.name = body.name;
    if (body.slug) updateData.slug = body.slug;

    const [updated] = await db.update(teamsTable).set(updateData).where(eq(teamsTable.id, teamId)).returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request body", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update team");
    res.status(500).json({ error: "Failed to update team" });
  }
});

// ── POST /api/teams/:id/members - Invite user by email ──────────────────────

router.post("/teams/:id/members", requireTeamRole("admin"), async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(paramToString(req.params.id), 10);
    const body = InviteMemberBody.parse(req.body);

    // Check if user already exists and is already a member
    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, body.email));
    if (existingUser) {
      const [existingMember] = await db
        .select({ id: teamMembersTable.id })
        .from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, existingUser.id)));
      if (existingMember) {
        res.status(409).json({ error: "User is already a member of this team" });
        return;
      }

      // Add existing user directly as a member
      await db.insert(teamMembersTable).values({
        teamId,
        userId: existingUser.id,
        role: body.role,
        invitedBy: req.user!.id,
      });

      res.status(201).json({ message: "Member added", userId: existingUser.id, role: body.role });
      return;
    }

    // User doesn't exist yet - create invitation
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db.insert(teamInvitationsTable).values({
      teamId,
      email: body.email,
      role: body.role,
      token,
      invitedBy: req.user!.id,
      expiresAt,
    }).returning();

    res.status(201).json({ message: "Invitation created", invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request body", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to invite member");
    res.status(500).json({ error: "Failed to invite member" });
  }
});

// ── DELETE /api/teams/:id/members/:userId - Remove member ───────────────────

router.delete("/teams/:id/members/:userId", requireTeamRole("admin"), async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(paramToString(req.params.id), 10);
    const userId = parseInt(paramToString(req.params.userId), 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Find the member to be removed
    const [member] = await db
      .select({ id: teamMembersTable.id, role: teamMembersTable.role })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Cannot remove the last owner
    if (member.role === "owner") {
      const owners = await db
        .select({ id: teamMembersTable.id })
        .from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.role, "owner")));
      if (owners.length <= 1) {
        res.status(400).json({ error: "Cannot remove the last owner" });
        return;
      }
    }

    await db
      .delete(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove member");
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// ── PUT /api/teams/:id/members/:userId/role - Change role (owner only) ──────

router.put("/teams/:id/members/:userId/role", requireTeamRole("owner"), async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(paramToString(req.params.id), 10);
    const userId = parseInt(paramToString(req.params.userId), 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const body = UpdateRoleBody.parse(req.body);

    // Find the member
    const [member] = await db
      .select({ id: teamMembersTable.id, role: teamMembersTable.role })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // If downgrading from owner, ensure there's at least one other owner
    if (member.role === "owner" && body.role !== "owner") {
      const owners = await db
        .select({ id: teamMembersTable.id })
        .from(teamMembersTable)
        .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.role, "owner")));
      if (owners.length <= 1) {
        res.status(400).json({ error: "Cannot demote the last owner" });
        return;
      }
    }

    await db
      .update(teamMembersTable)
      .set({ role: body.role })
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));

    res.json({ userId, role: body.role });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request body", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update role");
    res.status(500).json({ error: "Failed to update role" });
  }
});

export default router;
