import { Layout } from "@/components/layout";
import { useGetRecentProjects, useGetProjectStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Clock, ArrowUpRight, Activity, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    generating: "bg-primary/10 text-primary ring-primary/25 animate-pulse",
    error: "bg-destructive/15 text-destructive ring-destructive/25",
    pending: "bg-secondary text-muted-foreground ring-border",
    awaiting_approval: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
    awaiting_clarification: "bg-blue-500/10 text-blue-300 ring-blue-500/25",
  };
  const cls = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ring-inset ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: isLoadingStats } = useGetProjectStats();
  const { data: recentProjects, isLoading: isLoadingRecent } = useGetRecentProjects();

  const filesGenerated = stats?.totalFilesGenerated ?? 0;
  const totalProjects = stats?.totalProjects ?? 0;
  const completed = stats?.completedProjects ?? 0;
  const swiftui = stats?.frameworkBreakdown?.swiftui ?? 0;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 md:py-12 animate-in fade-in duration-500">
        {/* Header */}
        <header className="mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Live workspace
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-[2.5rem] md:leading-[1.05]">
              Welcome back. <span className="text-muted-foreground">Build a new iOS app, or pick up where you left off.</span>
            </h1>
          </div>
          <Link href="/projects/new" className="shrink-0">
            <Button
              data-testid="btn-new-project"
              className="group h-11 gap-2 rounded-lg px-5 font-medium transition-all active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" strokeWidth={2.25} />
              New project
            </Button>
          </Link>
        </header>

        {/* Asymmetric stats — hero stat + 3 stacked secondary */}
        <section className="mb-12 grid gap-4 md:mb-16 md:grid-cols-3 md:gap-6">
          {/* Hero stat */}
          <div className="md:col-span-2 relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-6 md:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" strokeWidth={2} />
                Files generated
              </div>
              <div className="mt-4 flex items-baseline gap-3">
                {isLoadingStats ? (
                  <Skeleton className="h-14 w-32" />
                ) : (
                  <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums md:text-7xl">
                    {filesGenerated.toLocaleString()}
                  </span>
                )}
                <span className="text-sm font-mono text-muted-foreground">
                  Swift / plist / md
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Every screen, model, and config compiled across {totalProjects.toLocaleString()} project{totalProjects === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          {/* Side metric stack — borders only, no boxed cards */}
          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-border/70 bg-card/20 p-2 md:grid-cols-1 md:divide-y md:divide-border/60 md:gap-0 md:p-0">
            {[
              { label: "Projects", value: totalProjects, accent: "text-foreground" },
              { label: "Completed", value: completed, accent: "text-emerald-300" },
              { label: "SwiftUI apps", value: swiftui, accent: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-4 md:px-6 md:py-5">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </div>
                {isLoadingStats ? (
                  <Skeleton className="mt-2 h-7 w-12" />
                ) : (
                  <div className={`mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums md:text-3xl ${s.accent}`}>
                    {s.value.toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recent projects */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono uppercase tracking-widest text-[11px]">Recent projects</span>
            </h2>
          </div>

          {isLoadingRecent ? (
            <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/30">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-5">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3.5 w-72" />
                  </div>
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              ))}
            </div>
          ) : recentProjects?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/20 px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/50">
                <Activity className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
              </div>
              <p className="mt-4 text-base font-medium text-foreground">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe an iOS app and the engine will scaffold the source.
              </p>
              <Link href="/projects/new">
                <Button variant="outline" className="mt-6 h-9 gap-2 rounded-lg active:scale-[0.98]">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Start your first build
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/30">
              {recentProjects?.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/25 active:scale-[0.997]"
                    data-testid={`project-row-${project.id}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">{project.name}</span>
                        <span className="rounded-md bg-secondary/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {project.framework}
                        </span>
                        <StatusPill status={project.status} />
                      </div>
                      <p className="line-clamp-1 text-sm text-muted-foreground/90">{project.prompt}</p>
                      <div className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                        #{project.id} · updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                      </div>
                    </div>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                      strokeWidth={1.75}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
