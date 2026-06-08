import { initSentry } from "./lib/sentry";

// Initialize Sentry before importing anything else
initSentry();

import app from "./app";
import { logger } from "./lib/logger";
import { registerProcessHandlers } from "./middleware/error-handler";
import { pool } from "@workspace/db";

registerProcessHandlers();

const port = Number(process.env["PORT"]) || 8080;

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────

const SHUTDOWN_TIMEOUT_MS = 30_000;

function gracefulShutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal, draining connections...");

  server.close(() => {
    logger.info("HTTP server closed, closing DB pool...");
    pool.end()
      .then(() => {
        logger.info("DB pool closed. Exiting.");
        process.exit(0);
      })
      .catch((err) => {
        logger.error({ err }, "Error closing DB pool");
        process.exit(1);
      });
  });

  // Force exit if draining takes too long
  setTimeout(() => {
    logger.error("Shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
