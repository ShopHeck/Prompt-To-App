import { useEffect, useRef } from "react";
import { Terminal as TerminalIcon, X, Trash2 } from "lucide-react";

export type LogKind =
  | "info"
  | "clarify"
  | "plan"
  | "build"
  | "validate"
  | "repair"
  | "preview"
  | "done"
  | "error";

export interface LogLine {
  id: number;
  time: number;
  kind: LogKind;
  text: string;
}

const KIND_META: Record<LogKind, { label: string; color: string }> = {
  info: { label: "info", color: "text-slate-400" },
  clarify: { label: "clarify", color: "text-cyan-400" },
  plan: { label: "plan", color: "text-sky-400" },
  build: { label: "build", color: "text-orange-400" },
  validate: { label: "validate", color: "text-violet-400" },
  repair: { label: "repair", color: "text-amber-400" },
  preview: { label: "preview", color: "text-emerald-400" },
  done: { label: "done", color: "text-emerald-300" },
  error: { label: "error", color: "text-red-400" },
};

function fmtTime(t: number) {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function BuildTerminal({
  lines,
  active,
  onClose,
  onClear,
  className = "",
}: {
  lines: LogLine[];
  active: boolean;
  onClose?: () => void;
  onClear?: () => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, active]);

  return (
    <div
      className={`flex flex-col bg-[#0b0d10] border border-border/60 rounded-md overflow-hidden font-mono shadow-2xl ${className}`}
      data-testid="build-terminal"
    >
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/60 bg-[#0f1216] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        </div>
        <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground ml-1" strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground select-none">
          agent.log
        </span>
        {active && (
          <span className="ml-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            live
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {onClear && lines.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              title="Clear log"
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Hide log"
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              data-testid="btn-close-terminal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 text-[12.5px] leading-[1.65] tabular-nums bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.04),transparent_60%)]"
      >
        {lines.length === 0 ? (
          <div className="text-muted-foreground/60">
            <span className="text-emerald-400">$</span> awaiting agent…
          </div>
        ) : (
          <>
            {lines.map((line) => {
              const meta = KIND_META[line.kind];
              return (
                <div
                  key={line.id}
                  className="flex items-start gap-3 animate-in fade-in slide-in-from-left-1 duration-200"
                >
                  <span className="text-muted-foreground/45 select-none shrink-0">
                    {fmtTime(line.time)}
                  </span>
                  <span className={`shrink-0 w-[60px] ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-slate-200 break-words whitespace-pre-wrap min-w-0 flex-1">
                    {line.text}
                  </span>
                </div>
              );
            })}
            {active && (
              <div className="flex items-center gap-2 mt-1 pl-[calc(60px+8ch+24px)]">
                <span
                  className="inline-block h-3.5 w-1.5 bg-emerald-400 animate-pulse"
                  aria-hidden
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
