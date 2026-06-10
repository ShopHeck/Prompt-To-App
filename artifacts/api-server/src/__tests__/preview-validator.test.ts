import { describe, it, expect } from "vitest";
import { validatePreviewInteractivity } from "../lib/preview-validator";

const page = (body: string, script: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;width:390px;height:844px;">
${body}
<script>${script}</script>
</body></html>`;

describe("validatePreviewInteractivity", () => {
  it("passes a working delegated-listener preview", () => {
    const html = page(
      `<div id="score">0</div><button data-action="inc">Tap</button>`,
      `var score = 0;
       function handleAction(action) {
         if (action === 'inc') { score++; document.getElementById('score').textContent = String(score); }
       }
       document.addEventListener('click', function (e) {
         var el = e.target.closest('[data-action]');
         if (el) handleAction(el.dataset.action, el);
       });`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(true);
    expect(result.handlerCount).toBeGreaterThan(0);
    expect(result.mutatingClicks).toBeGreaterThan(0);
  });

  it("passes inline onclick handlers", () => {
    const html = page(
      `<div id="n">0</div><button onclick="bump()">Tap</button>`,
      `function bump() { var el = document.getElementById('n'); el.textContent = String(Number(el.textContent) + 1); }`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(true);
  });

  it("fails when the script crashes at load (handlers never attach)", () => {
    const html = page(
      `<button id="btn">Tap</button>`,
      `document.getElementById('does-not-exist').addEventListener('click', function(){});
       document.getElementById('btn').addEventListener('click', function(){});`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(false);
    expect(result.loadErrors.length).toBeGreaterThan(0);
    expect(result.details).toContain("loaded");
  });

  it("fails when zero handlers are wired", () => {
    const html = page(`<button>Looks tappable</button>`, `var state = { screen: 'home' };`);
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(false);
    expect(result.handlerCount).toBe(0);
    expect(result.details).toContain("ZERO");
  });

  it("fails when localStorage access kills the script (sandboxed iframe behavior)", () => {
    const html = page(
      `<button data-action="x">Tap</button>`,
      `var saved = localStorage.getItem('state');
       document.addEventListener('click', function () {});`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(false);
    expect(result.loadErrors.join(" ")).toMatch(/Storage|SecurityError/i);
  });

  it("fails when every click throws", () => {
    const html = page(
      `<button data-action="a">A</button><button data-action="b">B</button>`,
      `document.addEventListener('click', function (e) {
         var el = e.target.closest('[data-action]');
         if (el) { missingFunction(el.dataset.action); }
       });`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(false);
    expect(result.throwingClicks).toBeGreaterThan(0);
  });

  it("tolerates canvas-based games via the context stub", () => {
    const html = page(
      `<canvas id="game" width="390" height="600"></canvas><button data-action="shoot">Shoot</button><div id="s">0</div>`,
      `var ctx = document.getElementById('game').getContext('2d');
       ctx.fillStyle = '#000';
       ctx.fillRect(0, 0, 390, 600);
       var score = 0;
       document.addEventListener('click', function (e) {
         var el = e.target.closest('[data-action]');
         if (!el) return;
         score += 10;
         document.getElementById('s').textContent = String(score);
         ctx.beginPath(); ctx.arc(10, 10, 5, 0, 6.28); ctx.fill();
       });`,
    );
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(true);
    expect(result.mutatingClicks).toBeGreaterThan(0);
  });

  it("does not fail on external resource tags (Tailwind CDN, Google Fonts)", () => {
    const html = `<!DOCTYPE html><html><head>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
      </head><body><button data-action="go">Go</button><div id="out">-</div>
      <script>document.addEventListener('click', function(e){ var el = e.target.closest('[data-action]'); if (el) document.getElementById('out').textContent = 'went'; });</script>
      </body></html>`;
    const result = validatePreviewInteractivity(html);
    expect(result.ok).toBe(true);
  });

  it("hard-fails unparseable documents gracefully", () => {
    const result = validatePreviewInteractivity(`<!DOCTYPE html><html><body><script>function {</script></body></html>`);
    expect(result.ok).toBe(false);
  });
});
