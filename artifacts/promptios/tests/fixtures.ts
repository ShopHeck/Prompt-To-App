import { readFileSync } from "fs";
import { FIXTURES_PATH } from "./fixtures-path";

export interface SeededFixtures {
  completeProjectId: number;
  awaitingProjectId: number;
  shareToken: string;
}

let cached: SeededFixtures | null = null;

export function loadFixtures(): SeededFixtures {
  if (cached) return cached;
  const raw = readFileSync(FIXTURES_PATH, "utf8");
  cached = JSON.parse(raw) as SeededFixtures;
  return cached;
}
