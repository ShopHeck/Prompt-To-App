import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";

const CATEGORY_COLORS: Record<string, string> = {
  Gaming: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Productivity: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Health: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Finance: "bg-green-500/10 text-green-400 border-green-500/20",
  Utility: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Social: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  Education: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  Lifestyle: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

export default function TemplatesPage() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

  const templates = data?.templates ?? [];
  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 md:py-14 animate-in fade-in duration-500">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to workspace
        </Link>

        <header className="mt-6 mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Prompt templates
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Start from a template
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Browse curated prompts across categories. Pick one to jumpstart your project
            with a proven app concept.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-12">
            {categories.map((category) => (
              <section key={category}>
                <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {templates
                    .filter((t) => t.category === category)
                    .map((template) => {
                      const colorCls =
                        CATEGORY_COLORS[category] ??
                        "bg-secondary/40 text-muted-foreground border-border/50";
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            const params = new URLSearchParams({
                              template: template.id,
                              prompt: template.prompt,
                              name: template.name,
                            });
                            setLocation(`/projects/new?${params.toString()}`);
                          }}
                          className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-5 text-left transition-all hover:bg-card/70 hover:border-border active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{template.icon}</span>
                            <h3 className="font-medium text-sm">{template.name}</h3>
                          </div>
                          <span
                            className={`inline-flex self-start items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${colorCls}`}
                          >
                            {category}
                          </span>
                          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                            {template.prompt}
                          </p>
                          <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                            Use template <ArrowRight className="h-3 w-3" />
                          </div>
                        </button>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
