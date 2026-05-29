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
app.use(cookieParser());
// Raw body for Stripe webhook signature verification
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(csrfProtection);
app.use(authMiddleware);
app.use("/api", apiLimiter, router);

// Serve frontend static files in production
const publicDir = path.resolve(import.meta.dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: "1y", immutable: true }));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(errorHandler);

export default app;
