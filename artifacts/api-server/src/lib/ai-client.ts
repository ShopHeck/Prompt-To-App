// Unified multi-provider AI client.
// Supports OpenAI, Gemini (Google AI Studio), and Anthropic with:
//   - Automatic retry with exponential backoff + jitter
//   - Model fallback when primary is overloaded
//   - Streaming and non-streaming modes
//   - Normalized response interface
//
// Ported from ApexBuild's _shared/ai.ts and adapted for Node.js.

import { isMockEnabled, mockCallAI, mockStreamAI } from "./ai-mock";

export type Provider = "openai" | "gemini" | "anthropic";

export interface AICallOptions {
  provider: Provider;
  model: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: "json" | "text";
  /** Extra messages for multi-turn (e.g. repair conversations) */
  extraMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number, error: AIError) => void;
}

export interface AIResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIStreamChunk {
  content: string;
  finishReason: string | null;
}

export class AIError extends Error {
  status: number;
  provider: Provider;
  retryable: boolean;
  constructor(provider: Provider, status: number, message: string) {
    super(`[${provider}] ${status}: ${message}`);
    this.provider = provider;
    this.status = status;
    this.retryable = RETRYABLE_STATUSES.has(status);
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ─── Default + fallback models per provider ──────────────────────────────
export const DEFAULT_MODELS: Record<Provider, { planner: string; engineer: string; reviewer: string }> = {
  openai: {
    planner: process.env.OPENAI_PLANNER_MODEL ?? "gpt-5.4",
    engineer: process.env.OPENAI_ENGINEER_MODEL ?? "gpt-5.4",
    reviewer: process.env.OPENAI_REVIEWER_MODEL ?? "gpt-5.4",
  },
  gemini: {
    planner: process.env.GEMINI_PLANNER_MODEL ?? "gemini-2.5-pro",
    engineer: process.env.GEMINI_ENGINEER_MODEL ?? "gemini-2.5-pro",
    reviewer: process.env.GEMINI_REVIEWER_MODEL ?? "gemini-2.5-flash",
  },
  anthropic: {
    planner: process.env.ANTHROPIC_PLANNER_MODEL ?? "claude-sonnet-4-6",
    engineer: process.env.ANTHROPIC_ENGINEER_MODEL ?? "claude-opus-4-7",
    reviewer: process.env.ANTHROPIC_REVIEWER_MODEL ?? "claude-haiku-4-5-20251001",
  },
};

export const FALLBACK_MODELS: Record<Provider, { planner: string; engineer: string; reviewer: string }> = {
  openai: {
    planner: "gpt-4.1-mini",
    engineer: "gpt-4.1-mini",
    reviewer: "gpt-4.1-mini",
  },
  gemini: {
    planner: "gemini-2.5-flash",
    engineer: "gemini-2.5-flash",
    reviewer: "gemini-2.0-flash",
  },
  anthropic: {
    planner: "claude-haiku-4-5-20251001",
    engineer: "claude-sonnet-4-6",
    reviewer: "claude-haiku-4-5-20251001",
  },
};

// ─── API key resolution ──────────────────────────────────────────────────
export function getApiKey(provider: Provider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
  }
}

export function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];
  if (getApiKey("openai")) providers.push("openai");
  if (getApiKey("gemini")) providers.push("gemini");
  if (getApiKey("anthropic")) providers.push("anthropic");
  return providers;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3;
}

// ─── Non-streaming call with retry ───────────────────────────────────────
export async function callAI(opts: AICallOptions): Promise<AIResult> {
  // Delegate to mock layer when enabled (for tests)
  if (isMockEnabled()) {
    return mockCallAI(opts);
  }

  const maxRetries = opts.maxRetries ?? 3;
  const initialDelay = opts.initialRetryDelayMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let lastError: AIError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && lastError) {
      const delay = jitter(initialDelay * Math.pow(2, attempt - 1));
      opts.onRetry?.(attempt, maxRetries, delay, lastError);
      await sleep(delay);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await callProvider(opts, controller.signal);
        return result;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof AIError && err.retryable && attempt < maxRetries) {
        lastError = err;
        continue;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new AIError(opts.provider, 408, `Request timed out after ${timeoutMs / 1000}s`);
      }
      if (err instanceof AIError) throw err;
      throw new AIError(opts.provider, 500, err instanceof Error ? err.message : "Unknown error");
    }
  }
  throw lastError ?? new AIError(opts.provider, 500, "All retries exhausted");
}

