import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { captureError } from "../lib/sentry";

/**
 * Express error-handling middleware (4-arity signature).
 * Catches thrown errors and unhandled rejections from async handlers.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const status = (err as { status?: number }).status ?? 500;

  req.log.error({ err, method: req.method, path: req.path }, "Unhandled error");

  if (status >= 500) {
    captureError(err, { method: req.method, path: req.path, userId: req.user?.id });
  }

  if (res.headersSent) {
    return;
  }

  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message,
  });
}

/**
 * Register global process-level error handlers.
 * Call once at startup (in index.ts).
 */
export function registerProcessHandlers(): void {
  process.on("uncaughtException", (err) => {
    captureError(err, { context: "uncaughtException" });
    logger.fatal({ err }, "Uncaught exception — shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    captureError(reason, { context: "unhandledRejection" });
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
}
