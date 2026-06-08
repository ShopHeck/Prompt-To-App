/**
 * SSE Session Manager
 * 
 * Manages event buffering per session so clients can reconnect and replay
 * missed events using the Last-Event-ID protocol.
 */

export interface SSEEvent {
  id: number;
  data: object;
  timestamp: number;
}

interface Session {
  events: SSEEvent[];
  nextId: number;
  createdAt: number;
  lastActiveAt: number;
}

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SSESessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxEventsPerSession: number;
  private ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { maxEvents?: number; ttlMs?: number }) {
    this.maxEventsPerSession = opts?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.startCleanup();
  }

  /** Create or retrieve a session by ID. */
  getOrCreateSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        events: [],
        nextId: 1,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }
  }

  /** Store an event in the session buffer and return the assigned event ID. */
  pushEvent(sessionId: string, data: object): number {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.getOrCreateSession(sessionId);
      session = this.sessions.get(sessionId)!;
    }

    const eventId = session.nextId++;
    session.lastActiveAt = Date.now();

    session.events.push({ id: eventId, data, timestamp: Date.now() });

    // Trim to max buffer size
    if (session.events.length > this.maxEventsPerSession) {
      session.events = session.events.slice(session.events.length - this.maxEventsPerSession);
    }

    return eventId;
  }

  /** Get all events after the given lastEventId. Returns empty array if session not found. */
  getEventsSince(sessionId: string, lastEventId: number): SSEEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.events.filter((e) => e.id > lastEventId);
  }

  /** Check if a session exists. */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Remove a session manually. */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Get session info for debugging. */
  getSessionInfo(sessionId: string): { eventCount: number; nextId: number } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return { eventCount: session.events.length, nextId: session.nextId };
  }

  /** Cleanup expired sessions based on TTL. */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Allow process to exit even if timer is running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** Stop the cleanup timer (for testing/shutdown). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/** Singleton session manager instance. */
export const sseSessionManager = new SSESessionManager();