// ─── Call with automatic model fallback ──────────────────────────────────
export async function callWithFallback(
  opts: AICallOptions,
  fallbackModel: string,
  onFallback?: (message: string) => void,
): Promise<AIResult> {
  try {
    return await callAI(opts);
  } catch (err) {
    if (err instanceof AIError && err.retryable && fallbackModel !== opts.model) {
      onFallback?.(`Switching to fallback model (${fallbackModel})...`);
      return await callAI({ ...opts, model: fallbackModel, maxRetries: 2 });
    }
    throw err;
  }
}

// ─── Streaming call (returns async iterator) ─────────────────────────────
export async function* streamAI(opts: AICallOptions): AsyncGenerator<AIStreamChunk> {
  // Delegate to mock layer when enabled (for tests)
  if (isMockEnabled()) {
    yield* mockStreamAI(opts);
    return;
  }

  const maxRetries = opts.maxRetries ?? 2;
  const initialDelay = opts.initialRetryDelayMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 300_000;

  let lastError: AIError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && lastError) {
      const delay = jitter(initialDelay * Math.pow(2, attempt - 1));
      opts.onRetry?.(attempt, maxRetries, delay, lastError);
      await sleep(delay);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        yield* streamProvider(opts, controller.signal);
        return;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof AIError && err.retryable && attempt < maxRetries) {
        lastError = err;
        continue;
      }
      if (err instanceof AIError) throw err;
      throw new AIError(opts.provider, 500, err instanceof Error ? err.message : "Unknown error");
    }
  }
  throw lastError ?? new AIError(opts.provider, 500, "All retries exhausted");
}

// ─── Provider dispatch (non-streaming) ───────────────────────────────────
async function callProvider(opts: AICallOptions, signal: AbortSignal): Promise<AIResult> {
  switch (opts.provider) {
    case "openai": return callOpenAI(opts, signal);
    case "gemini": return callGemini(opts, signal);
    case "anthropic": return callAnthropic(opts, signal);
  }
}

// ─── Provider dispatch (streaming) ───────────────────────────────────────
async function* streamProvider(opts: AICallOptions, signal: AbortSignal): AsyncGenerator<AIStreamChunk> {
  switch (opts.provider) {
    case "openai": yield* streamOpenAI(opts, signal); break;
    case "gemini": yield* streamGemini(opts, signal); break;
    case "anthropic": yield* streamAnthropic(opts, signal); break;
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────
function buildOpenAIMessages(opts: AICallOptions) {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.userMessage },
  ];
  if (opts.extraMessages) {
    messages.push(...opts.extraMessages);
  }
  return messages;
}

async function callOpenAI(opts: AICallOptions, signal: AbortSignal): Promise<AIResult> {
  const apiKey = getApiKey("openai");
  if (!apiKey) throw new AIError("openai", 401, "OPENAI_API_KEY not configured");
  const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const body: Record<string, unknown> = {
    model: opts.model,
    max_completion_tokens: opts.maxTokens ?? 8192,
    messages: buildOpenAIMessages(opts),
  };
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("openai", resp.status, parseProviderError(resp.status, raw));
  }
  const data = await resp.json() as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const choice = data.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: data.model,
    finishReason: choice?.finish_reason ?? null,
    usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
  };
}

async function* streamOpenAI(opts: AICallOptions, signal: AbortSignal): AsyncGenerator<AIStreamChunk> {
  const apiKey = getApiKey("openai");
  if (!apiKey) throw new AIError("openai", 401, "OPENAI_API_KEY not configured");
  const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const body: Record<string, unknown> = {
    model: opts.model,
    max_completion_tokens: opts.maxTokens ?? 8192,
    messages: buildOpenAIMessages(opts),
    stream: true,
  };
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("openai", resp.status, parseProviderError(resp.status, raw));
  }

  yield* parseSSEStream(resp, "openai");
}

// ─── Gemini (Google AI Studio) ───────────────────────────────────────────
async function callGemini(opts: AICallOptions, signal: AbortSignal): Promise<AIResult> {
  const apiKey = getApiKey("gemini");
  if (!apiKey) throw new AIError("gemini", 401, "GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: buildGeminiContents(opts),
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 8192 },
  };
  if (opts.responseFormat === "json") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("gemini", resp.status, parseProviderError(resp.status, raw));
  }
  const data = await resp.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AIError("gemini", 200, "empty response from Gemini");
  return {
    content: text,
    model: opts.model,
    finishReason: data.candidates?.[0]?.finishReason ?? null,
    usage: data.usageMetadata
      ? { promptTokens: data.usageMetadata.promptTokenCount ?? 0, completionTokens: data.usageMetadata.candidatesTokenCount ?? 0 }
      : undefined,
  };
}

function buildGeminiContents(opts: AICallOptions) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
    { role: "user", parts: [{ text: opts.userMessage }] },
  ];
  if (opts.extraMessages) {
    for (const m of opts.extraMessages) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
  }
  return contents;
}

