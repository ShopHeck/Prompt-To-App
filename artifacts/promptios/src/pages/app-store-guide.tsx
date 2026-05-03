import { Layout } from "@/components/layout";
import { Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Apple,
  Hammer,
  Send,
  ShieldCheck,
  Layers,
  KeyRound,
  Rocket,
  ImageIcon,
} from "lucide-react";

interface Section {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  intro?: string;
  steps: Array<{ heading: string; body: string }>;
  pitfalls?: string[];
  tips?: string[];
}

const SECTIONS: Section[] = [
  {
    id: "prerequisites",
    title: "Prerequisites",
    icon: ShieldCheck,
    intro: "Before you can ship anything, make sure you have the basics in place.",
    steps: [
      {
        heading: "A Mac running a recent macOS",
        body: "Apple's toolchain (Xcode) is Mac-only. Most developers stay on the latest released macOS to avoid Xcode compatibility issues.",
      },
      {
        heading: "Xcode (latest stable)",
        body: "Install Xcode from the Mac App Store. Open it once after install and accept the license, then let it download the iOS simulator and command-line tools.",
      },
      {
        heading: "Apple Developer Program enrollment",
        body: "You need a paid membership ($99/year) at developer.apple.com to submit to TestFlight or the App Store. Enrollment can take 24–48 hours the first time.",
      },
      {
        heading: "An Apple ID dedicated to your team",
        body: "Use a business Apple ID (not your personal one) and enable two-factor authentication. You'll use it to sign into both Xcode and App Store Connect.",
      },
    ],
    pitfalls: [
      "Trying to submit from a personal Apple ID with no Developer Program membership — Xcode will silently fail at the upload step.",
      "Skipping the macOS / Xcode update — older Xcode versions may be rejected by App Store Connect.",
    ],
  },
  {
    id: "open-project",
    title: "Open the generated project in Xcode",
    icon: Layers,
    intro: "Get the downloaded code building locally before you worry about signing or shipping.",
    steps: [
      {
        heading: "Unzip the downloaded archive",
        body: "Use Finder to unzip the .zip you downloaded from promptiOS. Move the folder somewhere stable (Documents/Projects works well) — don't run it from your Downloads folder.",
      },
      {
        heading: "Open Package.swift or the .xcodeproj",
        body: "Double-click Package.swift (or the project file) to launch Xcode. Wait for Swift Package Manager to resolve dependencies — the activity bar at the top of Xcode shows progress.",
      },
      {
        heading: "Pick a simulator and run it",
        body: "Select an iPhone simulator in the toolbar (e.g. iPhone 15) and press ⌘R. The first build takes a minute. If it runs in the simulator, you're ready for the next step.",
      },
    ],
    pitfalls: [
      "“Failed to resolve package dependencies” usually means no internet, a VPN issue, or a stale Xcode derived data folder. Try Product → Clean Build Folder (⇧⌘K).",
      "If it builds but crashes on launch, read the Xcode console — almost always a missing Info.plist key or a model decoding error.",
    ],
  },
  {
    id: "signing",
    title: "Configure signing & bundle identifier",
    icon: KeyRound,
    intro: "Apple requires every shipped app to have a unique bundle ID and a valid signing identity.",
    steps: [
      {
        heading: "Pick a unique bundle identifier",
        body: "In the project navigator click the project root → your target → Signing & Capabilities. Set the Bundle Identifier to reverse-DNS like com.yourcompany.appname. It must be unique across the entire App Store.",
      },
      {
        heading: "Add your team",
        body: "In the same tab, choose your Apple Developer team from the Team dropdown. If it's not listed, sign in via Xcode → Settings → Accounts and add your Apple ID.",
      },
      {
        heading: "Enable Automatic signing",
        body: "Leave “Automatically manage signing” checked. Xcode will create the development certificate, the App ID, and the provisioning profile for you. The status row should turn green.",
      },
      {
        heading: "Set the Display Name and version",
        body: "Under General set the Display Name (what users see on the home screen), Version (e.g. 1.0.0), and Build (e.g. 1). Increment the Build for every TestFlight upload.",
      },
    ],
    pitfalls: [
      "Bundle ID conflicts: if Xcode says the identifier is unavailable, somebody else (or a previous app of yours) already registered it. Pick a new one.",
      "Wildcard bundle IDs and manual provisioning profiles are rarely needed — stick with automatic signing unless you really know why.",
    ],
    tips: [
      "Once your bundle ID and team are set, also click Capabilities and add things like Push Notifications or Sign in with Apple if your app actually uses them. Apple rejects apps that declare unused capabilities.",
    ],
  },
  {
    id: "archive",
    title: "Build & archive a release",
    icon: Hammer,
    intro: "An “archive” is the signed build artifact you upload to App Store Connect.",
    steps: [
      {
        heading: "Switch the destination to “Any iOS Device”",
        body: "In the toolbar's destination dropdown, choose Any iOS Device (arm64). Archives can't be created against a simulator.",
      },
      {
        heading: "Bump the build number",
        body: "Under Target → General, increment the Build number. App Store Connect rejects re-uploads of the same Version + Build pair.",
      },
      {
        heading: "Product → Archive",
        body: "From the Xcode menu choose Product → Archive. This compiles a Release build, signs it, and stores it in the Organizer. It can take several minutes.",
      },
      {
        heading: "Validate the archive",
        body: "When the Organizer opens, select the archive and click Validate App. Xcode will check signing, entitlements, and assets, and surface any blocking issues before upload.",
      },
    ],
    pitfalls: [
      "If Archive is grayed out, you're still on a simulator destination. Switch to Any iOS Device.",
      "Validation errors about missing icons usually mean Assets.xcassets/AppIcon is incomplete — every required size must be filled.",
    ],
  },
  {
    id: "testflight",
    title: "TestFlight: distribute to internal & beta testers",
    icon: Send,
    intro: "TestFlight is Apple's beta distribution channel — every app should go through it before public release.",
    steps: [
      {
        heading: "Create the app record in App Store Connect",
        body: "Go to appstoreconnect.apple.com → Apps → +. Pick iOS, the bundle ID you configured, an SKU (any unique string), and a primary language.",
      },
      {
        heading: "Distribute the archive",
        body: "Back in the Xcode Organizer, click Distribute App → App Store Connect → Upload. Xcode will sign, package, and upload the .ipa. This usually takes 5–15 minutes.",
      },
      {
        heading: "Wait for processing",
        body: "Once uploaded, App Store Connect processes the build (10–60 minutes). When it appears in TestFlight, answer the export-compliance question (most apps that use only HTTPS qualify for the standard exemption).",
      },
      {
        heading: "Invite testers",
        body: "Add Internal Testers (people on your team — instant access) or create an External Testing group with up to 10,000 testers. External groups need a one-time Beta App Review (usually <24h).",
      },
    ],
    pitfalls: [
      "“Missing compliance” banner blocking testers — answer the encryption question on the build's TestFlight page.",
      "Forgetting to bump the build number; the upload will be rejected with “Redundant Binary Upload”.",
    ],
  },
  {
    id: "listing",
    title: "App Store Connect: listing & submission",
    icon: Apple,
    intro: "When the build is solid in TestFlight, prepare the public listing and submit it for App Review.",
    steps: [
      {
        heading: "Fill in the App Information",
        body: "Set the app name (max 30 chars), subtitle, primary category, and privacy policy URL. The name must not be misleading or include keywords/competitor names.",
      },
      {
        heading: "Add the version's “What's new” and description",
        body: "Promotional text (170 chars), description (4000 chars), keywords (100 chars, comma-separated, no spaces after commas), and support URL. Write for humans first.",
      },
      {
        heading: "Upload screenshots",
        body: "At minimum you need 6.7\" iPhone screenshots (1290×2796 portrait or 2796×1290 landscape). The 6.5\" set used to be required as a fallback — check the latest App Store Connect requirements when you upload.",
      },
      {
        heading: "Set pricing & availability",
        body: "Free or pick a price tier. Choose the countries you want to ship in. New apps default to “All available territories”.",
      },
      {
        heading: "Complete the privacy questionnaire",
        body: "Declare every type of data you collect and why. This determines the privacy nutrition labels users see on the App Store. Be exhaustive — auditors compare this against your actual code.",
      },
      {
        heading: "Attach the build & submit for review",
        body: "Pick the TestFlight build you've already validated, answer the age-rating questionnaire, then click Add for Review → Submit. Apple's review usually comes back within 24–48 hours.",
      },
    ],
    pitfalls: [
      "Screenshots that show device chrome (status bar, notch) other than what's actually rendered. Use simulator-clean screenshots or Xcode's screenshot tool.",
      "Inaccurate or missing privacy declarations — one of the most common rejection reasons.",
      "Marketing copy in the description that promises features the app doesn't actually deliver yet.",
    ],
    tips: [
      "Use a placeholder graphic and a single screenshot to submit early; you can iterate on creative once the binary is approved.",
    ],
  },
  {
    id: "review",
    title: "Common rejection reasons & how to avoid them",
    icon: AlertTriangle,
    intro: "App Review is mostly objective. These are the patterns that catch first-time submitters.",
    steps: [
      {
        heading: "Crashes on launch in the reviewer's region",
        body: "Test against both Wi-Fi and a throttled network. If your app needs an account, include reviewer credentials in the App Review notes.",
      },
      {
        heading: "Broken or placeholder content",
        body: "Lorem ipsum, empty tabs, “coming soon” buttons, or test data are auto-rejects under guideline 2.1.",
      },
      {
        heading: "Missing required disclosures",
        body: "If you collect data, you need a privacy policy URL and matching privacy labels. If you allow user-generated content, you need reporting and blocking flows (guideline 1.2).",
      },
      {
        heading: "Sign in with Apple",
        body: "If you offer third-party sign-in (Google, Facebook, etc.), you must also offer Sign in with Apple per guideline 4.8.",
      },
      {
        heading: "Web-view-only apps",
        body: "An app that's just a wrapper around your website will be rejected. Add native value: notifications, offline, on-device features, etc.",
      },
    ],
    tips: [
      "Reply quickly to App Review messages in the Resolution Center — most rejections become approvals after a small fix and a clarifying note.",
    ],
  },
];

