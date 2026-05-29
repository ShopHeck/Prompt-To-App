import app from "./app";
import { logger } from "./lib/logger";
import { registerProcessHandlers } from "./middleware/error-handler";

registerProcessHandlers();

const port = Number(process.env["PORT"]) || 8080;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
