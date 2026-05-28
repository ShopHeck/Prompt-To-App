// Premium Web Component Library
// Curated, production-ready React + Tailwind component patterns that get
// injected into generated web projects based on the Architect's selection.
// The Engineer assembles these rather than inventing from scratch.

export interface WebComponentPattern {
  id: string;
  name: string;
  description: string;
  category: "card" | "animation" | "layout" | "feedback" | "data" | "navigation";
  tsx: string;
}

export const WEB_COMPONENT_LIBRARY: WebComponentPattern[] = [
  {
    id: "glass_card",
    name: "GlassCard",
    description: "Frosted glass card with backdrop blur, subtle border, and depth shadow. Use for elevated content cards, stat tiles, and feature highlights.",
    category: "card",
    tsx: `import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = "", hover = true }: GlassCardProps) {
  return (
    <div
      className={\`
        relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.12)]
        \${hover ? "transition-all duration-300 hover:bg-white/[0.08] hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)] hover:-translate-y-0.5" : ""}
        \${className}
      \`.trim()}
    >
      {children}
    </div>
  );
}`,
  },
  {
    id: "stats_grid",
    name: "StatsGrid",
    description: "Dashboard stat tiles with large number, label, trend indicator, and icon. Use for KPI dashboards and overview screens.",
    category: "data",
    tsx: `import React from "react";

interface StatItem {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon?: React.ReactNode;
}

export function StatsGrid({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 transition-all hover:bg-white/[0.08] hover:border-white/20"
        >
          <div className="flex items-center justify-between mb-3">
            {stat.icon && <span className="text-accent opacity-80">{stat.icon}</span>}
            {stat.trend && (
              <span className={\`text-xs font-semibold px-2 py-0.5 rounded-full \${
                stat.trendUp ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }\`}>
                {stat.trendUp ? "+" : ""}{stat.trend}
              </span>
            )}
          </div>
          <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
          <p className="text-sm text-white/50 mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}`,
  },
  {
    id: "animated_list",
    name: "AnimatedList",
    description: "List with staggered entrance animations. Items fade in and slide up sequentially on mount for polished list rendering.",
    category: "animation",
    tsx: `import React, { useEffect, useState } from "react";

interface AnimatedListProps {
  children: React.ReactNode[];
  stagger?: number;
  className?: string;
}

export function AnimatedList({ children, stagger = 60, className = "" }: AnimatedListProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
            transition: \`opacity 0.4s ease, transform 0.4s ease\`,
            transitionDelay: \`\${index * stagger}ms\`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}`,
  },
  {
    id: "shimmer_skeleton",
    name: "ShimmerSkeleton",
    description: "Skeleton loading placeholder with shimmer animation. Use instead of spinners for elegant loading states.",
    category: "feedback",
    tsx: `import React from "react";

interface ShimmerSkeletonProps {
  className?: string;
  lines?: number;
  avatar?: boolean;
}

export function ShimmerSkeleton({ className = "", lines = 3, avatar = false }: ShimmerSkeletonProps) {
  return (
    <div className={\`animate-pulse space-y-3 \${className}\`}>
      {avatar && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-white/10 rounded-full w-1/3" />
            <div className="h-2.5 bg-white/[0.06] rounded-full w-1/4" />
          </div>
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-white/10 rounded-full"
          style={{ width: \`\${70 + Math.sin(i * 1.5) * 25}%\` }}
        />
      ))}
    </div>
  );
}`,
  },
  {
    id: "empty_state",
    name: "EmptyState",
    description: "Polished empty state with icon, title, description, and CTA button. Use when a list or section has no content.",
    category: "layout",
    tsx: `import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-5 text-2xl">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-white/50 max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm
            transition-all hover:brightness-110 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]
            active:scale-[0.97]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}`,
  },
  {
    id: "feature_card",
    name: "FeatureCard",
    description: "Card with icon, title, description, and optional accent gradient. Use for feature showcases and onboarding screens.",
    category: "card",
    tsx: `import React from "react";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor?: string;
}

export function FeatureCard({ icon, title, description, accentColor }: FeatureCardProps) {
  return (
    <div
      className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-300
        hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5 overflow-hidden"
    >
      <div
        className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-[60px] opacity-20 group-hover:opacity-30 transition-opacity"
        style={{ backgroundColor: accentColor || "var(--accent)" }}
      />
      <div className="relative">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4"
          style={{ backgroundColor: \`\${accentColor || "var(--accent)"}22\`, color: accentColor || "var(--accent)" }}
        >
          {icon}
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-white/50 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}`,
  },
  {
    id: "hero_section",
    name: "HeroSection",
    description: "Full-width hero with gradient background, large headline, subtitle, and CTA buttons. Use as the landing section of the app.",
    category: "layout",
    tsx: `import React from "react";

interface HeroSectionProps {
  headline: string;
  subtitle: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export function HeroSection({ headline, subtitle, primaryAction, secondaryAction }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden py-20 px-6">
      <div className="absolute inset-0 bg-gradient-to-b from-accent/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />
      <div className="relative max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
          {headline}
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto mb-10">{subtitle}</p>
        <div className="flex items-center justify-center gap-4">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="px-6 py-3 rounded-xl bg-accent text-white font-semibold
                transition-all hover:brightness-110 hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)]
                active:scale-[0.97]"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-6 py-3 rounded-xl border border-white/20 text-white/80 font-medium
                transition-all hover:bg-white/[0.06] hover:border-white/30"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}`,
  },
  {
    id: "data_table",
    name: "DataTable",
    description: "Styled data table with header, rows, hover effects, and optional sorting indicator. Use for tabular data displays.",
    category: "data",
    tsx: `import React from "react";

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, unknown>>({ columns, data, onRowClick }: DataTableProps<T>) {
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {columns.map((col) => (
              <th key={String(col.key)} className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={\`border-b border-white/5 transition-colors \${
                onRowClick ? "cursor-pointer hover:bg-white/[0.04]" : ""
              }\`}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-5 py-3.5 text-sm">
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}`,
  },
  {
    id: "nav_sidebar",
    name: "NavSidebar",
    description: "Collapsible sidebar navigation with icon + label links, active indicator, and section dividers. Use as the primary app navigation.",
    category: "navigation",
    tsx: `import React, { useState } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: string;
}

interface NavSidebarProps {
  items: NavItem[];
  activeHref: string;
  onNavigate: (href: string) => void;
  header?: React.ReactNode;
}

export function NavSidebar({ items, activeHref, onNavigate, header }: NavSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={\`\${collapsed ? "w-16" : "w-60"} shrink-0 h-screen sticky top-0 border-r border-white/10 bg-white/[0.02] transition-all duration-300 flex flex-col\`}>
      {header && <div className="px-4 py-5 border-b border-white/10">{header}</div>}
      <nav className="flex-1 py-3 space-y-1 px-2">
        {items.map((item) => (
          <button
            key={item.href}
            onClick={() => onNavigate(item.href)}
            className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all \${
              activeHref === item.href
                ? "bg-accent/15 text-accent"
                : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
            }\`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && item.badge && (
              <span className="ml-auto text-[10px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="m-2 p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
      >
        {collapsed ? ">" : "<"}
      </button>
    </aside>
  );
}`,
  },
  {
    id: "toast_notification",
    name: "ToastNotification",
    description: "Animated toast notification system with success/error/info variants. Auto-dismisses with progress bar.",
    category: "feedback",
    tsx: `import React, { useEffect, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((message: string, type: ToastType) => void) | null = null;

export const toast = {
  success: (msg: string) => addToastFn?.(msg, "success"),
  error: (msg: string) => addToastFn?.(msg, "error"),
  info: (msg: string) => addToastFn?.(msg, "info"),
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => { addToastFn = addToast; return () => { addToastFn = null; }; }, [addToast]);

  const colors: Record<ToastType, string> = {
    success: "border-emerald-500/30 bg-emerald-500/10",
    error: "border-red-500/30 bg-red-500/10",
    info: "border-accent/30 bg-accent/10",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={\`rounded-xl border backdrop-blur-xl px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right-full \${colors[t.type]}\`}
          style={{ animation: "slideIn 0.3s ease-out" }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}`,
  },
  {
    id: "modal_dialog",
    name: "ModalDialog",
    description: "Animated modal dialog with backdrop blur, close button, and smooth enter/exit transitions. Use for confirmations, forms, and detail views.",
    category: "feedback",
    tsx: `import React, { useEffect, useRef } from "react";

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function ModalDialog({ open, onClose, title, children, maxWidth = "max-w-lg" }: ModalDialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={\`relative w-full \${maxWidth} rounded-2xl border border-white/10 bg-[var(--bg-primary)] shadow-2xl
          animate-in zoom-in-95 fade-in duration-200\`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}`,
  },
  {
    id: "animated_counter",
    name: "AnimatedCounter",
    description: "Number that animates from 0 to target value on mount. Use for stats, scores, and KPIs.",
    category: "animation",
    tsx: `import React, { useEffect, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedCounter({ value, duration = 1200, prefix = "", suffix = "", className = "" }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  return <span className={className}>{prefix}{display.toLocaleString()}{suffix}</span>;
}`,
  },
];

