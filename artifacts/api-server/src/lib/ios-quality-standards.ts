// Distilled from battle-tested agent skills (twostraws/swiftui-pro 14.3K installs,
// avdlee/swiftui-expert-skill 19.3K installs, wshobson/mobile-ios-design 13.9K
// installs, ui-ux-pro-max). Inject into every engine prompt that touches
// SwiftUI source so generated code uses modern APIs and HIG-compliant patterns.
export const IOS_QUALITY_STANDARDS = `
═══ iOS QUALITY STANDARDS ═══
Scope: the SwiftUI-specific rules below apply to every SwiftUI view file. For UIKit projects, follow the analogous modern UIKit equivalents (UICollectionView compositional layouts, UIContentConfiguration, modern UIButton.Configuration, UIAction closures, async/await, no Storyboards) — the SwiftUI deny-list does not apply to UIKit code. Helper/infrastructure files (Theme, Haptics wrapper, UIKit bridges) are exempt where explicitly noted below.

MODERN APIs (iOS 17+ — using deprecated APIs is DISQUALIFYING):
- Use \`@Observable\` (Observation framework) for view models, NEVER \`ObservableObject\` + \`@Published\`. Mark \`@Observable\` classes \`@MainActor\`.
- View ownership: \`@State private var vm = MyViewModel()\` (NOT \`@StateObject\`). For injected observables that need bindings, use \`@Bindable var vm: MyViewModel\`.
- Inside \`@Observable\` classes, prefix property wrappers with \`@ObservationIgnored\` (e.g. \`@ObservationIgnored @AppStorage("k") var k = ""\`) — they conflict with the macro otherwise.
- \`@State\` and \`@FocusState\` are ALWAYS \`private\`. Never declare passed values as \`@State\` (they ignore parent updates).
- Navigation: \`NavigationStack\` + \`navigationDestination(for:)\` + \`NavigationLink(value:)\`. Never \`NavigationView\`. Never mix \`navigationDestination(for:)\` with destination-based \`NavigationLink(destination:)\`.
- Tabs: use the \`Tab\` API (\`Tab("Home", systemImage: "house") { ... }\`), not \`tabItem(_:)\`. Bind selection to an enum, not an Int.
- Color: \`foregroundStyle(.primary)\` (NOT \`foregroundColor\`). Use semantic styles \`.primary\`/\`.secondary\`/\`.tertiary\` over manual opacity.
- Shapes: \`clipShape(.rect(cornerRadius: 12))\` (NOT \`.cornerRadius(12)\`). \`RoundedRectangle\` defaults to \`.continuous\` corners — don't restate it.
- Tint: \`.tint(.blue)\` (NOT \`.accentColor\`).
- Toolbar placements: \`.topBarLeading\` / \`.topBarTrailing\` (NEVER \`.navigationBarLeading\` / \`.navigationBarTrailing\` — deprecated).
- Buttons: \`Button("Add", systemImage: "plus", action: addItem)\` — pass action by reference, not in a closure that just calls it.
- Tap: only use \`onTapGesture\` for tap location/count; otherwise wrap in \`Button\`. If you must use \`onTapGesture\`, add \`.accessibilityAddTraits(.isButton)\`.
- Animation: ALWAYS \`.animation(.smooth, value: someValue)\` — never the value-less variant. Use \`withAnimation { } completion: { }\` to chain (no DispatchQueue delays).
- Haptics: prefer the SwiftUI \`.sensoryFeedback(.success, trigger: didSubmit)\` modifier in views. \`UIImpactFeedbackGenerator\` / \`UINotificationFeedbackGenerator\` are allowed ONLY inside a dedicated Haptics helper file (e.g. \`Haptics.swift\`); never call them directly from a view body.
- Concurrency: \`async/await\`, \`Task { }\`, \`Task.sleep(for: .seconds(1))\` (never \`nanoseconds:\`). NEVER \`DispatchQueue.main.async\` / \`.asyncAfter\` — use \`Task { @MainActor in ... }\` or animation completion handlers.
- Custom env values: \`@Entry\` macro (\`extension EnvironmentValues { @Entry var theme: Theme = .default }\`) — not manual EnvironmentKey conformance.
- Single-parameter \`onChange(of:perform:)\` is deprecated. Use the no-arg or two-arg variant.

DESIGN & HIG COMPLIANCE:
- Empty/error/missing-content states: use \`ContentUnavailableView\` (\`ContentUnavailableView("No items", systemImage: "tray", description: Text("Tap + to add one"))\`) instead of bespoke empty views. Use \`ContentUnavailableView.search\` for empty search results.
- Side-by-side icon+text: use \`Label("Items", systemImage: "folder")\` over \`HStack { Image; Text }\`.
- Materials for translucent surfaces: \`.background(.ultraThinMaterial, in: .rect(cornerRadius: 16))\` for cards/overlays, \`.regularMaterial\` for sheets — use intentionally to convey background dismissal, not as decoration.
- Semantic colors only: \`.primary\`, \`.secondary\`, \`Color(.systemBackground)\`, \`Color(.secondarySystemBackground)\`, \`Color(.systemGroupedBackground)\`, \`Color(.separator)\`. In view code use Theme tokens for brand color and NEVER hardcode hex values inline. (The Theme/DesignSystem file itself MAY use \`Color(uiColor: UIColor { trait in ... })\` to define dynamic light/dark tokens — that is the one place \`UIColor\` belongs.)
- One primary CTA per screen — secondary actions visually subordinate.
- Spacing follows an 8pt rhythm. No magic numbers.
- Layout: NEVER \`UIScreen.main.bounds\`. Prefer \`containerRelativeFrame\`, \`visualEffect\`, \`onGeometryChange\` over \`GeometryReader\` when possible. Avoid fixed frames on text content.
- Safe area: use \`.safeAreaInset(edge: .bottom) { ... }\` for floating action bars; never hardcode bottom padding for the home indicator.
- Toolbar: use \`.toolbar { ToolbarItem(placement: .topBarTrailing) { ... } }\` for nav-bar buttons; use \`.bottomBar\` placement for action toolbars.

ACCESSIBILITY (REQUIRED, not optional):
- Dynamic Type: use SEMANTIC fonts (\`.font(.body)\`, \`.font(.headline)\`, \`.font(.title2)\`) — never \`.font(.system(size: 17))\`. Custom fonts use \`.font(.custom("Inter", size: 17, relativeTo: .body))\` so they scale.
- For accessibility-size adaptation, branch on \`@Environment(\\.dynamicTypeSize) private var dynamicTypeSize\` and switch HStack→VStack when \`dynamicTypeSize.isAccessibilitySize\`.
- VoiceOver: every icon-only Image/Button needs \`.accessibilityLabel("...")\`. Decorative images: \`Image(decorative:)\` or \`.accessibilityHidden(true)\`.
- For composite cards: \`.accessibilityElement(children: .combine)\` + a single \`.accessibilityLabel\` + optional \`.accessibilityHint\` and \`.accessibilityAddTraits(.isButton)\`.
- Reduce Motion: gate large motion behind \`@Environment(\\.accessibilityReduceMotion) private var reduceMotion\` and substitute opacity transitions when on.
- Tap targets ≥ 44×44pt (iOS HIG).
- Never use \`.fixedSize()\` on body copy — it breaks Dynamic Type.

VIEW STRUCTURE & SWIFT IDIOMS:
- One type per Swift file (struct, class, enum). Extract subviews into their own \`View\` structs when body grows past ~50 lines or nests past ~3 levels — DO NOT carve up bodies with \`@ViewBuilder\` computed properties.
- Move business logic OUT of \`body\`: button actions, \`task { }\`, \`onAppear { }\` should call methods on the view model, not contain logic inline.
- Models: prefer value types conforming to \`Identifiable\` directly (use \`id: UUID = UUID()\`) instead of \`ForEach(items, id: \\.someProperty)\`.
- ForEach must use stable identity, NEVER \`.indices\` for dynamic content. Each iteration produces a CONSTANT number of views.
- Numeric input: \`TextField("Score", value: $score, format: .number)\` + \`.keyboardType(.numberPad)\`. Never bind to a String and convert.
- Number formatting: \`Text(value, format: .number.precision(.fractionLength(2)))\` — never \`String(format: "%.2f", value)\`.
- Strings: \`replacing("a", with: "b")\` (not \`replacingOccurrences\`); \`localizedStandardContains\` for user-input search.
- Force unwraps (\`!\`) and force \`try!\` are forbidden except in truly unreachable code (\`fatalError\` with a clear message). Use \`if let value { ... }\` shorthand.
- File header is one line: \`// AppName/FileName.swift — purpose\`.
═══════════════════════════════════════════════════════════
`;
