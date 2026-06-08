export interface StylePreset {
  id: string;
  name: string;
  description: string;
  colorPalette: string;
  typographyStyle: string;
  animationStyle: string;
  componentStyle: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Dark background with neon accents and glassmorphism effects",
    colorPalette: "Deep blacks (#0a0a0f) and dark grays as base, electric neon accents (cyan #00f0ff, magenta #ff00e5, lime #39ff14), glassmorphic translucent surfaces with blur",
    typographyStyle: "Monospace headings (SF Mono or similar), geometric sans-serif body text, uppercase labels with wide letter-spacing, glowing text effects on key elements",
    animationStyle: "Glitch transitions, pulsing neon glows, scanline overlays, subtle flicker effects on interactive elements, matrix-style data cascade animations",
    componentStyle: "Cards with frosted glass backgrounds and neon borders, gradient-stroke buttons, holographic shimmer on hover states, sharp corners mixed with rounded chips, grid-line backgrounds",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Clean design with generous whitespace and subtle gray tones",
    colorPalette: "Pure whites and very light grays (#fafafa, #f5f5f5) as base, single muted accent color (slate blue #6366f1 or warm gray), text in near-black (#1a1a1a) with secondary in medium gray (#737373)",
    typographyStyle: "Inter or system sans-serif, generous line height (1.6+), restrained font weight usage (regular + medium only), large display headings with tight tracking",
    animationStyle: "Micro-interactions only: subtle fade-ins (200ms), gentle scale transforms on press (0.98), smooth page transitions with minimal movement, no decorative animations",
    componentStyle: "Borderless cards with subtle shadow elevation, pill-shaped buttons, generous padding (16-24px), single-pixel dividers, ample negative space between elements, rounded corners (12-16px)",
  },
  {
    id: "brutalist",
    name: "Brutalist",
    description: "Bold typography with high contrast and raw visual edges",
    colorPalette: "Stark black and white as primary, single loud accent (red #ff0000 or yellow #ffcc00), no gradients, flat solid fills only, occasional inverted sections (white on black)",
    typographyStyle: "Extra-bold condensed headings, oversized display type (48-96pt), mixed case with intentional caps, monospace for data/labels, tight line spacing on headings, generous on body",
    animationStyle: "Hard cuts and instant transitions (no easing), abrupt state changes, block reveals (wipe left/right), no subtle fades - elements appear or disappear decisively",
    componentStyle: "Thick visible borders (2-4px solid black), square corners (0 radius), raw unstyled form elements, asymmetric layouts, overlapping elements, visible grid structure, no drop shadows",
  },
  {
    id: "apple-native",
    name: "Apple Native",
    description: "Human Interface Guidelines compliant with system colors and SF Symbols",
    colorPalette: "System dynamic colors (systemBackground, secondarySystemBackground, label, secondaryLabel), tintColor as accent, semantic colors for success/warning/error, full dark mode support via system traits",
    typographyStyle: "San Francisco system font with Dynamic Type support, standard text styles (largeTitle, title, headline, body, callout, caption), proper font weight hierarchy, no custom fonts needed",
    animationStyle: "System-standard spring animations (response: 0.3, dampingFraction: 0.8), NavigationStack push/pop, sheet presentations, matched geometry for hero transitions, symbol effects (.bounce, .pulse)",
    componentStyle: "Native List/Form with inset grouped style, system navigation bars, tab bars with SF Symbols, standard cell layouts, swipe actions, pull-to-refresh, context menus, 44pt minimum tap targets",
  },
  {
    id: "elegant-dark",
    name: "Elegant Dark",
    description: "Sophisticated dark theme with gold and purple accents and refined typography",
    colorPalette: "Rich dark backgrounds (#1a1a2e, #16213e) not pure black, warm gold accent (#d4af37, #f5c842), deep purple secondary (#7c3aed, #a855f7), soft white text (#f0f0f0), muted borders in dark purple-gray",
    typographyStyle: "Serif headings (New York or similar) for elegance, system sans-serif body, medium font weights, generous letter-spacing on small text, refined hierarchy with gold accent on key labels",
    animationStyle: "Smooth elegant transitions (0.4s ease-in-out), parallax depth effects, subtle shimmer on gold elements, gentle opacity fades, smooth blur transitions between states",
    componentStyle: "Cards with subtle gradient backgrounds (dark to darker), thin gold border accents, rounded corners (16-20px), layered depth with soft shadows on dark, frosted glass overlays, ornamental dividers",
  },
];

export function getStylePresets(): StylePreset[] {
  return STYLE_PRESETS;
}

export function getStylePreset(id: string): StylePreset | null {
  return STYLE_PRESETS.find((p) => p.id === id) ?? null;
}

export const VALID_PRESET_IDS = STYLE_PRESETS.map((p) => p.id);
