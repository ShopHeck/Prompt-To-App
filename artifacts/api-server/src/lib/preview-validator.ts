// Runtime playability gate for generated live previews.
//
// The syntax check (vm.Script) only catches parse errors. A preview whose
// script crashes at load, whose handlers throw when invoked, or which touches
// localStorage (throws in sandboxed iframes and Safari private browsing)
// renders fine but registers zero clicks — the exact "dead preview" failure.
// This module loads the HTML in jsdom, instruments it, clicks its controls,
// and reports concrete defects that the repair pass can act on.

import { JSDOM, VirtualConsole } from "jsdom";

export interface PreviewValidation {
  ok: boolean;
  /** Uncaught errors thrown while the document loaded/executed. */
  loadErrors: string[];
  /** click/pointer/touch listeners registered + inline onclick attributes. */
  handlerCount: number;
  /** Clickable elements found in the document. */
  clickableCount: number;
  /** Clicks that threw an uncaught error. */
  throwingClicks: number;
  /** Clicks that visibly mutated the DOM. */
  mutatingClicks: number;
  /** Human-readable summary used as repair feedback. */
  details: string;
}

const CLICK_EVENTS = new Set(["click", "pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup"]);
const MAX_CLICKS = 15;

/** A 2D-context stand-in so canvas-based games don't false-positive (jsdom has no canvas). */
function makeCanvasContextStub(): unknown {
  const stub: Record<string | symbol, unknown> = {};
  return new Proxy(stub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // measureText and friends must return something object-ish; plain
      // method calls return the proxy so chained calls don't explode.
      return (..._args: unknown[]) => ({ width: 0, data: new Uint8ClampedArray(4) });
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function formatError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function validatePreviewInteractivity(html: string): PreviewValidation {
  const loadErrors: string[] = [];
  let handlerCount = 0;
  // jsdom lazily registers internal window listeners (mousedown/click/...)
  // when the first click is dispatched — only count while the page loads.
  let countingHandlers = true;

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err: Error) => {
    const msg = err.message ?? String(err);
    // External resources (Tailwind CDN, fonts) are not fetched in jsdom —
    // those load failures are expected and not script defects.
    if (/resource|Could not load/i.test(msg)) return;
    loadErrors.push(msg.split("\n")[0]);
  });

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        // Count interactivity wiring as it happens.
        const origAdd = window.EventTarget.prototype.addEventListener;
        window.EventTarget.prototype.addEventListener = function (type: string, ...rest: unknown[]) {
          if (countingHandlers && CLICK_EVENTS.has(type)) handlerCount++;
          return (origAdd as (...a: unknown[]) => unknown).call(this, type, ...rest);
        };

        // Mirror the sandboxed iframe (opaque origin): storage access throws.
        // Previews must keep state in JS variables — touching storage in a
        // real sandboxed/private-mode browser kills the whole script.
        const throwSecurity = () => {
          throw new window.DOMException(
            "Storage is disabled inside the sandboxed preview iframe.",
            "SecurityError",
          );
        };
        Object.defineProperty(window, "localStorage", { get: throwSecurity });
        Object.defineProperty(window, "sessionStorage", { get: throwSecurity });

        // jsdom has no canvas implementation — return a tolerant stub so
        // canvas-based previews are testable instead of false failures.
        window.HTMLCanvasElement.prototype.getContext = (() =>
          makeCanvasContextStub()) as typeof window.HTMLCanvasElement.prototype.getContext;

        // Common browser APIs jsdom lacks; absorb rather than crash.
        (window as unknown as Record<string, unknown>).AudioContext = class {
          createOscillator() { return makeCanvasContextStub(); }
          createGain() { return makeCanvasContextStub(); }
          get destination() { return {}; }
          get currentTime() { return 0; }
          resume() { return Promise.resolve(); }
          close() { return Promise.resolve(); }
        };
        (window as unknown as Record<string, unknown>).webkitAudioContext =
          (window as unknown as Record<string, unknown>).AudioContext;
        window.navigator.vibrate = () => true;
        window.HTMLElement.prototype.scrollIntoView = () => {};

        window.addEventListener("error", (event) => {
          loadErrors.push(formatError((event as unknown as { error?: unknown; message?: string }).error ?? event.message));
        });
      },
    });
  } catch (err) {
    return {
      ok: false,
      loadErrors: [formatError(err)],
      handlerCount: 0,
      clickableCount: 0,
      throwingClicks: 0,
      mutatingClicks: 0,
      details: `The document failed to parse/execute entirely: ${formatError(err)}`,
    };
  }

  try {
    const { document } = dom.window;

    countingHandlers = false;
    const inlineHandlers = document.querySelectorAll("[onclick]").length;
    handlerCount += inlineHandlers;

    const clickables = Array.from(
      document.querySelectorAll<HTMLElement>("button, [onclick], [data-action], [role='button'], a, .tab, [data-screen] li"),
    ).slice(0, MAX_CLICKS);

    // Everything appended to loadErrors past this point happened during a
    // click, not at load time.
    const loadPhaseErrorCount = loadErrors.length;

    let throwingClicks = 0;
    let mutatingClicks = 0;
    const clickErrors: string[] = [];

    for (const el of clickables) {
      const before = document.body.innerHTML;
      const errorsBefore = loadErrors.length;
      try {
        el.click();
      } catch (err) {
        throwingClicks++;
        if (clickErrors.length < 3) clickErrors.push(formatError(err));
        continue;
      }
      // Uncaught errors inside listeners surface via the window error event.
      if (loadErrors.length > errorsBefore) {
        throwingClicks++;
        if (clickErrors.length < 3) clickErrors.push(loadErrors[loadErrors.length - 1]);
      }
      if (document.body.innerHTML !== before) mutatingClicks++;
    }

    // Restore loadErrors to load-time-only entries.
    loadErrors.splice(loadPhaseErrorCount);

    const problems: string[] = [];
    if (loadErrors.length > 0) {
      problems.push(`Uncaught error(s) while the script loaded (every handler defined after the crash point is dead): ${loadErrors.slice(0, 3).join(" | ")}`);
    }
    if (handlerCount === 0) {
      problems.push("ZERO click/tap handlers are wired (no addEventListener('click'|'pointerdown'|...) calls ran and no [onclick] attributes exist) — nothing in the preview is tappable.");
    }
    if (clickables.length > 0 && throwingClicks >= clickables.length) {
      problems.push(`Every tested click threw an uncaught error: ${clickErrors.slice(0, 3).join(" | ")}`);
    } else if (throwingClicks > 0) {
      problems.push(`${throwingClicks}/${clickables.length} tested clicks threw: ${clickErrors.slice(0, 3).join(" | ")}`);
    }

    const ok =
      loadErrors.length === 0 &&
      handlerCount > 0 &&
      (clickables.length === 0 || throwingClicks < clickables.length);

    return {
      ok,
      loadErrors,
      handlerCount,
      clickableCount: clickables.length,
      throwingClicks,
      mutatingClicks,
      details: problems.length > 0
        ? problems.join("\n")
        : `Interactive: ${handlerCount} handlers, ${mutatingClicks}/${clickables.length} clicks mutated the DOM.`,
    };
  } finally {
    // Stop any setInterval game loops the preview started.
    dom.window.close();
  }
}