async function* streamGemini(opts: AICallOptions, signal: AbortSignal): AsyncGenerator<AIStreamChunk> {
  const apiKey = getApiKey("gemini");
  if (!apiKey) throw new AIError("gemini", 401, "GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?alt=sse`;
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: buildGeminiContents(opts),
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 8192 },
  };
  if (opts.responseFormat === "json") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("gemini", resp.status, parseProviderError(resp.status, raw));
  }

  yield* parseGeminiSSE(resp);
}

// ─── Anthropic (Claude) ──────────────────────────────────────────────────
async function callAnthropic(opts: AICallOptions, signal: AbortSignal): Promise<AIResult> {
  const apiKey = getApiKey("anthropic");
  if (!apiKey) throw new AIError("anthropic", 401, "ANTHROPIC_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8192,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: buildAnthropicMessages(opts),
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("anthropic", resp.status, parseProviderError(resp.status, raw));
  }
  const data = await resp.json() as {
    content: Array<{ type: string; text?: string }>;
    model: string;
    stop_reason: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new AIError("anthropic", 200, "empty response from Anthropic");
  return {
    content: text,
    model: data.model,
    finishReason: data.stop_reason ?? null,
    usage: data.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens } : undefined,
  };
}

function buildAnthropicMessages(opts: AICallOptions) {
  const messages: Array<{ role: string; content: string }> = [
    { role: "user", content: opts.userMessage },
  ];
  if (opts.extraMessages) {
    messages.push(...opts.extraMessages);
  }
  return messages;
}

async function* streamAnthropic(opts: AICallOptions, signal: AbortSignal): AsyncGenerator<AIStreamChunk> {
  const apiKey = getApiKey("anthropic");
  if (!apiKey) throw new AIError("anthropic", 401, "ANTHROPIC_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8192,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: buildAnthropicMessages(opts),
    stream: true,
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const raw = (await resp.text()).slice(0, 400);
    throw new AIError("anthropic", resp.status, parseProviderError(resp.status, raw));
  }

  yield* parseAnthropicSSE(resp);
}

// ─── SSE parsing helpers ─────────────────────────────────────────────────
async function* parseSSEStream(resp: Response, provider: Provider): AsyncGenerator<AIStreamChunk> {
  if (!resp.body) throw new AIError(provider, 500, "No response body");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          };
          const choice = parsed.choices?.[0];
          const content = choice?.delta?.content ?? "";
          if (content || choice?.finish_reason) {
            yield { content, finishReason: choice?.finish_reason ?? null };
          }
        } catch { /* skip unparseable lines */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* parseGeminiSSE(resp: Response): AsyncGenerator<AIStreamChunk> {
  if (!resp.body) throw new AIError("gemini", 500, "No response body");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
          };
          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          const text = parts.map((p) => p.text ?? "").join("");
          const finishReason = parsed.candidates?.[0]?.finishReason ?? null;
          if (text || finishReason) {
            yield { content: text, finishReason };
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* parseAnthropicSSE(resp: Response): AsyncGenerator<AIStreamChunk> {
  if (!resp.body) throw new AIError("anthropic", 500, "No response body");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as {
            type: string;
            delta?: { type?: string; text?: string };
            message?: { stop_reason?: string };
          };
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            yield { content: parsed.delta.text, finishReason: null };
          } else if (parsed.type === "message_delta") {
            yield { content: "", finishReason: (parsed as { delta?: { stop_reason?: string } }).delta?.stop_reason ?? "end_turn" };
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Error parsing ───────────────────────────────────────────────────────
const FRIENDLY_ERRORS: Record<number, string> = {
  429: "AI model rate-limited — retrying with backoff.",
  500: "AI provider internal error — retrying.",
  502: "AI provider temporarily unreachable — retrying.",
  503: "AI model under high demand — retrying with fallback.",
  504: "AI provider response timed out — retrying.",
  408: "Request timed out. Try a simpler prompt or try again later.",
};

function parseProviderError(status: number, raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; status?: string }; message?: string };
    const msg = j.error?.message ?? j.error?.status ?? j.message ?? "";
    if (msg) return `${FRIENDLY_ERRORS[status] ?? ""} ${msg}`.trim();
  } catch { /* not JSON */ }
  return FRIENDLY_ERRORS[status] ?? raw;
}

// ─── Convenience: resolve provider from request ──────────────────────────
export function resolveProvider(requested?: string): Provider {
  if (requested === "gemini" || requested === "anthropic" || requested === "openai") {
    const key = getApiKey(requested);
    if (key) return requested;
  }
  // Fall back to first available provider
  const available = getAvailableProviders();
  if (available.length === 0) {
    throw new AIError("openai", 401, "No AI provider API keys configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.");
  }
  return available[0];
}
