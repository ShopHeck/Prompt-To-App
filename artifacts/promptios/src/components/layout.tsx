import { Link, useLocation } from "wouter";
import { Terminal, LayoutDashboard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background dark text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2 text-primary">
            <Terminal className="h-5 w-5" />
            <span className="font-mono font-bold tracking-tight">prompt<span className="text-foreground">iOS</span></span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <Link href="/" className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === '/' ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href="/projects/new" className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === '/projects/new' ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        </div>

        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground font-mono">
            System: Online<br />
            Engine: iOS Gen v1.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" style={{ backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        <div className="flex-1 overflow-y-auto z-10 relative">
          {children}
        </div>
      </main>
    </div>
  );
}