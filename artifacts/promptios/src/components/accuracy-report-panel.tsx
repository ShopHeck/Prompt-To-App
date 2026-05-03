import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronRight, Check, X, AlertTriangle, Plus } from "lucide-react";

export type AccuracyItemStatus = "matched" | "missing" | "off-spec" | "extra";

export interface AccuracyItem {
  type: "screen" | "model" | "file";
  name: string;
  status: AccuracyItemStatus;
  confidence: number;
  notes?: string;
}

export interface AccuracyReport {
  overallScore: number;
  summary: string;
  items: AccuracyItem[];
}

export interface RepairHistoryEntry {
  at: string;
  targets: string[];
  before: AccuracyReport;
  after: AccuracyReport;
}

interface Props {
  report: AccuracyReport | null;
  history?: RepairHistoryEntry[];
  defaultCollapsed?: boolean;
}

const STATUS_STYLES: Record<AccuracyItemStatus, { bg: string; text: string; icon: typeof Check }> = {
  matched: { bg: "bg-green-500/10 border-green-500/30", text: "text-green-400", icon: Check },
  missing: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400", icon: X },
  "off-spec": { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", icon: AlertTriangle },
  extra: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400", icon: Plus },
};

export function AccuracyReportPanel({ report, history = [], defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (!report) return null;

  const grouped = {
    screen: report.items.filter(i => i.type === "screen"),
    model: report.items.filter(i => i.type === "model"),
    file: report.items.filter(i => i.type === "file"),
  };

  const counts = {
    matched: report.items.filter(i => i.status === "matched").length,
    missing: report.items.filter(i => i.status === "missing").length,
    offSpec: report.items.filter(i => i.status === "off-spec").length,
    extra: report.items.filter(i => i.status === "extra").length,
  };

  const scoreColor = report.overallScore >= 85
    ? "text-green-400 border-green-500/40 bg-green-500/10"
    : report.overallScore >= 60
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-red-400 border-red-500/40 bg-red-500/10";

  return (
    <div className="border-b border-border shrink-0 bg-card/60" data-testid="accuracy-report-panel">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-mono font-bold text-foreground uppercase tracking-widest">
            Accuracy Report
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${scoreColor}`}>
            {report.overallScore}/100
          </span>
          <span className="text-[10px] font-mono text-muted-foreground ml-1 truncate">
            {counts.matched} matched · {counts.missing} missing · {counts.offSpec} off-spec
            {history.length > 0 ? ` · ${history.length} repair${history.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {report.summary && (
            <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
              {report.summary}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["screen", "model", "file"] as const).map(group => (
              <div key={group} className="bg-background/60 rounded border border-border/50 p-3">
                <div className="text-[10px] font-mono font-bold text-foreground uppercase tracking-widest mb-2">
                  {group}s ({grouped[group].length})
                </div>
                {grouped[group].length === 0 ? (
                  <p className="text-[10px] font-mono text-muted-foreground italic">None planned.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {grouped[group].map((item, i) => {
                      const styles = STATUS_STYLES[item.status];
                      const Icon = styles.icon;
                      return (
                        <li
                          key={`${item.type}-${item.name}-${i}`}
                          className={`flex items-start gap-2 rounded border px-2 py-1.5 ${styles.bg}`}
                          data-testid={`accuracy-item-${item.type}-${item.name}`}
                        >
                          <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${styles.text}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-semibold text-foreground truncate">
                                {item.name}
                              </span>
                              <span className={`text-[9px] font-mono uppercase ${styles.text}`}>
                                {item.status}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="text-[10px] font-mono text-muted-foreground mt-0.5 leading-snug">
                                {item.notes}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <div className="bg-background/40 rounded border border-border/40 p-3">
              <div className="text-[10px] font-mono font-bold text-foreground uppercase tracking-widest mb-1.5">
                Repair history
              </div>
              <ul className="space-y-1.5">
                {history.map((h, i) => (
                  <li key={i} className="text-[10px] font-mono text-muted-foreground">
                    <span className="text-amber-400">#{i + 1}</span>{" "}
                    Regenerated {h.targets.length} file{h.targets.length === 1 ? "" : "s"}:{" "}
                    <span className="text-foreground">{h.targets.join(", ")}</span>
                    {" — "}
                    <span className="text-muted-foreground">
                      score {h.before.overallScore} → <span className="text-foreground">{h.after.overallScore}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
