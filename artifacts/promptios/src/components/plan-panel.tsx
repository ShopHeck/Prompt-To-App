import { Layers, Database, Navigation, Package, ChevronDown, ChevronRight, PencilLine, Trash2, Plus } from "lucide-react";

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

export interface PlanPanelProps {
  plan: ArchitecturePlan | null;
  isStreaming?: boolean;
  partialPlan?: PartialPlan;
  collapsed: boolean;
  onToggle: () => void;
  editable?: boolean;
  editedPlan?: ArchitecturePlan | null;
  onEditedPlanChange?: (plan: ArchitecturePlan) => void;
}

const EMPTY_PARTIAL: PartialPlan = { screens: [], models: [], navigation: "" };

export function PlanPanel({
  plan,
  isStreaming = false,
  partialPlan = EMPTY_PARTIAL,
  collapsed,
  onToggle,
  editable,
  editedPlan,
  onEditedPlanChange,
}: PlanPanelProps) {
  if (!plan && !isStreaming) return null;

  const displayScreens = plan
    ? plan.screens.map(s => ({ name: s.name, detail: s.purpose }))
    : partialPlan.screens.map(s => ({ name: s, detail: "" }));

  const displayModels = plan
    ? plan.models.map(m => ({ name: m.name, detail: m.fields.slice(0, 3).join(", ") + (m.fields.length > 3 ? "..." : "") }))
    : partialPlan.models.map(m => ({ name: m, detail: "" }));

  const displayNavigation = plan ? plan.navigation : partialPlan.navigation;
  const hasPartialData = partialPlan.screens.length > 0 || partialPlan.models.length > 0 || partialPlan.navigation.length > 0;

  const activePlan = editable ? (editedPlan ?? plan) : plan;

  const updateScreen = (i: number, field: "name" | "purpose", value: string) => {
    if (!activePlan || !onEditedPlanChange) return;
    const screens = activePlan.screens.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    onEditedPlanChange({ ...activePlan, screens });
  };
  const removeScreen = (i: number) => {
    if (!activePlan || !onEditedPlanChange) return;
    onEditedPlanChange({ ...activePlan, screens: activePlan.screens.filter((_, idx) => idx !== i) });
  };
  const addScreen = () => {
    if (!activePlan || !onEditedPlanChange) return;
    onEditedPlanChange({ ...activePlan, screens: [...activePlan.screens, { name: "NewScreen", purpose: "Describe this screen" }] });
  };
  const updateModel = (i: number, value: string) => {
    if (!activePlan || !onEditedPlanChange) return;
    const models = activePlan.models.map((m, idx) => idx === i ? { ...m, name: value } : m);
    onEditedPlanChange({ ...activePlan, models });
  };
  const removeModel = (i: number) => {
    if (!activePlan || !onEditedPlanChange) return;
    onEditedPlanChange({ ...activePlan, models: activePlan.models.filter((_, idx) => idx !== i) });
  };
  const addModel = () => {
    if (!activePlan || !onEditedPlanChange) return;
    onEditedPlanChange({ ...activePlan, models: [...activePlan.models, { name: "NewModel", fields: [] }] });
  };
  const updateNavigation = (value: string) => {
    if (!activePlan || !onEditedPlanChange) return;
    onEditedPlanChange({ ...activePlan, navigation: value });
  };

  return (
    <div className={`border-b border-border shrink-0 ${editable ? "bg-amber-950/20 border-amber-500/30" : "bg-card/60"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className={`h-3.5 w-3.5 shrink-0 ${editable ? "text-amber-400" : "text-primary"}`} />
          <span className="text-xs font-mono font-bold text-foreground uppercase tracking-widest">
            Architecture Plan
          </span>
          {isStreaming && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block animate-ping"></span>
              Planning...
            </span>
          )}
          {editable && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <PencilLine className="h-2.5 w-2.5" />
              Review &amp; Edit
            </span>
          )}
          {!isStreaming && !editable && plan && (
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
          {editable && activePlan ? (
            <div className="mt-1 space-y-3">
              <p className="text-[11px] font-mono text-amber-400/80">
                Review the plan below. Edit screen names, models, or navigation before building — then click <strong>Approve &amp; Build</strong>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-background/60 rounded border border-amber-500/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">Screens</span>
                    </div>
                    <button onClick={addScreen} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors">
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {activePlan.screens.map((s, i) => (
                      <li key={i} className="group">
                        <div className="flex items-center gap-1">
                          <input
                            value={s.name}
                            onChange={e => updateScreen(i, "name", e.target.value)}
                            className="flex-1 text-xs font-mono font-semibold bg-background/80 border border-border/50 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary/60"
                          />
                          <button onClick={() => removeScreen(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          value={s.purpose}
                          onChange={e => updateScreen(i, "purpose", e.target.value)}
                          className="mt-0.5 w-full text-[10px] font-mono bg-background/60 border border-border/30 rounded px-1.5 py-0.5 text-muted-foreground focus:outline-none focus:border-primary/40"
                          placeholder="Screen purpose..."
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-background/60 rounded border border-amber-500/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3 w-3 text-blue-400" />
                      <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">Models</span>
                    </div>
                    <button onClick={addModel} className="text-[10px] text-muted-foreground hover:text-blue-400 flex items-center gap-0.5 transition-colors">
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {activePlan.models.map((m, i) => (
                      <li key={i} className="group flex items-center gap-1">
                        <input
                          value={m.name}
                          onChange={e => updateModel(i, e.target.value)}
                          className="flex-1 text-xs font-mono font-semibold bg-background/80 border border-border/50 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-blue-400/60"
                        />
                        <button onClick={() => removeModel(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {activePlan.spmDependencies && activePlan.spmDependencies.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <div className="flex items-center gap-1 mb-1">
                        <Package className="h-3 w-3 text-orange-400" />
                        <span className="text-[10px] font-mono text-orange-400">SPM Deps</span>
                      </div>
                      {activePlan.spmDependencies.map((d, i) => (
                        <span key={i} className="text-[10px] font-mono text-muted-foreground block truncate">{d.packageName}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-background/60 rounded border border-amber-500/20 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Navigation className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest">Navigation</span>
                  </div>
                  <textarea
                    value={activePlan.navigation}
                    onChange={e => updateNavigation(e.target.value)}
                    rows={4}
                    className="w-full text-xs font-mono bg-background/80 border border-border/50 rounded px-1.5 py-1 text-muted-foreground focus:outline-none focus:border-green-400/60 resize-none leading-relaxed"
                    placeholder="Describe the navigation flow..."
                  />
                </div>
              </div>
            </div>
          ) : (plan || hasPartialData) ? (
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
