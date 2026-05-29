import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="dark flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 font-sans text-foreground">
      <div className="relative text-center">
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-primary/5 blur-[80px]"
        />

        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
              <Terminal className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight">
              prompt<span className="text-primary">iOS</span>
            </span>
          </div>

          <p className="font-mono text-7xl font-bold tracking-tight text-muted-foreground/20 sm:text-9xl">
            404
          </p>
          <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
            Page not found
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button className="gap-2">
                Go to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
