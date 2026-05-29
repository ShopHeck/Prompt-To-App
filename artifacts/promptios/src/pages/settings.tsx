import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, User, CreditCard, Shield, Loader2,
  ExternalLink, Check, Zap, Crown, Sparkles,
} from "lucide-react";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth";
import * as api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Required"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordValues = z.infer<typeof passwordSchema>;

const PLAN_ICONS: Record<string, typeof Sparkles> = {
  free: Sparkles,
  pro: Zap,
  studio: Crown,
};

export default function SettingsPage() {
  const { user, quota, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [passwordChanged, setPasswordChanged] = useState(false);

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePwMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.changePassword(data),
    onSuccess: () => {
      setPasswordChanged(true);
      form.reset();
      toast({ title: "Password updated", description: "Your password has been changed." });
    },
    onError: (err) => {
      toast({
        title: "Failed to change password",
        description: err instanceof api.ApiError ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMut = useMutation({
    mutationFn: () => api.createPortalSession(),
    onSuccess: (res) => { window.location.href = res.url; },
    onError: (err) => {
      toast({
        title: "Unable to open billing portal",
        description: err instanceof api.ApiError ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers"],
    queryFn: api.getProviders,
  });

  if (!isLoading && !isAuthenticated) {
    return <Redirect to="/auth" />;
  }

  if (isLoading || !user) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const PlanIcon = PLAN_ICONS[user.plan] ?? Sparkles;
  const usagePercent = quota ? Math.min(100, (quota.used / (quota.limit === Infinity ? quota.used + 1 : quota.limit)) * 100) : 0;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:py-14 animate-in fade-in duration-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to workspace
        </Link>

        <header className="mt-6 mb-10 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account, billing, and security.
          </p>
        </header>

        <Tabs defaultValue="account" className="space-y-8">
          <TabsList className="bg-secondary/30">
            <TabsTrigger value="account" className="gap-1.5">
              <User className="h-3.5 w-3.5" />
              Account
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Account */}
          <TabsContent value="account" className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-4">
              <h2 className="font-semibold">Profile</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Email
                  </label>
                  <p className="mt-1 text-sm">{user.email}</p>
                </div>
                <div>
                  <label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Display name
                  </label>
                  <p className="mt-1 text-sm">{user.displayName || "Not set"}</p>
                </div>
              </div>
            </div>

            {/* AI Providers */}
            <div className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-4">
              <h2 className="font-semibold">AI Providers</h2>
              <div className="space-y-2">
                {providers?.providers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3">
                    <div className={`h-2 w-2 rounded-full ${p.available ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className={`ml-auto text-xs font-mono ${p.available ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {p.available ? "Active" : "Not configured"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Billing */}
          <TabsContent value="billing" className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <PlanIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold capitalize">{user.plan} Plan</h2>
                    <p className="text-xs text-muted-foreground">Current subscription</p>
                  </div>
                </div>
                <Link href="/pricing">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    {user.plan === "free" ? "Upgrade" : "Change plan"}
                  </Button>
                </Link>
              </div>

              {quota && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly usage</span>
                    <span className="font-mono tabular-nums">
                      {quota.used} / {quota.limit === Infinity ? "Unlimited" : quota.limit}
                    </span>
                  </div>
                  {quota.limit !== Infinity && (
                    <Progress value={usagePercent} className="h-2" />
                  )}
                </div>
              )}

              {user.plan !== "free" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => portalMut.mutate()}
                  disabled={portalMut.isPending}
                  className="gap-1.5"
                >
                  {portalMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Manage subscription in Stripe
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-6">
              <h2 className="font-semibold">Change password</h2>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((d) => changePwMut.mutate(d))}
                  className="space-y-4 max-w-md"
                >
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          Current password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            className="h-10 rounded-lg border-border/80 bg-background/50"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          New password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            className="h-10 rounded-lg border-border/80 bg-background/50"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          Confirm new password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            className="h-10 rounded-lg border-border/80 bg-background/50"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={changePwMut.isPending}
                    className="gap-2"
                  >
                    {changePwMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : passwordChanged ? (
                      <>
                        <Check className="h-4 w-4" />
                        Updated
                      </>
                    ) : (
                      "Update password"
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
