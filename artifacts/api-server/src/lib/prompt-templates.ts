export interface PromptTemplate {
  label: string;
  category: string;
  tagline: string;
  signature: string;
  screens: string[];
  accent: string;
  emoji: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: PromptTemplate[] = [
  // ───── For Creators (5) ─────
  {
    category: "Creator",
    label: "Sponsorship rate card",
    tagline: "Know your worth. Price your content.",
    signature: "Auto-calculated CPM from real engagement data.",
    screens: ["Dashboard", "Rate card", "Deal tracker", "Media kit"],
    accent: "#FF6B35",
    emoji: "💰",
    prompt:
      "A creator monetization app. Manually log follower counts and engagement rates per platform (YouTube, TikTok, Instagram, X). Auto-calculates CPM and cost-per-engagement. Generates a shareable media kit as a branded PDF via ShareLink. Tracks inbound brand deal inquiries with status pipeline (pitched → negotiating → contracted → delivered → paid). Swift Charts show earnings over time. Lock Screen widget shows this month's deal revenue.",
  },
  {
    category: "Creator",
    label: "Content pipeline",
    tagline: "Idea to published, across every platform.",
    signature: "Visual Kanban board with voice-captured ideas.",
    screens: ["Pipeline", "Idea capture", "Batch planner", "Calendar"],
    accent: "#8B5CF6",
    emoji: "🎬",
    prompt:
      "A content production tracker with a drag-and-drop Kanban board: columns for Idea → Scripted → Shot → Edited → Scheduled → Published. Quick-capture ideas via voice (SFSpeechRecognizer) or text from anywhere using a Share Extension. Batch planning calendar shows shoot days vs editing days. Each card tracks platform-specific versions (vertical, horizontal, square). Deadline alerts via UserNotifications. Lock Screen widget shows today's content task.",
  },
  {
    category: "Creator",
    label: "B-roll vault",
    tagline: "Tag, search, and reuse your footage library.",
    signature: "Vision auto-tags clips by scene, mood, and color.",
    screens: ["Library", "Quick tag", "Search", "Collections"],
    accent: "#06B6D4",
    emoji: "🎞",
    prompt:
      "A footage library manager for video creators. Import clips from the camera roll, auto-categorize using on-device Vision (indoor/outdoor, people, food, nature, urban). Manual tags for mood, project, and season. Full-text search across tags. Tracks which clips have been used in which projects to avoid repeats. Bulk-tag multiple clips at once. Export selected clips as a collection via ShareLink. SwiftData persistence, filterable grid view.",
  },
  {
    category: "Creator",
    label: "Collab tracker",
    tagline: "Never lose a collab in your DMs again.",
    signature: "Pipeline from pitch to publish with revenue splits.",
    screens: ["Active collabs", "New collab", "Timeline", "Payouts"],
    accent: "#EC4899",
    emoji: "🤝",
    prompt:
      "A collaboration management app for creators. Track every collab from first contact through delivery: stages are Pitched → Agreed → Briefed → Filming → Editing → Published. Store collaborator contact info, deadlines, content specs, and revenue splits. Auto-generates a collaboration brief from your inputs. Notification reminders for follow-ups and deadlines. Calendar view shows collab timeline. Swift Charts tracks total collab revenue by month.",
  },
  {
    category: "Creator",
    label: "Launch countdown",
    tagline: "Build hype for drops, releases, and premieres.",
    signature: "Live Activity countdown shared with your audience.",
    screens: ["Launches", "New launch", "Countdown", "Post scheduler"],
    accent: "#F59E0B",
    emoji: "🚀",
    prompt:
      "A launch coordination app for musicians, podcasters, and video creators. Create countdown pages for upcoming releases with cover art, description, and links. Live Activity shows real-time countdown on the Dynamic Island. Plan cross-platform posting schedules (auto-reminds you when to post on each platform). Tracks multiple upcoming launches on a timeline. Share countdown links via ShareLink. Lock Screen widget shows days until next drop.",
  },

  // ───── For Business Owners (5) ─────
  {
    category: "Business",
    label: "Cash pulse",
    tagline: "Daily cash flow in one calm glance.",
    signature: "Runway forecast with 'danger zone' alerts.",
    screens: ["Pulse", "Log entry", "Forecast", "Weekly report"],
    accent: "#10B981",
    emoji: "💵",
    prompt:
      "A daily cash flow tracker for small business owners. Log income and expenses with one tap — snap receipts with VisionKit DataScanner for auto-extraction. Categorize by type (payroll, materials, subscriptions, revenue, one-time). 30/60/90-day runway forecast using Swift Charts. 'Danger zone' alerts when projected outflows exceed inflows. Weekly cash health report exportable as PDF. Lock Screen widget shows today's net position. SwiftData persistence, Face ID lock.",
  },
  {
    category: "Business",
    label: "Client voice",
    tagline: "Hear what your customers actually want.",
    signature: "Auto-clusters feedback into patterns and themes.",
    screens: ["Inbox", "Feedback detail", "Patterns", "Decision log"],
    accent: "#6366F1",
    emoji: "📣",
    prompt:
      "A customer feedback aggregator for product-driven businesses. Capture feedback from any source: paste text, screenshot (VisionKit OCR), voice memo (SFSpeechRecognizer), or photo of a whiteboard. NaturalLanguage framework auto-tags sentiment (positive, neutral, negative) and clusters similar requests. Dashboard shows 'top 5 asks' with request counts. Decision log tracks what you shipped in response. Export monthly insights report via ShareLink. SwiftData with full-text search.",
  },
  {
    category: "Business",
    label: "Quote builder",
    tagline: "Professional proposals in under a minute.",
    signature: "Branded PDF quotes with e-signature capture.",
    screens: ["Quotes", "New quote", "Preview", "Templates"],
    accent: "#0EA5E9",
    emoji: "📝",
    prompt:
      "A mobile quoting and proposal tool for freelancers and service businesses. Choose from service templates (consulting, design, development, photography), add line items with quantities and rates, apply tax and discount. Preview as a branded PDF with your logo and colors. Client signature capture via PencilKit. Auto-follow-up reminders for unsigned quotes. Track quote status (draft → sent → viewed → signed → invoiced). Export via ShareLink or email. SwiftData stores client history.",
  },
  {
    category: "Business",
    label: "Contractor command",
    tagline: "Manage your freelancers without the spreadsheet.",
    signature: "Budget guardrails alert before you overspend.",
    screens: ["Team", "Timesheets", "Budgets", "Pay runs"],
    accent: "#F97316",
    emoji: "👷",
    prompt:
      "A contractor management app for business owners who hire freelancers. Add contractors with rates (hourly/project), track submitted hours and deliverables, approve timesheets with one swipe. Set per-contractor and per-project budget ceilings with alert notifications when 80% spent. Monthly spending breakdown by contractor and project in Swift Charts. Export pay run summaries as CSV. SwiftData persistence, grouped views by project or contractor.",
  },
  {
    category: "Business",
    label: "Storefront pulse",
    tagline: "Your shop's daily vitals, no POS needed.",
    signature: "Correlates sales with weather and day-of-week patterns.",
    screens: ["Today", "Log sale", "Trends", "Inventory alerts"],
    accent: "#84CC16",
    emoji: "🏪",
    prompt:
      "A lightweight daily tracker for physical retail, market vendors, and pop-up shop owners. Tap to log each sale (amount + category). Manual inventory counter with low-stock alerts. Foot traffic counter (manual tap or photo-based). Correlates daily revenue with weather (WeatherKit) and day-of-week patterns using Swift Charts. Shows best/worst selling days, peak hours, and seasonal trends. Weekly summary exportable as PDF. Lock Screen widget shows today's sales total.",
  },

  // ───── For Designers (5) ─────
  {
    category: "Design",
    label: "Type specimen book",
    tagline: "Your personal typography library on the go.",
    signature: "Camera mode identifies fonts from real-world signage.",
    screens: ["Library", "Specimen", "Pairings", "Type walk"],
    accent: "#1E293B",
    emoji: "🔤",
    prompt:
      "A personal font reference app for typographers and designers. Import system fonts and catalog them with tags (serif, sans, mono, display, weight, mood). Generate specimen sheets with pangrams, paragraphs, and size scales. Create and save font pairings with live preview at different sizes. 'Type Walk' camera mode captures text from real-world signage (VisionKit) and identifies similar system fonts. Export specimen cards as PNG via ShareLink. SwiftData library with search and filter.",
  },
  {
    category: "Design",
    label: "Contrast checker",
    tagline: "Never ship inaccessible colors again.",
    signature: "Camera-sampled colors with instant WCAG verdicts.",
    screens: ["Palette", "Check", "Suggestions", "Export"],
    accent: "#7C3AED",
    emoji: "🔍",
    prompt:
      "A color accessibility tool for designers. Build palettes manually or sample colors from the camera. Instantly checks every color combination against WCAG 2.1 AA and AAA contrast ratios for normal and large text. Flags failures with suggested accessible alternatives (shifts hue/lightness minimally to pass). Preview color pairs on realistic UI mockups (buttons, cards, text blocks). Generate tint and shade scales. Export palettes as JSON design tokens, CSS custom properties, or SwiftUI Color extensions via ShareLink.",
  },
  {
    category: "Design",
    label: "Client review board",
    tagline: "Structured design feedback, not messy email threads.",
    signature: "Tap-to-comment on specific areas of your designs.",
    screens: ["Projects", "Upload", "Review board", "Revisions"],
    accent: "#E11D48",
    emoji: "💬",
    prompt:
      "A design review app for client feedback. Upload screenshots or mockups of your work. Clients (or you, simulating a review) tap specific areas to drop pin comments — like spatial annotations on an image. Each comment has a status (open, resolved, deferred). Track revision rounds: v1, v2, v3 with side-by-side comparison. Project-level approval status (in review → changes requested → approved). Timeline shows review history. Export feedback summary as PDF. SwiftData persistence with image caching.",
  },
  {
    category: "Design",
    label: "Moodboard studio",
    tagline: "Capture inspiration, present it beautifully.",
    signature: "Auto-extracts dominant colors and clusters by mood.",
    screens: ["Boards", "Capture", "Board editor", "Present"],
    accent: "#D946EF",
    emoji: "🖼",
    prompt:
      "A visual inspiration tool for designers. Capture images from camera, screenshots, or photo library into themed moodboards. On-device Vision extracts dominant colors from each image. Free-form canvas layout — pinch to resize, drag to arrange, add text labels. Auto-clusters images by color mood. Fullscreen presentation mode for client pitches with swipe navigation. Export boards as high-res PNG or PDF via ShareLink. SwiftData stores boards with image thumbnails.",
  },
  {
    category: "Design",
    label: "Component cutter",
    tagline: "Screenshot any UI. Extract its building blocks.",
    signature: "Vision-powered extraction of spacing, colors, and radii.",
    screens: ["Captures", "Analyze", "Tokens", "Reference library"],
    accent: "#0D9488",
    emoji: "🔬",
    prompt:
      "A UI reverse-engineering tool for designers and developers. Screenshot any app or website, then the app uses Vision to identify UI elements (buttons, cards, nav bars, text blocks). Extracts approximate spacing values, border radii, font sizes, and color swatches. Save analyzed screens to a reference library organized by app or style. Compare extracted tokens side-by-side across different designs. Export token sheets as JSON or PNG cheat sheets via ShareLink. SwiftData persistence.",
  },

  // ───── Gaming (5) ─────
  {
    category: "Gaming",
    label: "Reflex arena",
    tagline: "Train your reflexes with addictive micro-games.",
    signature: "Adaptive difficulty that learns your reaction speed.",
    screens: ["Arena", "Challenge", "Stats", "Leaderboard"],
    accent: "#FF3B30",
    emoji: "⚡",
    prompt:
      "A reaction time training app with 4 addictive mini-games: Tap Target (hit circles as they appear), Color Flash (tap only when the correct color shows), Pattern Recall (memorize and replay a growing sequence), and Speed Sort (swipe items into correct buckets). Adaptive difficulty scales to the player's rolling average. Tracks personal bests per game mode with Swift Charts showing improvement over days and weeks. Daily challenge mode with a single attempt per day and streak tracking. Combo multiplier for consecutive correct responses with satisfying haptic bursts. SwiftData persistence for all scores, animated transitions between games with spring physics.",
  },
  {
    category: "Gaming",
    label: "Stack master",
    tagline: "Time your drops. Build the tallest tower.",
    signature: "Blocks shrink on misalignment — precision is everything.",
    screens: ["Tower", "Game over", "Best towers", "Daily challenge"],
    accent: "#FF9500",
    emoji: "🏗️",
    prompt:
      "A precision stacking game where blocks slide back and forth and you tap to drop them. Misaligned portions get sliced off, making each subsequent block smaller. Perfect drops (no overhang) trigger a combo streak with screen shake and haptic feedback. Game ends when the block becomes too thin. Three modes: Classic (endless), Sprint (30-second rush), and Daily Seed (everyone gets the same sequence, one attempt per day). SwiftUI Canvas renders the tower with gradient-colored blocks. Leaderboard shows best heights. SwiftData tracks personal records and daily challenge history.",
  },
  {
    category: "Gaming",
    label: "Cipher breaker",
    tagline: "Crack codes. Sharpen your mind daily.",
    signature: "Procedurally generated cryptograms with a hint system.",
    screens: ["Daily puzzle", "Solve", "Stats", "Archive"],
    accent: "#5856D6",
    emoji: "🔐",
    prompt:
      "A daily cryptogram puzzle game that sharpens logical thinking. Each day a famous quote is encrypted with a substitution cipher. Tap a cipher letter to guess the real letter — matched letters auto-fill across the puzzle. Hint system reveals one letter at a time (limited hints per puzzle). Three difficulty tiers: Beginner (short quotes, 2 free hints), Standard (medium quotes, 1 hint), and Expert (long quotes, no hints). Tracks solve times, streaks, and completion rates with Swift Charts. Archive of past puzzles you can replay. SwiftData persistence, beautiful monospaced typography with the theme's font style.",
  },
  {
    category: "Gaming",
    label: "Memory palace",
    tagline: "Match pairs across beautifully themed decks.",
    signature: "Progressive grid sizes with zen and timed modes.",
    screens: ["Menu", "Game board", "Results", "Collection"],
    accent: "#AF52DE",
    emoji: "🃏",
    prompt:
      "A polished card-matching memory game with 6 themed decks: Animals, Planets, Botanicals, Landmarks, Sea Creatures, and Gemstones. Each deck has unique card back art and a color palette. Progressive difficulty: 3×4 → 4×4 → 4×5 → 5×6 grids. Two modes: Zen (no timer, move counter) and Timed (countdown adds pressure). Cards flip with a smooth 3D rotation animation. Matched pairs pulse with the accent color and trigger haptic feedback. Mismatches shake briefly. Best scores tracked per deck and difficulty. Unlockable decks earned by completing lower difficulties. SwiftData stores all progress. Spring animations on card entrances, staggered by position.",
  },
  {
    category: "Gaming",
    label: "Maze dash",
    tagline: "Tilt through procedural mazes against the clock.",
    signature: "CoreMotion tilt controls with collectible gems.",
    screens: ["Level select", "Maze", "Results", "Records"],
    accent: "#34C759",
    emoji: "🏃",
    prompt:
      "A tilt-controlled maze game using CoreMotion accelerometer data. Procedurally generated mazes with 5 size tiers (10×10 up to 30×30). Navigate a glowing orb through the maze by tilting your device. Collect gems scattered throughout for bonus points. Avoid dead ends — a subtle trail shows where you've already been. Time trial mode races the clock; Explore mode has no timer. Three stars awarded based on completion time and gems collected. Daily maze challenge with one procedural seed everyone shares. Minimap toggle in the corner. Smooth particle trail behind the orb rendered with SwiftUI Canvas. SwiftData tracks best times per tier. Haptic tap on gem collection, success burst on completion.",
  },

  // ───── Productivity (5) ─────
  {
    category: "Productivity",
    label: "Focus forge",
    tagline: "Deep work sessions with streak-powered motivation.",
    signature: "Pomodoro timer with category tracking and focus reports.",
    screens: ["Timer", "Log session", "Focus report", "Settings"],
    accent: "#FF2D55",
    emoji: "🔥",
    prompt:
      "A focus timer app for deep work. Configurable Pomodoro intervals (default 25 min work / 5 min break, customizable). Categorize sessions by project (work, study, side project, reading) with color-coded tags. Timer screen shows a radial progress ring that fills as time passes, with subtle pulse animation. Session log records every completed focus block with timestamps. Weekly and monthly focus reports using Swift Charts: total hours per category, daily streaks, average session length, and best focus day. Streak system rewards consecutive days of meeting your daily focus goal (configurable: 2-8 hours). Lock Screen widget shows current streak and today's focus time. Haptic tap at session start, satisfying completion burst when timer ends. SwiftData persistence.",
  },
  {
    category: "Productivity",
    label: "Habit chain",
    tagline: "Don't break the chain. Build lasting habits.",
    signature: "Visual streak chains with heat map calendar view.",
    screens: ["Today", "Habit detail", "Calendar", "Statistics"],
    accent: "#30D158",
    emoji: "🔗",
    prompt:
      "A visual habit tracker built around the 'don't break the chain' philosophy. Add habits with custom names, icons (SF Symbols picker), and target frequency (daily, weekdays, 3x/week). Today view shows all habits with one-tap check-off — completed habits get a satisfying chain-link animation. Each habit's detail page shows its current streak, longest streak, and a GitHub-style heat map calendar (green intensity = completion density). Statistics screen aggregates all habits: overall completion rate, best performing habits, consistency trends over 30/90 days using Swift Charts. Optional daily reminder notifications at custom times per habit. Swipe to skip a day with a reason note. SwiftData persistence. Staggered list animations on the today screen.",
  },
  {
    category: "Productivity",
    label: "Stand-up log",
    tagline: "Prep your daily standup in 30 seconds.",
    signature: "Yesterday / today / blockers — formatted and shareable.",
    screens: ["Today", "Write standup", "History", "Team"],
    accent: "#007AFF",
    emoji: "📋",
    prompt:
      "A daily standup meeting prep tool for developers and remote teams. Three-section entry form: 'Yesterday' (what you completed), 'Today' (what you'll work on), 'Blockers' (what's in your way). Each section supports bullet points with quick-add from yesterday's 'Today' items (carry forward). One-tap copy to clipboard as formatted Markdown or plain text for pasting into Slack or Teams. History view shows all past standups in a scrollable timeline — searchable by keyword. Team profiles let you save teammates' names and roles for reference. Weekly summary auto-generates a digest of the week's accomplishments. SwiftData stores all entries. Clean, focused UI with the app's accent color highlighting today's entry.",
  },
  {
    category: "Productivity",
    label: "Decision matrix",
    tagline: "Stop overthinking. Decide with clarity.",
    signature: "Weighted scoring grid that ranks your options objectively.",
    screens: ["Decisions", "New decision", "Matrix", "Result"],
    accent: "#5AC8FA",
    emoji: "⚖️",
    prompt:
      "A decision-making app that replaces gut feelings with structured analysis. Create a decision (e.g. 'Which apartment to rent?'), add 2-5 options, then define 3-6 criteria (e.g. price, commute, space, neighborhood). Weight each criterion by importance (1-5 stars). Score each option against each criterion (1-10). The matrix screen shows a color-coded grid — green for high scores, red for low. Result screen shows the weighted ranking with a clear winner, plus a breakdown bar chart (Swift Charts) showing where each option excelled or fell short. Save past decisions for reference. Share the result summary via ShareLink as a formatted card. SwiftData persistence. Satisfying reveal animation when the winner is calculated.",
  },
  {
    category: "Productivity",
    label: "Energy tracker",
    tagline: "Map your energy, not just your time.",
    signature: "Discover your peak hours with pattern analysis.",
    screens: ["Log", "Today", "Patterns", "Insights"],
    accent: "#FFD60A",
    emoji: "⚡",
    prompt:
      "An energy level tracking app that helps you discover your most productive hours. Quick-log your energy level (1-5) throughout the day with optional context tags (after coffee, post-lunch, exercise, meeting). Today view shows an energy curve as a smooth Swift Chart line graph. Patterns screen reveals your average energy by hour-of-day across weeks — surfaces your personal peak performance windows. Insights screen shows correlations: which activities precede high vs low energy. Configurable check-in reminders (every 2-3 hours via UserNotifications). Weekly energy report with your best and worst days. SwiftData stores all logs. Warm gradient backgrounds that shift from cool blue (low energy) to vibrant gold (high energy) based on your latest reading.",
  },

  // ───── Creative & Out-of-the-Box (5) ─────
  {
    category: "Creative",
    label: "Dream journal",
    tagline: "Capture dreams before they fade. Find the patterns.",
    signature: "Recurring symbol tracker with visual dream map.",
    screens: ["Journal", "Record dream", "Symbols", "Dream map"],
    accent: "#BF5AF2",
    emoji: "🌙",
    prompt:
      "A dream journaling app designed for the 30 seconds after you wake up. Quick-capture screen with large text input optimized for groggy typing. Tag each dream with mood (5 emoji scale), vividness (1-5), lucidity (yes/no), and recurring symbols (flying, water, falling, chase, etc.) from a customizable symbol library. Symbols screen tracks which themes appear most often with Swift Charts frequency bars. Dream map is a visual constellation — each dream is a dot, connected by shared symbols, forming clusters of related dreams over time. Search across all dreams by keyword or symbol. Monthly dream digest shows patterns. SwiftData persistence. Dark purple/indigo theme with soft gradients that feel dreamlike. Subtle star-field particle animation on the journal screen.",
  },
  {
    category: "Creative",
    label: "Story dice",
    tagline: "Roll for inspiration. Write in the moment.",
    signature: "Randomized creative writing prompts with a sprint timer.",
    screens: ["Roll", "Writing sprint", "Stories", "Custom dice"],
    accent: "#FF6B6B",
    emoji: "🎲",
    prompt:
      "A creative writing prompt generator using virtual dice. Four dice categories: Character (detective, astronaut, chef, ghost, child, inventor), Setting (abandoned lighthouse, space station, underwater city, midnight train, ancient library, rooftop garden), Conflict (a stolen letter, a ticking clock, a mistaken identity, a forbidden door, a lost memory, an impossible promise), and Wild Card (it starts raining indoors, gravity reverses, everyone speaks in rhyme, time moves backward, colors disappear, music becomes visible). Roll all four dice with a satisfying physics animation. Lock in your prompt and start a timed writing sprint (5, 10, or 15 minutes) with a minimalist distraction-free writing screen. Save completed stories with the prompt that inspired them. Create custom dice with your own faces. Share your favorite prompts via ShareLink. SwiftData stores all stories and custom dice.",
  },
  {
    category: "Creative",
    label: "Zen garden",
    tagline: "Rake sand. Place stones. Find stillness.",
    signature: "Touch-driven sand patterns with ambient soundscapes.",
    screens: ["Garden", "Elements", "Gallery", "Meditate"],
    accent: "#A2845E",
    emoji: "🪨",
    prompt:
      "An interactive zen garden for mindful breaks. SwiftUI Canvas renders a sand surface that you rake by dragging your finger — trails follow your touch with realistic curved lines. Place stones, moss patches, small bonsai trees, and water features from the elements palette. Each element type generates a subtle ambient sound (trickling water, wind through leaves, distant chimes) that layers into a unique soundscape using AVAudioEngine. Pinch to zoom, long-press to remove elements. Save your garden compositions to a gallery with screenshots. Meditate mode dims the UI and plays the garden's soundscape for a configurable timer (3, 5, 10, 15 min) with a gentle bell at the end. Daily garden prompt suggests a theme (e.g. 'Balance', 'Simplicity', 'Flow'). SwiftData saves garden layouts. Warm earth-tone palette with subtle paper texture backgrounds.",
  },
  {
    category: "Creative",
    label: "Pixel canvas",
    tagline: "Retro pixel art, frame by frame.",
    signature: "Onion-skinning animation editor with palette presets.",
    screens: ["Canvas", "Palette", "Frames", "Gallery"],
    accent: "#00C7BE",
    emoji: "🎨",
    prompt:
      "A pixel art creation tool with animation support. Grid canvas sizes from 8×8 to 32×32. Tap to place pixels, drag to draw lines, long-press to fill. 12 curated color palettes inspired by retro consoles (Game Boy, NES, SNES, Commodore 64, etc.) plus a custom palette builder. Undo/redo stack. Frame-by-frame animation: duplicate the current frame, make edits, toggle onion-skinning to see the previous frame as a ghost overlay. Play animation at configurable FPS (2-12). Gallery saves finished artworks and animations. Export as PNG (still) or animated GIF via ShareLink. Each palette has its own character — the UI tints to match the selected palette's vibe. SwiftData stores all artwork. Zoomed-in editing with a pixel grid overlay, minimap in the corner showing the full canvas.",
  },
  {
    category: "Creative",
    label: "Sound walk",
    tagline: "Record the sounds of your neighborhood. Build an audio map.",
    signature: "Geotagged field recordings pinned to a personal sound map.",
    screens: ["Sound map", "Record", "Library", "Soundscape mixer"],
    accent: "#64D2FF",
    emoji: "🎧",
    prompt:
      "A field recording app for capturing and mapping the sounds of your environment. Record audio clips (10-60 seconds) with automatic geolocation tagging via CoreLocation. Each recording is pinned to a MapKit map view showing all your sound captures as colored dots (categorized: nature, urban, water, music, voices, mechanical). Tap any pin to play the recording with a waveform visualization using SwiftUI Canvas. Library view lists all recordings with search, filter by category, and sort by date or location. Soundscape mixer lets you layer up to 4 recordings simultaneously with individual volume sliders to create ambient mixes — play them during work or sleep. Export recordings or mixes via ShareLink. SwiftData stores metadata and file references. Waveform animations pulse with audio amplitude. Cool blue-to-teal gradient theme evoking open air and exploration.",
  },
];