// Scaffold files that are injected as-is into every web project
// so the model only generates app-specific code.
export const WEB_SCAFFOLD_FILES: { path: string; content: string }[] = [
  {
    path: "tsconfig.json",
    content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}`,
  },
  {
    path: "postcss.config.js",
    content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`,
  },
];

export function getSelectedWebPatterns(ids: string[]): string {
  const selected = WEB_COMPONENT_LIBRARY.filter((p) => ids.includes(p.id));
  if (selected.length === 0) return "";

  const sections = selected.map(
    (p) =>
      `// ── ${p.name} ──────────────────────────────\n// ${p.description}\n// File: src/components/ui/${p.name}.tsx\n${p.tsx}`
  );

  return `// ═══════════════════════════════════════════════════════════
// PREMIUM COMPONENT LIBRARY (use these in your project)
// Place each component in src/components/ui/<Name>.tsx
// Import and use them in your page components. Do NOT rewrite — use as-is.
// ═══════════════════════════════════════════════════════════

${sections.join("\n\n")}`;
}

export function getScaffoldFiles(plan: Record<string, unknown>): { path: string; content: string }[] {
  const ds = (plan.designSystem ?? {}) as Record<string, string>;
  const accentColor = ds.accentColorHex ?? (plan.accentColorHex as string) ?? "#6366f1";
  const fontFamily = ds.fontFamily ?? "'Inter', system-ui, sans-serif";
  const borderRadius = ds.borderRadius ?? "12px";
  const appName = (plan.appName as string) ?? "App";

  const scaffoldFiles = [...WEB_SCAFFOLD_FILES];

  // Dynamic vite.config.ts
  scaffoldFiles.push({
    path: "vite.config.ts",
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});`,
  });

  // Dynamic package.json
  scaffoldFiles.push({
    path: "package.json",
    content: JSON.stringify({
      name: appName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.28.0",
        "lucide-react": "^0.460.0",
        "framer-motion": "^11.12.0",
      },
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        "@tailwindcss/vite": "^4.0.0",
        tailwindcss: "^4.0.0",
        typescript: "^5.6.3",
        vite: "^6.0.0",
      },
    }, null, 2),
  });

  // Dynamic index.html
  scaffoldFiles.push({
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  });

  return scaffoldFiles;
}

export const WEB_PATTERN_MENU: string = WEB_COMPONENT_LIBRARY.map(
  (p) => `- "${p.id}": ${p.name} — ${p.description}`
).join("\n");
