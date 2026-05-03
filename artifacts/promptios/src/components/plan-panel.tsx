import { Layers, Database, Navigation, Package, ChevronDown, ChevronRight } from "lucide-react";

export interface SpmDependency {
  url: string;
  packageName: string;
  productNames: string[];
  version: string;
}

export interface ArchitecturePlan {
  screens: Array<{ name: string; purpose: string }>;
  models: Array<{ name: string; fields: string[] }>;
  navigation: string;
  spmDependencies: SpmDependency[];
  fileList: Array<{ filename: string; purpose: string }>;
}

export interface PartialPlan {
  screens: string[];
  models: string[];
  navigation: string;
}

export function parsePartialPlan(raw: string): PartialPlan {
  const screens: string[] = [];
  const models: string[] = [];
  let navigation = "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ArchitecturePlan;
      return {
        screens: parsed.screens?.map(s => s.name) ?? [],
        models: parsed.models?.map(m => m.name) ?? [],
        navigation: parsed.navigation ?? "",
      };
    }
  } catch (_) {}

  const screensSection = raw.match(/"screens"\s*:\s*\[([\s\S]*?)(?:\]\s*,|\]\s*}|$)/);
  if (screensSection) {
    for (const m of screensSection[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)) screens.push(m[1]);
  }

  const modelsSection = raw.match(/"models"\s*:\s*\[([\s\S]*?)(?:\]\s*,|\]\s*}|$)/);
  if (modelsSection) {
    for (const m of modelsSection[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)) models.push(m[1]);
  }

  const navMatch = raw.match(/"navigation"\s*:\s*"([^"]+)"/);
  if (navMatch) navigation = navMatch[1];

  return { screens, models, navigation };
}

interface PlanPanelProps {
  plan: ArchitecturePlan | null;
  isStreaming?: boolean;
  partialPlan?: PartialPlan;
  collapsed: boolean;
  onToggle: () => void;
}

const EMPTY_PARTIAL: PartialPlan = { screens: [], models: [], navigation: "" };

export function PlanPanel({ plan, isStreaming = false, partialPlan = EMPTY_PARTIAL, collapsed, onToggle }: PlanPanelProps) {
  if (!plan && !isStreaming) return null;

  const displayScreens = plan
    ? plan.screens.map(s => ({ name: s.name, detail: s.purpose }))
    : partialPlan.screens.map(s => ({ name: s, detail: "" }));

  const displayModels = plan
    ? plan.models.map(m => ({ name: m.name, detail: m.fields.slice(0, 3).join(", ") + (m.fields.length > 3 ? "..." : "") }))
    : partialPlan.models.map(m => ({ name: m, detail: "" }));

  const displayNavigation = plan ? plan.navigation : partialPlan.navigation;
  const hasPartialData = partialPlan.screens.length > 0 || partialPlan.models.length > 0 || partialPlan.navigation.length > 0;

  return (
    <div className="border-b border-border bg-card/60 shrink-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-mono font-bold text-foreground uppercase tracking-widest">
            Architecture Plan
          </span>
          {isStreaming && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block animate-ping"></span>
              Planning...
            </span>
          )}
          {!isStreaming && plan && (
            <span className="text-[10px] font-mono text-muted-foreground ml-1">
              {plan.screens.length} screens · {plan.models.length} models · {plan.fileList.length} files
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {(plan || hasPartialData) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="h-3 w-3 text-primary" />
                  <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">Screens</span>
                </div>
                <ul className="space-y-1">
                  {displayScreens.length > 0 ? displayScreens.map((s, i) => (
                    <li key={i} className="text-xs font-mono">
                      <span className="text-foreground font-semibold">{s.name}</span>
                      {s.detail && <span className="text-muted-foreground text-[10px] block">{s.detail}</span>}
                      {!s.detail && isStreaming && <div className="h-2 bg-muted/40 rounded animate-pulse w-4/5 mt-0.5" />}
                    </li>
                  )) : (
                    [1,2,3].map(i => <div key={i} className="h-3 bg-muted/60 rounded animate-pulse w-3/4 mb-2" />)
                  )}
                </ul>
              </div>

              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Database className="h-3 w-3 text-blue-400" />
                  <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">Models</span>
                </div>
                <ul className="space-y-1">
                  {displayModels.length > 0 ? displayModels.map((m, i) => (
                    <li key={i} className="text-xs font-mono">
                      <span className="text-foreground font-semibold">{m.name}</span>
                      {m.detail && <span className="text-muted-foreground text-[10px] block">{m.detail}</span>}
                      {!m.detail && isStreaming && <div className="h-2 bg-muted/40 rounded animate-pulse w-5/6 mt-0.5" />}
                    </li>
                  )) : (
                    [1,2].map(i => <div key={i} className="h-3 bg-muted/60 rounded animate-pulse w-2/3 mb-2" />)
                  )}
                </ul>
                {plan?.spmDependencies && plan.spmDependencies.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <div className="flex items-center gap-1 mb-1">
                      <Package className="h-3 w-3 text-orange-400" />
                      <span className="text-[10px] font-mono text-orange-400">SPM Deps</span>
                    </div>
                    {plan.spmDependencies.map((d, i) => (
                      <span key={i} className="text-[10px] font-mono text-muted-foreground block truncate">{d.packageName}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Navigation className="h-3 w-3 text-green-400" />
                  <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest">Navigation</span>
                </div>
                {displayNavigation ? (
                  <p className="text-xs font-mono text-muted-foreground leading-relaxed">{displayNavigation}</p>
                ) : (
                  <div className="space-y-1">
                    <div className="h-2 bg-muted/40 rounded animate-pulse w-full" />
                    <div className="h-2 bg-muted/40 rounded animate-pulse w-5/6" />
                    <div className="h-2 bg-muted/40 rounded animate-pulse w-4/6" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="h-3 w-3 text-primary" />
                  <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">Screens</span>
                </div>
                <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-3 bg-muted/60 rounded animate-pulse w-3/4"/>)}</div>
              </div>
              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Database className="h-3 w-3 text-blue-400" />
                  <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">Models</span>
                </div>
                <div className="space-y-2">{[1,2].map(i=><div key={i} className="h-3 bg-muted/60 rounded animate-pulse w-2/3"/>)}</div>
              </div>
              <div className="bg-background/60 rounded border border-border/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Navigation className="h-3 w-3 text-green-400" />
                  <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest">Navigation</span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 bg-muted/40 rounded animate-pulse w-full"/>
                  <div className="h-2 bg-muted/40 rounded animate-pulse w-5/6"/>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
