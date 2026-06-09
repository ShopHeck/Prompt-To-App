import type { Request, Response, NextFunction } from "express";
import { db, teamMembersTable, eq, and } from "@workspace/db";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * Resolves the authenticated user's role in a given team.
 * Returns the role string or null if not a member.
 */
export async function resolveTeamAccess(
  req: Request,
  teamId: number,
): Promise<TeamRole | null> {
  if (!req.user) return null;

  const [membership] = await db
    .select({ role: teamMembersTable.role })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        eq(teamMembersTable.userId, req.user.id),
      ),
    );

  if (!membership) return null;
  return membership.role as TeamRole;
}

/**
 * Middleware factory that ensures the user has at least the specified role
 * in the team identified by req.params.id (or req.params.teamId).
 */
export function requireTeamRole(minRole: TeamRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rawId = req.params.id || req.params.teamId;
    const teamId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
    if (isNaN(teamId)) {
      res.status(400).json({ error: "Invalid team ID" });
      return;
    }

    const role = await resolveTeamAccess(req, teamId);
    if (!role) {
      res.status(403).json({ error: "Not a member of this team" });
      return;
    }

    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
      res.status(403).json({ error: `Requires at least ${minRole} role` });
      return;
    }

    // Attach the resolved role to the request for downstream use
    (req as any).teamRole = role;
    next();
  };
}

/**
 * Check if a role meets the minimum threshold.
 */
export function hasMinRole(userRole: TeamRole, minRole: TeamRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}
