import { Layout } from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Sparkles, Zap, Crown, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import * as api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const PLAN_ICONS: Record<string, typeof Sparkles> = {
  free: Sparkles,
  pro: Zap,
  studio: Crown,
};

const PLAN_ORDER = ["free", "pro", "studio"];

export default function PricingPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: api.getPlans,
  });

  const checkout = useMutation({
    mutationFn: (plan: string) => api.createCheckout(plan),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => {
      toast({
        title: "Checkout failed",
        description: err instanceof api.ApiError ? err.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const portalMut = useMutation({
    mutationFn: () => api.createPortalSession(),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => {
      toast({
        title: "Unable to open billing portal",
        description: err instanceof api.ApiError ? err.message : "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const plans = data?.plans ?? {};
  const currentPlan = user?.plan ?? "free";

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 md:py-14 animate-in fade-in duration-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to workspace
        </Link>

        <header className="mt-6 mb-12 text-center space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Choose your plan
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
            Start for free with 5 generations per month. Upgrade for more power,
            refinement chat, web generation, and quality scoring.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {PLAN_ORDER.map((planKey) => {
              const plan = plans[planKey];
              if (!plan) return null;
              const Icon = PLAN_ICONS[planKey] ?? Sparkles;
              const isCurrent = currentPlan === planKey;
              const isPopular = planKey === "pro";

              return (
                <div
                  key={planKey}
                  className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                    isPopular
                      ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/5"
                      : "border-border/70 bg-card/40"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-primary-foreground">
                        Most popular
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isPopular ? "bg-primary/15" : "bg-secondary/60"
                    }`}>
                      <Icon className={`h-4 w-4 ${isPopular ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                  </div>

                  <div className="mb-6">
                    <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                  </div>

                  <ul className="flex-1 space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 shrink-0 ${isPopular ? "text-primary" : "text-emerald-400"}`} />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full h-10 rounded-lg">
                      Current plan
                    </Button>
                  ) : planKey === "free" ? (
                    <Button variant="outline" disabled className="w-full h-10 rounded-lg">
                      Free forever
                    </Button>
                  ) : !isAuthenticated ? (
                    <Link href="/auth">
                      <Button
                        variant={isPopular ? "default" : "outline"}
                        className="w-full h-10 rounded-lg font-medium"
                      >
                        Sign up to upgrade
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => checkout.mutate(planKey)}
                      disabled={checkout.isPending}
                      className="w-full h-10 rounded-lg font-medium"
                    >
                      {checkout.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Upgrade to {plan.name}</>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAuthenticated && currentPlan !== "free" && (
          <div className="mt-8 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => portalMut.mutate()}
              disabled={portalMut.isPending}
              className="gap-1.5 text-muted-foreground"
            >
              {portalMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Manage subscription
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
