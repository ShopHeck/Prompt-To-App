import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TourStep {
  id: string;
  selector?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to promptiOS",
    body: "Quick 60-second tour of how to turn a prompt into a downloadable Xcode project. You can replay this any time from the Help menu.",
    placement: "center",
  },
  {
    id: "new-project",
    selector: '[data-tour="new-project"]',
    title: "Start a new project",
    body: "Click here to begin. You'll describe your iOS app in plain language, pick a framework, and the engine will plan and synthesize the code.",
    placement: "bottom",
  },
  {
    id: "prompt",
    selector: '[data-tour="prompt"]',
    title: "Describe your app",
    body: "The more specific you are about screens, data, and visual style, the better the result. Mention key flows and any persistence.",
    placement: "top",
  },
  {
    id: "framework",
    selector: '[data-tour="framework"]',
    title: "Pick a framework",
    body: "SwiftUI is recommended for new apps. Choose UIKit if you need legacy compatibility.",
    placement: "top",
  },
  {
    id: "clarify",
    selector: '[data-tour="clarify"]',
    title: "Answer clarifying questions",
    body: "If your prompt is broad, the engine asks a few one-line questions. Answer them or skip to take its best guess.",
    placement: "bottom",
  },
  {
    id: "plan",
    selector: '[data-tour="plan"]',
    title: "Review the plan",
    body: "Before any code is written you'll see screens, models, and navigation. Edit anything, then click Approve & build.",
    placement: "bottom",
  },
  {
    id: "accuracy",
    selector: '[data-tour="accuracy"]',
    title: "Check the accuracy report",
    body: "After building, the engine grades the output against the plan and auto-repairs files that don't match.",
    placement: "bottom",
  },
  {
    id: "download",
    selector: '[data-tour="download"]',
    title: "Download as Xcode-ready zip",
    body: "When you're happy, download the project and open it in Xcode.",
    placement: "bottom",
  },
  {
    id: "guide",
    selector: '[data-tour="guide"]',
    title: "Ship to the App Store",
    body: "Open the in-app guide for a step-by-step walkthrough — signing, archiving, TestFlight, and App Store Connect submission.",
    placement: "right",
  },
];

const STORAGE_KEY = "promptios.tour.seen.v1";

interface TourContextValue {
  start: () => void;
  isActive: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const stepRefreshRef = useRef(0);

  const start = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const finish = useCallback(() => {
    setIsActive(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }, []);

  // Auto-start on first visit
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const t = window.setTimeout(() => setIsActive(true), 600);
        return () => window.clearTimeout(t);
      }
    } catch {}
    return undefined;
  }, []);

  // If a step's target isn't on the current page, keep the step active but
  // render the popover centered (handled in TourOverlay via missing rect).
  // Poll for the element to reappear when the user navigates to its page.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[stepIndex];
    if (!step?.selector) return;
    const id = window.setInterval(() => {
      forceTick(t => t + 1);
    }, 500);
    return () => window.clearInterval(id);
  }, [isActive, stepIndex]);

  // Compute rect for current step's target
  useLayoutEffect(() => {
    if (!isActive) {
      setRect(null);
      return;
    }
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;
    if (!step.selector) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(step.selector!) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      // Bring into view
      const r = el.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!inView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const r2 = el.getBoundingClientRect();
      setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
    };
    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const id = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(id);
    };
  }, [isActive, stepIndex, stepRefreshRef.current]);

  const next = () => {
    if (stepIndex >= TOUR_STEPS.length - 1) finish();
    else setStepIndex(i => i + 1);
  };
  const back = () => setStepIndex(i => Math.max(0, i - 1));

  const value = useMemo(() => ({ start, isActive }), [start, isActive]);

  const step = TOUR_STEPS[stepIndex];

  return (
    <TourContext.Provider value={value}>
      {children}
      {isActive && step && typeof document !== "undefined" &&
        createPortal(
          <TourOverlay
            step={step}
            stepIndex={stepIndex}
            total={TOUR_STEPS.length}
            rect={rect}
            onNext={next}
            onBack={back}
            onSkip={finish}
          />,
          document.body,
        )}
    </TourContext.Provider>
  );
}

const PAD = 8;

function TourOverlay({
  step,
  stepIndex,
  total,
  rect,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  rect: TargetRect | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;
  const isCenter = !rect || step.placement === "center";
  const targetMissing = !!step.selector && !rect;

  // Compute popover position
  let popStyle: React.CSSProperties;
  if (isCenter) {
    popStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: "min(420px, calc(100vw - 32px))",
    };
  } else {
    const placement = step.placement ?? "bottom";
    const r = rect!;
    const popW = Math.min(360, window.innerWidth - 32);
    const popH = 180;
    let top = r.top + r.height + PAD + 8;
    let left = r.left + r.width / 2 - popW / 2;
    if (placement === "top") {
      top = r.top - popH - PAD - 8;
    } else if (placement === "left") {
      top = r.top + r.height / 2 - popH / 2;
      left = r.left - popW - PAD - 8;
    } else if (placement === "right") {
      top = r.top + r.height / 2 - popH / 2;
      left = r.left + r.width + PAD + 8;
    }
    // Clamp into viewport
    top = Math.max(16, Math.min(top, window.innerHeight - popH - 16));
    left = Math.max(16, Math.min(left, window.innerWidth - popW - 16));
    popStyle = { top, left, width: popW };
  }

  return (
    <div className="fixed inset-0 z-[100]" data-testid="tour-overlay">
      {/* Dim overlay with cutout */}
      <svg className="absolute inset-0 h-full w-full pointer-events-auto" onClick={onSkip}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && !isCenter && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight ring */}
      {rect && !isCenter && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-primary/80 shadow-[0_0_0_6px_rgba(132,90,223,0.18)] transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}

      {/* Popover card */}
      <div
        role="dialog"
        aria-label={step.title}
        className="absolute pointer-events-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        style={popStyle}
        data-testid={`tour-step-${step.id}`}
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Step {stepIndex + 1} / {total}
              </span>
              <button
                onClick={onSkip}
                aria-label="Skip tour"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="tour-skip"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <h3 className="mt-1.5 text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
            {targetMissing && (
              <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
                This step lives on another page. Navigate there and the highlight will appear, or use Next to skip.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              className="h-8 font-mono text-[11px]"
              data-testid="tour-skip-btn"
            >
              Skip
            </Button>
            {!isFirst && (
              <Button
                size="sm"
                variant="outline"
                onClick={onBack}
                className="h-8 gap-1 font-mono text-[11px]"
                data-testid="tour-back"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={onNext}
              className="h-8 gap-1 font-mono text-[11px]"
              data-testid="tour-next"
            >
              {isLast ? "Done" : "Next"}
              {!isLast && <ArrowRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
