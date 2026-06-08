/**
 * Robust SSE client with automatic reconnection and event deduplication.
 *
 * Uses fetch + ReadableStream (not EventSource) for POST support and
 * custom header handling (Last-Event-ID on reconnect).
 */

export type SSEConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SSEClientOptions {
  /** Full URL to the SSE endpoint. */
  url: string;
  /** HTTP method, defaults to POST. */
  method?: "GET" | "POST";
  /** Request body (for POST). */
  body?: string;
  /** Additional headers to include on every request. */
  headers?: Record<string, string>;
  /** Called for each new (non-duplicate) event. */
  onEvent: (event: unknown) => void;
  /** Called when the connection state changes. */
  onStateChange?: (state: SSEConnectionState) => void;
  /** Called on unrecoverable error. */
  onError?: (error: Error) => void;
  /** Maximum number of reconnection attempts before giving up. 0 = unlimited. */
  maxRetries?: number;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF_FACTOR = 2;

export class SSEClient {
  private lastEventId: string | null = null;
  private sessionId: string | null = null;
  private seenIds: Set<number> = new Set();
  private abortController: AbortController | null = null;
  private state: SSEConnectionState = "disconnected";
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private opts: Required<Pick<SSEClientOptions, "url" | "method" | "onEvent">> & SSEClientOptions;

  constructor(opts: SSEClientOptions) {
    this.opts = {
      method: "POST",
      ...opts,
    };
  }

  /** Start the SSE connection. */
  connect(): void {
    this.closed = false;
    this.doConnect();
  }

  /** Permanently close the connection and stop reconnection. */
  close(): void {
    this.closed = true;
    this.clearRetryTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setState("disconnected");
  }

  /** Get the current connection state. */
  getState(): SSEConnectionState {
    return this.state;
  }

  /** Get the session ID assigned by the server, if any. */
  getSessionId(): string | null {
    return this.sessionId;
  }

  private setState(s: SSEConnectionState): void {
    if (this.state !== s) {
      this.state = s;
      this.opts.onStateChange?.(s);
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private getBackoffDelay(): number {
    const delay = Math.min(BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, this.retryCount), MAX_DELAY_MS);
    return delay;
  }

  private async doConnect(): Promise<void> {
    if (this.closed) return;

    this.abortController = new AbortController();
    const isReconnect = this.retryCount > 0;
    this.setState(isReconnect ? "reconnecting" : "connecting");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.opts.headers ?? {}),
    };

    // Send Last-Event-ID on reconnection
    if (this.lastEventId) {
      headers["Last-Event-ID"] = this.lastEventId;
    }

    try {
      const fetchOpts: RequestInit = {
        method: this.opts.method,
        headers,
        signal: this.abortController.signal,
      };
      if (this.opts.method === "POST" && this.opts.body) {
        fetchOpts.body = this.opts.body;
      }

      const response = await fetch(this.opts.url, fetchOpts);

      if (!response.ok) {
        throw new Error(`SSE request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      // Successfully connected
      this.setState("connected");
      this.retryCount = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (this.closed) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentId: string | null = null;

        for (const line of lines) {
          const trimmed = line.trim();

          // Parse event ID line
          if (trimmed.startsWith("id: ")) {
            currentId = trimmed.slice(4);
            this.lastEventId = currentId;
            continue;
          }

          // Parse data line
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6));

              // Deduplicate by event ID
              if (currentId !== null) {
                const numericId = parseInt(currentId, 10);
                if (!isNaN(numericId)) {
                  if (this.seenIds.has(numericId)) {
                    currentId = null;
                    continue;
                  }
                  this.seenIds.add(numericId);
                  // Keep the set from growing unbounded
                  if (this.seenIds.size > 500) {
                    const arr = Array.from(this.seenIds).sort((a, b) => a - b);
                    const toRemove = arr.slice(0, arr.length - 300);
                    for (const id of toRemove) this.seenIds.delete(id);
                  }
                }
              }

              // Track session ID from the server
              if (event.type === "session" && event.sessionId) {
                this.sessionId = event.sessionId;
              }

              this.opts.onEvent(event);
              currentId = null;
            } catch (_) {
              // Ignore unparseable data lines
            }
          }
        }
      }

      // Stream ended normally (server closed)
      if (!this.closed) {
        this.setState("disconnected");
      }
    } catch (err) {
      if (this.closed) return;

      // AbortError means we intentionally closed
      if (err instanceof DOMException && err.name === "AbortError") return;

      const maxRetries = this.opts.maxRetries ?? 0;
      if (maxRetries > 0 && this.retryCount >= maxRetries) {
        this.setState("disconnected");
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      // Schedule reconnection with exponential backoff
      const delay = this.getBackoffDelay();
      this.retryCount++;
      this.setState("reconnecting");

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.doConnect();
      }, delay);
    }
  }
}
