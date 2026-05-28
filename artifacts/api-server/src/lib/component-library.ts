// Premium Visual Effects Component Library
// Curated, production-ready SwiftUI component patterns that get injected
// into generated projects based on the Architect's selection.
// The Engineer assembles these rather than inventing from scratch.

export interface ComponentPattern {
  id: string;
  name: string;
  description: string;
  category: "card" | "animation" | "background" | "button" | "text" | "layout";
  swift: string;
}

export const COMPONENT_LIBRARY: ComponentPattern[] = [
  {
    id: "glass_card",
    name: "GlassCard",
    description: "Frosted glass card with ultraThinMaterial, subtle border, and depth shadow. Use for elevated content cards, stat tiles, and feature highlights.",
    category: "card",
    swift: `import SwiftUI

struct GlassCard<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = Theme.cornerRadiusMedium
    var padding: CGFloat = Theme.spacingUnit * 2

    init(cornerRadius: CGFloat = Theme.cornerRadiusMedium, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        content
            .padding(padding)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.12), lineWidth: 0.5)
            )
            .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }
}`,
  },
  {
    id: "shimmer_modifier",
    name: "ShimmerModifier",
    description: "Skeleton loading shimmer animation modifier. Apply to any placeholder view for elegant loading states instead of plain ProgressView.",
    category: "animation",
    swift: `import SwiftUI

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    colors: [
                        .clear,
                        Color.white.opacity(0.12),
                        .clear,
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase)
                .mask(content)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = UIScreen.main.bounds.width
                }
            }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

struct SkeletonRow: View {
    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.surfaceColor.opacity(0.6))
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Theme.surfaceColor.opacity(0.6))
                    .frame(width: 140, height: 14)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Theme.surfaceColor.opacity(0.4))
                    .frame(width: 90, height: 10)
            }
            Spacer()
        }
        .shimmer()
    }
}`,
  },
  {
    id: "staggered_entrance",
    name: "StaggeredEntrance",
    description: "ViewModifier that staggers list items with spring animations on appear. Apply to ForEach items for polished list entrance effects.",
    category: "animation",
    swift: `import SwiftUI

struct StaggeredEntrance: ViewModifier {
    let index: Int
    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 16)
            .scaleEffect(appeared ? 1 : 0.95)
            .animation(
                .spring(response: 0.45, dampingFraction: 0.75)
                    .delay(Double(index) * 0.06),
                value: appeared
            )
            .onAppear { appeared = true }
    }
}

extension View {
    func staggeredEntrance(index: Int) -> some View {
        modifier(StaggeredEntrance(index: index))
    }
}`,
  },
  {
    id: "pulse_glow",
    name: "PulseGlow",
    description: "Accent-colored glow animation for primary CTA buttons and key interactive elements. Draws attention with a subtle pulsing ring of light.",
    category: "button",
    swift: `import SwiftUI

struct PulseGlow: ViewModifier {
    let color: Color
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: Theme.cornerRadiusMedium, style: .continuous)
                    .fill(color.opacity(pulsing ? 0.3 : 0.1))
                    .blur(radius: pulsing ? 16 : 8)
                    .scaleEffect(pulsing ? 1.15 : 1.0)
            )
            .onAppear {
                withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                    pulsing = true
                }
            }
    }
}

extension View {
    func pulseGlow(color: Color = Theme.accentColor) -> some View {
        modifier(PulseGlow(color: color))
    }
}`,
  },
  {
    id: "hero_card",
    name: "HeroCard",
    description: "Card with matchedGeometryEffect for smooth hero transitions between list and detail views. Wrap list items and detail headers for cinematic navigation.",
    category: "card",
    swift: `import SwiftUI

struct HeroCard<Content: View>: View {
    let id: String
    let namespace: Namespace.ID
    let content: Content

    init(id: String, namespace: Namespace.ID, @ViewBuilder content: () -> Content) {
        self.id = id
        self.namespace = namespace
        self.content = content()
    }

    var body: some View {
        content
            .padding(Theme.spacingUnit * 2)
            .background(Theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadiusMedium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cornerRadiusMedium, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 0.5)
            )
            .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
            .matchedGeometryEffect(id: id, in: namespace)
    }
}`,
  },
  {
    id: "ripple_button",
    name: "RippleButton",
    description: "Button with radial ripple feedback animation and haptics on tap. Use for primary action buttons that need tactile, satisfying interaction.",
    category: "button",
    swift: `import SwiftUI

struct RippleButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void

    @State private var rippleScale: CGFloat = 0
    @State private var rippleOpacity: CGFloat = 0

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                rippleScale = 1.5
                rippleOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                rippleScale = 0
                rippleOpacity = 0
            }
            action()
        }) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.body.weight(.semibold))
                    .symbolEffect(.bounce, value: rippleScale)
                Text(title)
                    .font(.body.weight(.semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                ZStack {
                    color
                    Circle()
                        .fill(Color.white.opacity(0.25))
                        .scaleEffect(rippleScale)
                        .opacity(rippleOpacity)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadiusMedium, style: .continuous))
            .shadow(color: color.opacity(0.4), radius: 12, y: 6)
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: rippleScale)
    }
}`,
  },
  {
    id: "particle_field",
    name: "ParticleField",
    description: "Canvas-based ambient floating particle background. Creates a subtle, living background effect with drifting dots that adds depth and atmosphere.",
    category: "background",
    swift: `import SwiftUI

struct ParticleField: View {
    let particleCount: Int
    let color: Color

    init(count: Int = 40, color: Color = Theme.accentColor) {
        self.particleCount = count
        self.color = color
    }

    @State private var particles: [Particle] = []
    @State private var time: TimeInterval = 0

    struct Particle: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        let size: CGFloat
        let speed: CGFloat
        let opacity: CGFloat
        let phase: CGFloat
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let now = timeline.date.timeIntervalSinceReferenceDate
                for p in particles {
                    let yy = (p.y + CGFloat(now) * p.speed * 8).truncatingRemainder(dividingBy: size.height + 20) - 10
                    let xx = p.x + sin(CGFloat(now) * 0.5 + p.phase) * 12
                    let rect = CGRect(x: xx, y: yy, width: p.size, height: p.size)
                    context.opacity = Double(p.opacity) * (0.6 + 0.4 * sin(CGFloat(now) * 0.8 + p.phase))
                    context.fill(Circle().path(in: rect), with: .color(color))
                }
            }
        }
        .onAppear {
            particles = (0..<particleCount).map { _ in
                Particle(
                    x: CGFloat.random(in: 0...UIScreen.main.bounds.width),
                    y: CGFloat.random(in: 0...UIScreen.main.bounds.height),
                    size: CGFloat.random(in: 1.5...4),
                    speed: CGFloat.random(in: 0.3...1.5),
                    opacity: CGFloat.random(in: 0.15...0.5),
                    phase: CGFloat.random(in: 0...(.pi * 2))
                )
            }
        }
        .allowsHitTesting(false)
    }
}`,
  },
  {
    id: "typewriter_text",
    name: "TypewriterText",
    description: "Character-by-character text reveal animation. Use for hero headlines, onboarding text, or feature announcements for a dramatic entrance.",
    category: "text",
    swift: `import SwiftUI

struct TypewriterText: View {
    let fullText: String
    let speed: TimeInterval
    @State private var displayedCount: Int = 0
    @State private var timer: Timer?

    init(_ text: String, speed: TimeInterval = 0.04) {
        self.fullText = text
        self.speed = speed
    }

    var body: some View {
        Text(String(fullText.prefix(displayedCount)))
            .onAppear {
                displayedCount = 0
                timer = Timer.scheduledTimer(withTimeInterval: speed, repeats: true) { t in
                    if displayedCount < fullText.count {
                        displayedCount += 1
                    } else {
                        t.invalidate()
                    }
                }
            }
            .onDisappear {
                timer?.invalidate()
            }
    }
}`,
  },
  {
    id: "animated_gradient_bg",
    name: "AnimatedGradientBackground",
    description: "Background with slowly shifting gradient colors that creates a living, breathing feel. Use behind main content views for premium ambiance.",
    category: "background",
    swift: `import SwiftUI

struct AnimatedGradientBackground: View {
    let colors: [Color]
    @State private var start = UnitPoint.topLeading
    @State private var end = UnitPoint.bottomTrailing

    init(colors: [Color]? = nil) {
        self.colors = colors ?? [
            Theme.accentColor.opacity(0.3),
            Theme.backgroundPrimary,
            Theme.backgroundSecondary,
            Theme.accentColor.opacity(0.15),
        ]
    }

    var body: some View {
        LinearGradient(colors: colors, startPoint: start, endPoint: end)
            .ignoresSafeArea()
            .onAppear {
                withAnimation(.easeInOut(duration: 6).repeatForever(autoreverses: true)) {
                    start = .bottomTrailing
                    end = .topLeading
                }
            }
    }
}`,
  },
  {
    id: "stat_tile",
    name: "StatTile",
    description: "Compact stat display tile with large number, label, and optional trend indicator. Use in dashboard-style screens for key metrics.",
    category: "card",
    swift: `import SwiftUI

struct StatTile: View {
    let title: String
    let value: String
    let icon: String
    var trend: String? = nil
    var trendUp: Bool = true

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon)
                        .font(.subheadline)
                        .foregroundStyle(Theme.accentColor)
                        .symbolRenderingMode(.hierarchical)
                    Spacer()
                    if let trend {
                        HStack(spacing: 2) {
                            Image(systemName: trendUp ? "arrow.up.right" : "arrow.down.right")
                                .font(.caption2.weight(.bold))
                            Text(trend)
                                .font(.caption2.weight(.semibold))
                        }
                        .foregroundStyle(trendUp ? .green : .red)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background((trendUp ? Color.green : Color.red).opacity(0.15))
                        .clipShape(Capsule())
                    }
                }
                Text(value)
                    .font(.system(.title, design: Theme.fontDesign).weight(.bold))
                    .foregroundStyle(Theme.textPrimary)
                    .contentTransition(.numericText())
                Text(title)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }
}`,
  },
  {
    id: "empty_state_view",
    name: "EmptyStateView",
    description: "Polished empty state with large SF Symbol, friendly message, and a CTA button. Every screen that can be empty should use this.",
    category: "layout",
    swift: `import SwiftUI

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    let ctaLabel: String
    let action: () -> Void

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: icon)
                .font(.system(size: 56))
                .foregroundStyle(Theme.accentColor.opacity(0.7))
                .symbolRenderingMode(.hierarchical)
                .symbolEffect(.pulse, options: .repeating, value: appeared)
                .scaleEffect(appeared ? 1 : 0.6)
                .opacity(appeared ? 1 : 0)

            VStack(spacing: 6) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 260)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 8)

            Button(action: action) {
                Text(ctaLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Theme.accentColor)
                    .clipShape(Capsule())
            }
            .sensoryFeedback(.impact(weight: .light), trigger: appeared)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                appeared = true
            }
        }
    }
}`,
  },
  {
    id: "section_header",
    name: "SectionHeader",
    description: "Styled section header with title, optional subtitle, and optional action button. Use instead of plain Text for section dividers.",
    category: "layout",
    swift: `import SwiftUI

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var actionLabel: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Theme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            Spacer()
            if let actionLabel, let action {
                Button(action: action) {
                    Text(actionLabel)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.accentColor)
                }
            }
        }
        .padding(.horizontal, Theme.spacingUnit)
        .padding(.vertical, Theme.spacingUnit / 2)
    }
}`,
  },
];

// Given the architect's selected pattern IDs, return the combined Swift source
// for injection into the Engineer prompt.
export function getSelectedPatterns(ids: string[]): string {
  const selected = COMPONENT_LIBRARY.filter((p) => ids.includes(p.id));
  if (selected.length === 0) return "";

  const sections = selected.map(
    (p) =>
      `// ── ${p.name} ──────────────────────────────\n// ${p.description}\n${p.swift}`
  );

  return `// ═══════════════════════════════════════════════════════════
// PREMIUM COMPONENT LIBRARY (use these in your project)
// Place each component in Sources/Core/Components/<Name>.swift
// Import and use them in your feature views. Do NOT rewrite — use as-is.
// ═══════════════════════════════════════════════════════════

${sections.join("\n\n")}`;
}

// List of pattern IDs + names for the Architect to choose from
export const PATTERN_MENU: string = COMPONENT_LIBRARY.map(
  (p) => `- "${p.id}": ${p.name} — ${p.description}`
).join("\n");
