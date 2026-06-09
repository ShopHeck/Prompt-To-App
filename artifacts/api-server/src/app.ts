import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth";
import { apiLimiter } from "./middleware/rate-limit";
import { securityHeaders, corsOrigin, csrfProtection } from "./middleware/security";
import { errorHandler } from "./middleware/error-handler";
import { metricsMiddleware } from "./middleware/metrics";

const app: Express = express();

app.use(metricsMiddleware);
app.use(securityHeaders);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: corsOrigin, credentials: true }));

// Serve frontend static files in production (before body parsers and auth)
const publicDir = path.resolve(import.meta.dirname, "..", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    maxAge: "1y",
    immutable: true,
    setHeaders(res, filePath) {
      // Hashed assets get immutable caching; CDN edge gets Surrogate-Control
      if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|svg)$/.test(filePath)) {
        res.setHeader("Surrogate-Control", "max-age=31536000, immutable");
      } else {
        // Non-hashed assets (index.html) get shorter cache with revalidation
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
        res.setHeader("Surrogate-Control", "max-age=600");
      }
    },
  }));
}

app.use(cookieParser());
// Raw body for Stripe webhook signature verification
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
// Higher body limit for visual-feedback endpoint (base64 screenshots up to ~5MB)
app.use("/api/projects/:id/visual-feedback", express.json({ limit: "5mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(csrfProtection);
app.use(authMiddleware);
app.use("/api", apiLimiter, router);

// SPA catch-all: after API routes so /api/* is not intercepted, before errorHandler
if (fs.existsSync(publicDir)) {
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("Surrogate-Control", "max-age=600");
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(errorHandler);

export default app;
