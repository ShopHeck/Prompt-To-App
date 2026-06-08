import type { Request, Response, NextFunction } from "express";

interface Metrics {
  totalRequests: number;
  totalErrors: number;
  statusCodes: Record<string, number>;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
}

interface GenerationMetrics {
  generationsStarted: number;
  generationsCompleted: number;
  generationsFailed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalAiCostCents: number;
  byProvider: Record<string, { count: number; promptTokens: number; completionTokens: number; costCents: number }>;
}

// Cost per 1M tokens in cents (configurable via env)
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "openai:gpt-4o": {
    input: Number(process.env.COST_OPENAI_GPT4O_INPUT ?? 250),
    output: Number(process.env.COST_OPENAI_GPT4O_OUTPUT ?? 1000),
  },
  "google:gemini-pro": {
    input: Number(process.env.COST_GEMINI_PRO_INPUT ?? 125),
    output: Number(process.env.COST_GEMINI_PRO_OUTPUT ?? 500),
  },
  "anthropic:sonnet": {
    input: Number(process.env.COST_ANTHROPIC_SONNET_INPUT ?? 300),
    output: Number(process.env.COST_ANTHROPIC_SONNET_OUTPUT ?? 1500),
  },
};

const DEFAULT_COST = { input: 200, output: 800 };

let totalRequests = 0;
let totalErrors = 0;
const statusCodes: Record<string, number> = {};
const responseTimes: number[] = [];
const MAX_SAMPLES = 1000;

let generationsStarted = 0;
let generationsCompleted = 0;
let generationsFailed = 0;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;
let totalAiCostCents = 0;
const providerMetrics: Record<string, { count: number; promptTokens: number; completionTokens: number; costCents: number }> = {};

function estimateCostCents(provider: string, model: string, promptTokens: number, completionTokens: number): number {
  const key = `${provider}:${model}`;
  const rates = COST_TABLE[key] ?? DEFAULT_COST;
  const inputCost = (promptTokens / 1_000_000) * rates.input;
  const outputCost = (completionTokens / 1_000_000) * rates.output;
  return Math.round((inputCost + outputCost) * 100) / 100;
}

export function recordGenerationMetric(
  status: "started" | "completed" | "failed",
  promptTokens: number,
  completionTokens: number,
  provider: string,
  model: string,
): void {
  if (status === "started") {
    generationsStarted++;
  } else if (status === "completed") {
    generationsCompleted++;
  } else {
    generationsFailed++;
  }

  totalPromptTokens += promptTokens;
  totalCompletionTokens += completionTokens;

  const costCents = estimateCostCents(provider, model, promptTokens, completionTokens);
  totalAiCostCents += costCents;

  if (!providerMetrics[provider]) {
    providerMetrics[provider] = { count: 0, promptTokens: 0, completionTokens: 0, costCents: 0 };
  }
  providerMetrics[provider]!.count++;
  providerMetrics[provider]!.promptTokens += promptTokens;
  providerMetrics[provider]!.completionTokens += completionTokens;
  providerMetrics[provider]!.costCents += costCents;
}

export function generationMetricsSnapshot(): GenerationMetrics {
  const byProvider: Record<string, { count: number; promptTokens: number; completionTokens: number; costCents: number }> = {};
  for (const [key, value] of Object.entries(providerMetrics)) {
    byProvider[key] = { ...value };
  }
  return {
    generationsStarted,
    generationsCompleted,
    generationsFailed,
    totalPromptTokens,
    totalCompletionTokens,
    totalAiCostCents: Math.round(totalAiCostCents * 100) / 100,
    byProvider,
  };
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    totalRequests++;
    if (res.statusCode >= 500) totalErrors++;

    const bucket = `${Math.floor(res.statusCode / 100)}xx`;
    statusCodes[bucket] = (statusCodes[bucket] ?? 0) + 1;

    responseTimes.push(durationMs);
    if (responseTimes.length > MAX_SAMPLES) responseTimes.shift();
  });

  next();
}

export function metricsSnapshot(): Metrics {
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
  const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] ?? 0 : 0;

  return {
    totalRequests,
    totalErrors,
    statusCodes: { ...statusCodes },
    avgResponseTimeMs: Math.round(avg * 100) / 100,
    p95ResponseTimeMs: Math.round(p95 * 100) / 100,
  };
}
