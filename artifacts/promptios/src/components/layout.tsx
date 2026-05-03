import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Terminal, LayoutDashboard, Plus, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const items = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects/new", label: "New project", icon: Plus },
  ];
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-200 active:scale-[0.98] ${
              active
                ? "bg-secondary/80 text-foreground"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
            )}
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-border px-4 shrink-0">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 transition-opacity hover:opacity-80 active:scale-[0.98]"
        >
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Terminal className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">
            prompt<span className="text-primary">iOS</span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground/60">
          Workspace
        </div>
        <NavLinks onNavigate={onNavigate} />
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="tabular-nums">engine v1.0 — online</span>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dark flex min-h-[100dvh] bg-background font-sans text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <SidebarBody />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 active:scale-[0.98] transition-transform">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Terminal className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">
            prompt<span className="text-primary">iOS</span>
          </span>
        </Link>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition-all active:scale-95 hover:bg-secondary/70"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-r border-border bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main */}
      <main className="relative flex flex-1 flex-col overflow-hidden pt-14 md:pt-0">
        {/* Subtle dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative z-10 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
