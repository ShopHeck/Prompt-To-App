export const SEEDED_COMPLETE_PROJECT_NAME = "task8-e2e-complete";
export const SEEDED_AWAITING_PROJECT_NAME = "task8-e2e-awaiting";
export const SEEDED_SHARE_TOKEN = "task8-e2e-share-token";
// Awaiting project gets its own (unique) token so the seeder can key
// its delete-then-insert on share_token without colliding with the
// complete-project row.
export const SEEDED_AWAITING_AWAITING_TOKEN = "task8-e2e-awaiting-token";

export const seededClarifyingQuestions = [
  { id: "audience", question: "Who is the primary user?", suggestion: "General personal use." },
  { id: "features", question: "What top features must the app include?", suggestion: "Create, edit, delete, search notes." },
  { id: "persistence", question: "Local-only or cloud-synced?", suggestion: "Local first." },
];

export const seededClarifyAnswers = [
  { id: "audience", question: "Who is the primary user?", answer: "Students and casual writers" },
  { id: "features", question: "What top features must the app include?", answer: "Create, search, tag notes" },
  { id: "persistence", question: "Local-only or cloud-synced?", answer: "Local only" },
];

export const seededArchitecturePlan = {
  screens: [
    { name: "HomeView", purpose: "List of notes" },
    { name: "DetailView", purpose: "Edit a single note" },
    { name: "SettingsView", purpose: "App preferences" },
  ],
  models: [
    { name: "Note", fields: ["id: UUID", "title: String", "body: String"] },
    { name: "Tag", fields: ["id: UUID", "name: String", "color: String"] },
  ],
  navigation: "TabView with two tabs",
  spmDependencies: [],
  fileList: [
    { filename: "Package.swift", purpose: "SPM manifest" },
    { filename: "Info.plist", purpose: "iOS bundle metadata" },
    { filename: "ContentView.swift", purpose: "Root view" },
  ],
};

export const seededAccuracyReport = {
  overallScore: 88,
  summary: "Most planned screens and models are present. One screen is missing and one model is off-spec.",
  items: [
    { type: "screen", name: "HomeView", status: "matched", confidence: 0.95 },
    { type: "screen", name: "DetailView", status: "matched", confidence: 0.9 },
    { type: "screen", name: "SettingsView", status: "missing", confidence: 0.4, notes: "Settings screen referenced in plan but not generated" },
    { type: "model", name: "Note", status: "matched", confidence: 0.95 },
    { type: "model", name: "Tag", status: "off-spec", confidence: 0.6, notes: "Renamed colorHex to color" },
    { type: "file", name: "Package.swift", status: "matched", confidence: 1.0 },
    { type: "file", name: "Info.plist", status: "matched", confidence: 1.0 },
    { type: "file", name: "ExtraHelpers.swift", status: "extra", confidence: 0.7, notes: "Not in plan; appears to be a utility helper" },
  ],
};

export const seededRepairHistory = [
  {
    at: "2026-05-03T02:10:00.000Z",
    targets: ["SettingsView.swift", "Tag.swift"],
    before: { overallScore: 72, summary: "Initial run had gaps", items: [] },
    after: { overallScore: 88, summary: "After repair", items: [] },
  },
];

export const seededFiles = [
  {
    filename: "Package.swift",
    filepath: "Package.swift",
    language: "swift",
    content: `// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "Task8E2E",
  platforms: [.iOS(.v17)],
  targets: [
    .executableTarget(name: "Task8E2E", path: "Sources/Task8E2E"),
  ]
)
`,
  },
  {
    filename: "ContentView.swift",
    filepath: "Sources/Task8E2E/ContentView.swift",
    language: "swift",
    content: `import SwiftUI

struct ContentView: View {
  var body: some View { Text("Hello, Task 8") }
}
`,
  },
  {
    filename: "HomeView.swift",
    filepath: "Sources/Task8E2E/HomeView.swift",
    language: "swift",
    content: `import SwiftUI

struct HomeView: View {
  var body: some View { Text("Home") }
}
`,
  },
];
