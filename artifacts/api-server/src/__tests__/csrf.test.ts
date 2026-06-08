import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

describe("CSRF protection middleware", () => {
  let csrfProtection: (req: Request, res: Response, next: NextFunction) => void;

  function createMockReq(
    method: string,
    path: string,
    cookies: Record<string, string> = {},
    headers: Record<string, string> = {},
  ): Request {
    return {
      method,
      path,
      cookies,
      headers: { ...headers },
    } as unknown as Request;
  }

  function createMockRes(): Response & {
    _cookies: Record<string, { value: string; options: Record<string, unknown> }>;
    _status: number | null;
    _body: unknown;
  } {
    const res = {
      _cookies: {} as Record<string, { value: string; options: Record<string, unknown> }>,
      _status: null as number | null,
      _body: null as unknown,
      cookie(name: string, value: string, options: Record<string, unknown>) {
        res._cookies[name] = { value, options };
        return res;
      },
      status(code: number) {
        res._status = code;
        return res;
      },
      json(body: unknown) {
        res._body = body;
        return res;
      },
    };
    return res as unknown as Response & {
      _cookies: Record<string, { value: string; options: Record<string, unknown> }>;
      _status: number | null;
      _body: unknown;
    };
  }

  describe("in dev mode (NODE_ENV !== production)", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "development");
      const mod = await import("../middleware/security");
      csrfProtection = mod.csrfProtection;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("sets pta_csrf cookie on GET requests", () => {
      const req = createMockReq("GET", "/api/projects");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._cookies["pta_csrf"]).toBeDefined();
      expect(res._cookies["pta_csrf"]!.value).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(next).toHaveBeenCalled();
    });

    it("preserves existing pta_csrf cookie value", () => {
      const existingToken = "a".repeat(64);
      const req = createMockReq("GET", "/api/projects", { pta_csrf: existingToken });
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._cookies["pta_csrf"]!.value).toBe(existingToken);
      expect(next).toHaveBeenCalled();
    });

    it("allows POST requests without CSRF header in dev mode", () => {
      const req = createMockReq("POST", "/api/projects");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("allows PUT requests without CSRF header in dev mode", () => {
      const req = createMockReq("PUT", "/api/projects/1");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("allows DELETE requests without CSRF header in dev mode", () => {
      const req = createMockReq("DELETE", "/api/projects/1");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("allows PATCH requests without CSRF header in dev mode", () => {
      const req = createMockReq("PATCH", "/api/projects/1");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });
  });

  describe("in production mode (NODE_ENV === production)", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      const mod = await import("../middleware/security");
      csrfProtection = mod.csrfProtection;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("sets pta_csrf cookie on responses", () => {
      const req = createMockReq("GET", "/api/projects");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._cookies["pta_csrf"]).toBeDefined();
      expect(res._cookies["pta_csrf"]!.value).toHaveLength(64);
      expect(res._cookies["pta_csrf"]!.options.httpOnly).toBe(false);
      expect(res._cookies["pta_csrf"]!.options.secure).toBe(true);
      expect(res._cookies["pta_csrf"]!.options.sameSite).toBe("lax");
      expect(next).toHaveBeenCalled();
    });

    it("rejects POST when x-csrf-token header is missing", () => {
      const token = "b".repeat(64);
      const req = createMockReq("POST", "/api/projects", { pta_csrf: token });
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(res._body).toEqual({ error: "Invalid or missing CSRF token" });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects POST when header does not match cookie", () => {
      const token = "c".repeat(64);
      const req = createMockReq(
        "POST",
        "/api/projects",
        { pta_csrf: token },
        { "x-csrf-token": "wrong-token" },
      );
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(res._body).toEqual({ error: "Invalid or missing CSRF token" });
      expect(next).not.toHaveBeenCalled();
    });

    it("allows POST when x-csrf-token header matches cookie", () => {
      const token = "d".repeat(64);
      const req = createMockReq(
        "POST",
        "/api/projects",
        { pta_csrf: token },
        { "x-csrf-token": token },
      );
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("exempts /api/billing/webhook from CSRF check", () => {
      const req = createMockReq("POST", "/api/billing/webhook");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("exempts /api/healthz from CSRF check", () => {
      const req = createMockReq("POST", "/api/healthz");
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(res._status).toBeNull();
    });

    it("rejects PUT without matching CSRF token", () => {
      const token = "e".repeat(64);
      const req = createMockReq("PUT", "/api/projects/1", { pta_csrf: token });
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects DELETE without matching CSRF token", () => {
      const token = "f".repeat(64);
      const req = createMockReq("DELETE", "/api/projects/1", { pta_csrf: token });
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("generates new token when no cookie exists", () => {
      const req = createMockReq("POST", "/api/projects", {});
      const res = createMockRes();
      const next = vi.fn();

      csrfProtection(req, res as unknown as Response, next as unknown as NextFunction);

      // A new token is generated but since header won't match, it rejects
      expect(res._cookies["pta_csrf"]).toBeDefined();
      expect(res._cookies["pta_csrf"]!.value).toHaveLength(64);
      expect(res._status).toBe(403);
    });
  });
});
