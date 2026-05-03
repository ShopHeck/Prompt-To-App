import { Smartphone, Loader2 } from "lucide-react";

interface PhonePreviewProps {
  src: string | null;
  isGenerating?: boolean;
  emptyHint?: string;
  reloadKey?: number;
}

export function PhonePreview({ src, isGenerating, emptyHint, reloadKey }: PhonePreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 md:p-8">
      <div className="relative shrink-0" style={{ width: 320, height: 660 }}>
        <div
          className="absolute inset-0 rounded-[44px] bg-zinc-950 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{ padding: 8 }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-black">
            <div className="pointer-events-none absolute left-1/2 top-1.5 z-20 h-[22px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
            {isGenerating ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="font-mono text-[11px] uppercase tracking-widest">Rendering preview…</p>
                <p className="px-6 text-[11px] text-muted-foreground/70">
                  Translating SwiftUI screens into a runnable web mockup.
                </p>
              </div>
            ) : src ? (
              <iframe
                key={reloadKey ?? 0}
                src={src}
                title="App preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
                referrerPolicy="no-referrer"
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                <Smartphone className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                <p className="font-mono text-[11px] uppercase tracking-widest">No preview yet</p>
                <p className="text-[11px] text-muted-foreground/70">
                  {emptyHint ?? "The live preview is rendered after the first successful build."}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-1 top-32 h-16 w-[3px] rounded-l-full bg-zinc-800" />
        <div className="pointer-events-none absolute -left-1 top-24 h-10 w-[3px] rounded-r-full bg-zinc-800" />
        <div className="pointer-events-none absolute -left-1 top-40 h-16 w-[3px] rounded-r-full bg-zinc-800" />
      </div>
    </div>
  );
}
