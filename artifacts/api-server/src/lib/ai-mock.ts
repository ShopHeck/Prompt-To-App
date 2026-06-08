/**
 * Mock AI layer for deterministic testing.
 *
 * Provides MockAIClient, enableMockAI/disableMockAI helpers,
 * and utilities to set pre-recorded responses for callAI / streamAI.
 */

import type { AIResult, AIStreamChunk, AICallOptions } from "./ai-client";

type CallHandler = (opts: AICallOptions) => Promise<AIResult>;
type StreamHandler = (opts: AICallOptions) => AsyncGenerator<AIStreamChunk>;

let mockEnabled = false;
let mockCallHandler: CallHandler | null = null;
let mockStreamHandler: StreamHandler | null = null;
let callHistory: AICallOptions[] = [];

export class MockAIClient {
  private responses: AIResult[] = [];
  private streamResponses: AIStreamChunk[][] = [];
  private callIndex = 0;
  private streamIndex = 0;

  /** Queue a response that will be returned on the next callAI invocation. */
  addResponse(response: AIResult): void {
    this.responses.push(response);
  }

  /** Queue stream chunks that will be yielded on the next streamAI invocation. */
  addStreamResponse(chunks: AIStreamChunk[]): void {
    this.streamResponses.push(chunks);
  }

  /** Get the handler function for non-streaming calls. */
  getCallHandler(): CallHandler {
    return async (_opts: AICallOptions): Promise<AIResult> => {
      if (this.callIndex >= this.responses.length) {
        throw new Error(
          `MockAIClient: no more responses queued (requested index ${this.callIndex}, have ${this.responses.length})`,
        );
      }
      return this.responses[this.callIndex++]!;
    };
  }

  /** Get the handler function for streaming calls. */
  getStreamHandler(): StreamHandler {
    const streamResponses = this.streamResponses;
    let streamIndex = 0;
    return async function* (_opts: AICallOptions): AsyncGenerator<AIStreamChunk> {
      if (streamIndex >= streamResponses.length) {
        throw new Error(
          `MockAIClient: no more stream responses queued (requested index ${streamIndex}, have ${streamResponses.length})`,
        );
      }
      const chunks = streamResponses[streamIndex++]!;
      for (const chunk of chunks) {
        yield chunk;
      }
    };
  }

  /** Reset the client state, clearing all queued responses and history. */
  reset(): void {
    this.responses = [];
    this.streamResponses = [];
    this.callIndex = 0;
    this.streamIndex = 0;
  }
}

/**
 * Enable mock mode. All subsequent calls to mockCallAI / mockStreamAI will use
 * the configured handlers instead of hitting real AI providers.
 */
export function enableMockAI(): void {
  mockEnabled = true;
  callHistory = [];
}

/**
 * Disable mock mode and restore default (pass-through) behavior.
 */
export function disableMockAI(): void {
  mockEnabled = false;
  mockCallHandler = null;
  mockStreamHandler = null;
  callHistory = [];
}

/**
 * Set a fixed response that will be returned for all mocked callAI invocations.
 */
export function setMockResponse(response: AIResult): void {
  mockCallHandler = async () => response;
}

/**
 * Set fixed stream chunks that will be yielded for all mocked streamAI invocations.
 */
export function setMockStreamResponse(chunks: AIStreamChunk[]): void {
  mockStreamHandler = async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  };
}

/**
 * Install a MockAIClient instance as the active mock handler.
 */
export function installMockClient(client: MockAIClient): void {
  mockCallHandler = client.getCallHandler();
  mockStreamHandler = client.getStreamHandler();
}

/**
 * Returns true when mock mode is active.
 */
export function isMockEnabled(): boolean {
  return mockEnabled;
}

/**
 * Get the call history (records of AICallOptions passed to mockCallAI).
 */
export function getCallHistory(): AICallOptions[] {
  return callHistory;
}

/**
 * Mock replacement for callAI. If mock mode is enabled and a handler is set,
 * delegates to the handler; otherwise throws.
 */
export async function mockCallAI(opts: AICallOptions): Promise<AIResult> {
  if (!mockEnabled || !mockCallHandler) {
    throw new Error("mockCallAI: mock mode is not enabled or no handler is set");
  }
  callHistory.push(opts);
  return mockCallHandler(opts);
}

/**
 * Mock replacement for streamAI. If mock mode is enabled and a handler is set,
 * delegates to the handler; otherwise throws.
 */
export async function* mockStreamAI(opts: AICallOptions): AsyncGenerator<AIStreamChunk> {
  if (!mockEnabled || !mockStreamHandler) {
    throw new Error("mockStreamAI: mock mode is not enabled or no handler is set");
  }
  callHistory.push(opts);
  yield* mockStreamHandler(opts);
}
