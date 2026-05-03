import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FIXTURES_PATH = resolve(__dirname, ".fixtures.json");
