import * as React from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import type { SSEConnectionState } from "@/lib/sse-client";

interface SSEStatusProps {
  state: SSEConnectionState;
  className?: string;
}

/**
 * A small badge that indicates the current SSE connection state.
 * Intended to be placed in the build terminal area.
 */
export function SSEStatus({ state, className = "" }: SSEStatusProps) {
  if (state === "connected" || state === "disconnected") return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
        state === "reconnecting"
          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
          : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
      } ${className}`}
    >
      {state === "reconnecting" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          Reconnecting...
        </>
      ) : (
        <>
          <Wifi className="h-3 w-3" strokeWidth={2} />
          Connecting...
        </>
      )}
    </span>
  );
}
