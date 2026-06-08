import { randomUUID } from "node:crypto";
import { db, auditEventsTable } from "@workspace/db";

/**
 * Lightweight distributed tracing module.
 * Generates trace/span IDs and records them to the audit_events table
 * with action='trace_span'. No external dependencies (no OpenTelemetry).
 */

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startedAt: number;
  endedAt: number | null;
  metadata: Record<string, unknown>;
  projectId: number | null;
  userId: number | null;
}

// In-memory map of active spans for fast lookup during a request lifecycle
const activeSpans = new Map<string, TraceSpan>();

/**
 * Start a new trace. Returns a traceId and the root span.
 */
export function startTrace(
  name: string,
  opts?: { projectId?: number; userId?: number },
): { traceId: string; spanId: string } {
  const traceId = randomUUID();
  const spanId = randomUUID();

  const span: TraceSpan = {
    traceId,
    spanId,
    parentSpanId: null,
    name,
    startedAt: Date.now(),
    endedAt: null,
    metadata: {},
    projectId: opts?.projectId ?? null,
    userId: opts?.userId ?? null,
  };

  activeSpans.set(spanId, span);
  return { traceId, spanId };
}

/**
 * Start a child span within an existing trace.
 */
export function startSpan(
  traceId: string,
  name: string,
  parentSpanId?: string,
  opts?: { projectId?: number; userId?: number },
): string {
  const spanId = randomUUID();

  const span: TraceSpan = {
    traceId,
    spanId,
    parentSpanId: parentSpanId ?? null,
    name,
    startedAt: Date.now(),
    endedAt: null,
    metadata: {},
    projectId: opts?.projectId ?? null,
    userId: opts?.userId ?? null,
  };

  activeSpans.set(spanId, span);
  return spanId;
}

/**
 * End a span, optionally attaching metadata. Records the span to audit_events.
 * Fire-and-forget: errors are swallowed to avoid disrupting the request.
 */
export async function endSpan(
  spanId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const span = activeSpans.get(spanId);
  if (!span) return;

  span.endedAt = Date.now();
  if (metadata) {
    span.metadata = { ...span.metadata, ...metadata };
  }

  activeSpans.delete(spanId);

  // Record to audit_events
  try {
    await db.insert(auditEventsTable).values({
      userId: span.userId,
      action: "trace_span",
      ipAddress: null,
      metadata: {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        durationMs: span.endedAt - span.startedAt,
        projectId: span.projectId,
        ...span.metadata,
      },
    });
  } catch {
    // Non-fatal: tracing should never break the request
  }
}

/**
 * Query trace spans for a given project from audit_events.
 */
export async function getProjectTraceSpans(
  projectId: number,
): Promise<Array<typeof auditEventsTable.$inferSelect>> {
  const { eq, and, desc } = await import("drizzle-orm");

  return db
    .select()
    .from(auditEventsTable)
    .where(
      and(
        eq(auditEventsTable.action, "trace_span"),
      ),
    )
    .orderBy(desc(auditEventsTable.createdAt))
    .then((rows) =>
      rows.filter((row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        return meta && meta.projectId === projectId;
      }),
    );
}
