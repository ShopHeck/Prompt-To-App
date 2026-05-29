import { Link } from "wouter";
import {
  Terminal, ArrowRight, Sparkles, Cpu, Shield, Zap,
  Code2, Eye, Download, MessageSquare, CheckCircle2,
  ChevronRight, Globe, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";

function Navbar() {
  const { isAuthenticated } = useAuth();
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Terminal className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">
            prompt<span className="text-primary">iOS</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <a
            href="#features"
            className="hidden sm:inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hidden sm:inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#pricing"
            className="hidden sm:inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="sm" className="gap-1.5">
                Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/auth">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/auth">
                <Button size="sm" className="gap-1.5">
                  Get started <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          AI-powered app generation
        </div>

        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Describe your app.{" "}
          <span className="bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
            Ship it.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          Turn natural language prompts into production-ready iOS and web apps.
          AI architects your code, validates it, and packages it for the App Store — in minutes.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/projects/new">
            <Button size="lg" className="group h-12 gap-2 rounded-xl px-8 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30">
              <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
              Start building — free
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button variant="outline" size="lg" className="h-12 gap-2 rounded-xl px-8 text-base">
              See how it works
              <ChevronRight className="h-4 w-4" />
            </Button>
          </a>
        </div>

        {/* Social proof */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Xcode-ready projects
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Multi-provider AI
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            No credit card required
          </span>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Cpu,
    title: "Multi-provider AI",
    description: "Choose from OpenAI, Gemini, or Claude. Automatic fallback ensures generation never fails.",
  },
  {
    icon: Layers,
    title: "6-phase pipeline",
    description: "Clarify → Plan → Approve → Build → Validate → Repair. Every step is streamed in real-time.",
  },
  {
    icon: Code2,
    title: "Production Swift code",
    description: "Modern SwiftUI with @Observable, async/await, and 80+ quality standards enforced by AI.",
  },
  {
    icon: Globe,
    title: "Web apps too",
    description: "Generate React + Tailwind web apps with the same AI pipeline. Full-stack from one prompt.",
  },
  {
    icon: Eye,
    title: "Live preview",
    description: "See an interactive HTML mockup of your app before downloading — iterate visually.",
  },
  {
    icon: Shield,
    title: "Enterprise security",
    description: "Helmet CSP, CORS lockdown, CSRF protection, rate limiting, and encrypted sessions.",
  },
  {
    icon: MessageSquare,
    title: "AI refinement chat",
    description: "Iterate on generated code with natural language. \"Make the header blue\" — done.",
  },
  {
    icon: Download,
    title: "One-click export",
    description: "Download Xcode-ready .zip with project.yml, Info.plist, asset catalogs, and App Store guide.",
  },
];

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            Features
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to ship
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            From prompt to App Store. Every tool, validation, and safety net — built in.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-border/50 bg-card/30 p-6 transition-all duration-300 hover:border-border hover:bg-card/60"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/15">
                <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { step: "01", title: "Describe", description: "Write what your app should do in plain English. The AI asks clarifying questions if needed." },
  { step: "02", title: "Architect", description: "AI generates an architecture plan — screens, models, navigation, dependencies. Review and approve." },
  { step: "03", title: "Generate", description: "Watch code stream in real-time. The AI builds every file with full SwiftUI or React implementation." },
  { step: "04", title: "Validate & Ship", description: "AI scores accuracy, auto-repairs issues, and packages everything into an Xcode-ready project." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28 border-t border-border/40">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            How it works
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            From idea to app in 4 steps
          </h2>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ step, title, description }) => (
            <div key={step} className="relative">
              <div className="mb-4 font-mono text-4xl font-bold text-primary/20">{step}</div>
              <h3 className="mb-2 font-semibold text-lg">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const { user, isAuthenticated } = useAuth();
  const currentPlan = user?.plan ?? "free";

  const plans = [
    {
      key: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      features: ["5 generations / month", "SwiftUI & UIKit", "Xcode export", "Live preview", "Community support"],
      cta: isAuthenticated ? "Current plan" : "Get started",
      href: isAuthenticated ? "/dashboard" : "/auth",
      highlighted: false,
    },
    {
      key: "pro",
      name: "Pro",
      price: "$29",
      period: "/ month",
      features: ["50 generations / month", "Everything in Free", "AI refinement chat", "Web app generation", "Quality scoring", "Priority support"],
      cta: currentPlan === "pro" ? "Current plan" : "Upgrade to Pro",
      href: "/pricing",
      highlighted: true,
    },
    {
      key: "studio",
      name: "Studio",
      price: "$99",
      period: "/ month",
      features: ["Unlimited generations", "Everything in Pro", "Premium components", "Priority queue", "Dedicated support"],
      cta: currentPlan === "studio" ? "Current plan" : "Upgrade to Studio",
      href: "/pricing",
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 border-t border-border/40">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
            Pricing
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Start free. Scale when ready.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            No credit card required. Upgrade anytime as your needs grow.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                plan.highlighted
                  ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/5"
                  : "border-border/50 bg-card/30"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-primary-foreground">
                    Most popular
                  </span>
                </div>
              )}
              <h3 className="mb-1 font-semibold text-lg">{plan.name}</h3>
              <div className="mb-6">
                <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
              </div>
              <ul className="flex-1 space-y-2.5 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-primary" : "text-emerald-400"}`} />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={plan.href}>
                <Button
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  disabled={isAuthenticated && currentPlan === plan.key}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 sm:flex-row sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Terminal className="h-3 w-3 text-primary" strokeWidth={2} />
          </div>
          <span className="font-mono text-xs font-semibold tracking-tight">
            prompt<span className="text-primary">iOS</span>
          </span>
        </div>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <Link href="/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
          <Link href="/templates" className="transition-colors hover:text-foreground">Templates</Link>
          <Link href="/guide/app-store" className="transition-colors hover:text-foreground">App Store Guide</Link>
        </div>
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} promptiOS
        </p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="dark min-h-[100dvh] bg-background font-sans text-foreground">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <PricingSection />

      {/* Final CTA */}
      <section className="py-20 sm:py-28 border-t border-border/40">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to build your next app?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Join developers who ship iOS and web apps 10x faster with AI-powered generation.
          </p>
          <div className="mt-8">
            <Link href="/projects/new">
              <Button size="lg" className="group h-12 gap-2 rounded-xl px-8 text-base font-semibold shadow-lg shadow-primary/20">
                <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />
                Start building for free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