export default function AppStoreGuide() {
  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:py-12 animate-in fade-in duration-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to workspace
        </Link>

        <header className="mt-6 mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Rocket className="h-3 w-3 text-primary" strokeWidth={2} />
            Ship it
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl md:leading-[1.1]">
            How to ship your app to the App Store
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A practical, step-by-step walkthrough from your downloaded promptiOS project to a live App Store
            listing. Plain language, real pitfalls, no fluff.
          </p>
        </header>

        {/* Table of contents */}
        <nav className="mb-10 rounded-xl border border-border/70 bg-card/30 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Contents
          </div>
          <ol className="space-y-1.5">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="group-hover:underline">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-14">
          {SECTIONS.map((section, sIdx) => {
            const Icon = section.icon;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                    <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Section {String(sIdx + 1).padStart(2, "0")}
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{section.title}</h2>
                  </div>
                </div>

                {section.intro && (
                  <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{section.intro}</p>
                )}

                <ol className="space-y-4">
                  {section.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-4 rounded-lg border border-border/60 bg-card/20 p-4"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/70 font-mono text-xs font-semibold tabular-nums text-foreground">
                        {i + 1}
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <div className="font-medium text-foreground">{step.heading}</div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {section.tips && section.tips.length > 0 && (
                  <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
                      <Lightbulb className="h-3 w-3" />
                      Tips
                    </div>
                    <ul className="space-y-1.5">
                      {section.tips.map((tip, i) => (
                        <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {section.pitfalls && section.pitfalls.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      Common pitfalls
                    </div>
                    <ul className="space-y-1.5">
                      {section.pitfalls.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-16 rounded-xl border border-border/70 bg-card/30 p-6">
          <div className="flex items-start gap-3">
            <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <div className="space-y-1">
              <div className="font-medium text-foreground">That's it</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Once you've shipped v1, every subsequent release is just: bump the build, archive, upload,
                fill out “What's new”, and submit. The first one is the hard one.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </Layout>
  );
}
