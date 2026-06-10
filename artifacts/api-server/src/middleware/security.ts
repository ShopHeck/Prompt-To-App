import type { Request, Response, NextFunction } from "express";
import type { CorsOptions } from "cors";
import helmet from "helmet";
import crypto from "node:crypto";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";

if (!isDev && ALLOWED_ORIGINS.length === 0) {
  // eslint-disable-next-line no-console
  console.warn("[security] WARNING: ALLOWED_ORIGINS is empty in production. All cross-origin requests will be rejected.");
}

/**
 * Helmet: sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.).
 * In development, CSP is relaxed for inline scripts/styles used by Vite.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: isDev
    ? false
    : {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.stripe.com"],
          frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
          fontSrc: ["'self'", "https:", "data:"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
  crossOriginEmbedderPolicy: false,
  hsts: isDev
    ? false
    : { maxAge: 63072000, includeSubDomains: true, preload: true },
});

/**
 * CORS origin check. Allows:
 * - Any origin in dev mode
 * - Origins listed in ALLOWED_ORIGINS env var in production
 */
export function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (isDev || !origin) {
    callback(null, true);
    return;
  }

  if (ALLOWED_ORIGINS.length === 0) {
    callback(new Error("Not allowed by CORS"));
    return;
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Not allowed by CORS"));
}

/**
 * Per-request CORS options delegate.
 *
 * Browsers attach an Origin header to ALL state-changing requests — including
 * same-origin POST/PUT/DELETE. Since the API serves the frontend from its own
 * domain in production, running every request through the ALLOWED_ORIGINS
 * allow-list rejected the app's own form submissions (e.g. "Create project")
 * unless the deployment also listed its own public domain. Same-origin
 * requests (Origin host matches the request's Host header) are therefore
 * always allowed; cross-origin requests still go through corsOrigin above.
 * Cross-site request forgery remains covered by csrfProtection.
 */
export function corsOptionsDelegate(
  req: { headers: Record<string, string | string[] | undefined> },
  callback: (err: Error | null, options?: CorsOptions) => void,
): void {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host = typeof req.headers.host === "string" ? req.headers.host : undefined;

  if (origin && host) {
    try {
      if (new URL(origin).host === host) {
        callback(null, { origin: true, credentials: true });
        return;
      }
    } catch { /* malformed Origin header — fall through to allow-list check */ }
  }

  callback(null, { origin: corsOrigin, credentials: true });
}

/**
 * CSRF protection via double-submit cookie pattern.
 *
 * On any state-changing request (POST, PUT, PATCH, DELETE), the client must
 * send an `x-csrf-token` header whose value matches the `pta_csrf` cookie.
 * The cookie is set on every response so the client can read it and echo it.
 *
 * Exemptions: Stripe webhook (uses its own HMAC verification), health check.
 */
const CSRF_COOKIE = "pta_csrf";
const CSRF_HEADER = "x-csrf-token";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set(["/api/billing/webhook", "/api/healthz"]);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
  }
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: !isDev,
    sameSite: "lax",
    path: "/",
  });

  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  if (isDev) {
    next();
    return;
  }

  const headerToken = req.headers[CSRF_HEADER];
  if (!headerToken || headerToken !== token) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }

  next();
}
