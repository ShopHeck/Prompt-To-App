export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  tagline: string;
  signature: string;
  screens: string[];
  accent: string;
  emoji: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: PromptTemplate[] = [
  // ───── Productivity (2) ─────
  {
    id: "habit-streak-tracker",
    name: "Habit Streak Tracker",
    category: "Productivity",
    tagline: "Build lasting habits with visual streak motivation.",
    signature: "Calendar heatmap with streak freeze tokens and milestone celebrations.",
    screens: ["Today", "Habit Detail", "Calendar Heatmap", "Milestones"],
    accent: "#30D158",
    emoji: "🔥",
    prompt:
      "A daily habit tracker that motivates users through streak counting and visual progress. The main screen shows today's habits as a checklist with one-tap completion; each habit displays its current streak count beside an animated flame icon. A full calendar heatmap view (inspired by GitHub contribution graphs) colors each day by completion density using Swift Charts on iOS or a CSS grid on web. Users earn streak freeze tokens (one per 7-day streak) that preserve streaks on missed days without breaking the chain. Milestone celebrations trigger confetti animations and haptic bursts at 7, 30, 60, and 100-day streaks. Data persistence uses SwiftData on iOS with a Habit model (name, icon via SF Symbols, frequency, streak, longestStreak, freezesAvailable) and a CompletionLog model (date, habitId). The web preview uses localStorage with equivalent JSON structures. Navigation is a tab bar: Today, Calendar, Milestones, Settings. The calendar screen supports pinch-to-zoom between week and month views. Settings allow custom reminder notifications via UserNotifications on iOS or the Notifications API on web.",
  },
  {
    id: "voice-memo-transcriber",
    name: "Voice Memo Transcriber",
    category: "Productivity",
    tagline: "Record, transcribe, and search your voice notes.",
    signature: "AI-powered transcription with tag-based organization.",
    screens: ["Recordings", "Record", "Transcript View", "Search"],
    accent: "#007AFF",
    emoji: "🎙️",
    prompt:
      "A voice memo app that records audio and automatically transcribes it using on-device speech recognition. The record screen features a large pulsing microphone button with real-time waveform visualization rendered via SwiftUI Canvas on iOS or the Web Audio API with a canvas element on web. After recording, SFSpeechRecognizer (iOS) or the Web Speech API (web) transcribes the audio into searchable text. Users organize memos into folders and apply color-coded tags (work, personal, idea, meeting). The transcript view shows the full text with timestamp markers that sync playback to specific words when tapped. A powerful search screen lets users find any memo by keyword across all transcriptions with highlighted matches. Data model uses SwiftData with a Memo entity (title, audioFileURL, transcript, tags, folder, duration, createdAt) on iOS and IndexedDB with equivalent fields on web. Navigation uses a sidebar on iPad/web and a tab bar on iPhone: Recordings, Search, Folders, Settings. The UI uses a clean monochrome design with the accent color highlighting active recording state and search matches.",
  },

  // ───── Utility (2) ─────
  {
    id: "split-the-bill",
    name: "Split the Bill",
    category: "Utility",
    tagline: "Smart bill splitting for any group dinner.",
    signature: "Handles tax, tip, and uneven splits with saved friend groups.",
    screens: ["Split", "Add Items", "Summary", "Friend Groups"],
    accent: "#34C759",
    emoji: "🧾",
    prompt:
      "A bill-splitting app that handles complex group dining scenarios beyond simple even splits. Users photograph receipts using VisionKit DataScanner on iOS or a file upload on web to auto-extract line items and totals. The add items screen lets users manually enter or edit extracted items, then assign each item to one or more people by tapping avatar circles. Tax and tip are distributed proportionally based on each person's subtotal. The summary screen shows a clear breakdown per person with their items, tax share, and tip share, plus a total owed. Users save friend groups (roommates, work lunch crew, family) with stored names and payment preferences (Venmo, Zelle, cash) for quick reuse. Data persistence uses SwiftData with models for Split (date, restaurant, total, tipPercent, taxAmount), SplitItem (name, price, assignees), and FriendGroup (name, members). On web, localStorage stores the same structure as JSON. The UI uses a stepped flow: Scan/Enter -> Assign -> Review -> Share. Export the summary as a formatted message via ShareLink or clipboard for pasting into group chats.",
  },
  {
    id: "parking-spot-finder",
    name: "Parking Spot Finder",
    category: "Utility",
    tagline: "Never forget where you parked again.",
    signature: "GPS pin with photo, meter timer, and location sharing.",
    screens: ["Map", "Save Spot", "Timer", "History"],
    accent: "#FF9500",
    emoji: "🅿️",
    prompt:
      "A parking location app that saves exactly where you parked with a GPS pin and optional photo. The save spot screen captures your current location via CoreLocation on iOS or the Geolocation API on web, lets you snap a photo of nearby landmarks for visual reference, and optionally set a parking meter expiration timer. The map screen shows your saved pin on a MapKit view (iOS) or Leaflet/Mapbox map (web) with walking directions back to your car. The timer screen displays a countdown to meter expiration with push notification alerts at 15 and 5 minutes remaining via UserNotifications on iOS or the Notifications API on web. A share button sends your parking location to companions via ShareLink so groups can find the car independently. History view shows past parking spots in a scrollable list with date, location name (reverse geocoded), duration parked, and thumbnail photo. Data model uses SwiftData with ParkingSpot (latitude, longitude, photoURL, meterExpiry, notes, savedAt) on iOS and localStorage on web. The UI features a prominent blue pin on a dark map style with a floating action button to save the current spot.",
  },

  // ───── Gaming (3) ─────
  {
    id: "reflex-racer",
    name: "Reflex Racer",
    category: "Gaming",
    tagline: "Test your reaction speed in fast-paced challenges.",
    signature: "Tap targets at random positions with progressive difficulty and leaderboards.",
    screens: ["Menu", "Game", "Results", "Leaderboard"],
    accent: "#FF3B30",
    emoji: "⚡",
    prompt:
      "A fast-paced reaction time game where colorful circular targets appear at random positions and intervals on screen, and players must tap them as quickly as possible before they disappear. The game screen renders targets using SwiftUI Canvas on iOS or an HTML5 canvas on web, with targets shrinking over their lifetime to create urgency. Progressive difficulty increases speed and adds decoy targets (wrong color) that penalize taps. Each round lasts 30 seconds with a combo multiplier for consecutive successful taps that triggers haptic feedback bursts on iOS. The results screen shows reaction time statistics: average, fastest, slowest, accuracy percentage, and combo streaks displayed with Swift Charts bar graphs on iOS or Chart.js on web. Daily challenges offer a fixed seed so all players compete on the same target sequence, with a global leaderboard showing top times. Data persistence uses SwiftData with GameSession (date, score, avgReactionMs, accuracy, streak) on iOS and localStorage on web. Navigation is straightforward: Menu -> Game -> Results with a persistent leaderboard tab. Visual style uses a dark background with neon-colored targets and particle burst animations on successful taps.",
  },
  {
    id: "dungeon-crawl-dice",
    name: "Dungeon Crawl Dice",
    category: "Gaming",
    tagline: "Your tabletop RPG companion in your pocket.",
    signature: "Customizable dice roller with character sheets and initiative tracker.",
    screens: ["Dice Roller", "Character Sheet", "Initiative", "Loot Table"],
    accent: "#AF52DE",
    emoji: "🎲",
    prompt:
      "A tabletop RPG companion app with a customizable dice roller supporting d4, d6, d8, d10, d12, d20, and d100 with physics-based rolling animations rendered in SwiftUI Canvas on iOS or CSS 3D transforms on web. Users create dice presets for common rolls (attack: 1d20+5, damage: 2d6+3, fireball: 8d6) and tap to roll with satisfying bounce animations and sound effects using AVAudioEngine on iOS or the Web Audio API. The character sheet screen stores stats (STR, DEX, CON, INT, WIS, CHA), hit points with a visual health bar, armor class, and inventory list. The initiative tracker lets the DM add all combatants with their initiative rolls, then auto-sorts and highlights the current turn with a tap-to-advance interface. The loot table screen has configurable random loot generators by rarity tier (common, uncommon, rare, legendary) with weighted probabilities. Data persistence uses SwiftData with Character (name, stats, hp, inventory), DicePreset (name, formula), and Encounter (combatants, currentTurn) models on iOS, and localStorage on web. The UI uses a parchment-and-ink fantasy theme with a dark mode option.",
  },
  {
    id: "word-chain-battle",
    name: "Word Chain Battle",
    category: "Gaming",
    tagline: "Multiplayer word game with category constraints.",
    signature: "Timed rounds, power-ups, and ranked matchmaking.",
    screens: ["Lobby", "Game Board", "Power-ups", "Rankings"],
    accent: "#5856D6",
    emoji: "🔤",
    prompt:
      "A multiplayer word chain game where players take turns entering words that start with the last letter of the previous word, constrained to a chosen category (animals, foods, cities, movies, etc.). Each turn has a countdown timer (starts at 15 seconds, decreases as rounds progress) displayed as an animated circular progress ring. Power-ups add strategic depth: Freeze (pause opponent's timer for 3 seconds), Swap (change the required starting letter), Shield (block one invalid-word penalty), and Double (next valid word scores 2x points). The game board shows the chain of words growing vertically with player colors alternating, and invalid entries trigger a shake animation with haptic feedback on iOS. Ranked matchmaking pairs players by skill rating using an ELO-style system. The rankings screen shows global and friends leaderboards with win/loss records, longest chains, and favorite categories. Data model uses SwiftData with Player (username, rating, wins, losses), Match (players, words, winner, duration), and a local dictionary for word validation on iOS; on web, localStorage stores stats while game logic uses a bundled word list. Real-time multiplayer is simulated with a pass-and-play mode for the preview. Visual style uses bold typography with letter tiles inspired by Scrabble.",
  },

  // ───── Health (1) ─────
  {
    id: "mood-journal",
    name: "Mood Journal",
    category: "Health",
    tagline: "Track your mood with emoji and discover patterns.",
    signature: "Quick daily logging with pattern detection and correlations.",
    screens: ["Today", "Log Mood", "Patterns", "Journal"],
    accent: "#FF6B6B",
    emoji: "😊",
    prompt:
      "A mood tracking app designed for quick daily check-ins using emoji-based mood selection (five levels from great to awful) with optional short journal entries. The log mood screen presents five large emoji buttons in a horizontal row; tapping one records the mood with a timestamp and optional tags (work, exercise, social, sleep quality, weather) for correlation analysis. The patterns screen uses Swift Charts on iOS or Chart.js on web to display mood trends over weeks and months as a smooth line graph, plus correlation insights that surface which tags associate with better or worse moods (e.g., 'You feel 40% better on days you exercise'). The journal view shows a scrollable timeline of all entries with mood emoji, date, tags, and any written notes. A weekly summary notification reminds users of their average mood and top positive correlations. Data persistence uses SwiftData with MoodEntry (mood: Int 1-5, emoji: String, tags: [String], note: String?, timestamp: Date) on iOS and localStorage on web. The UI uses warm gradients that shift color based on the current mood selection, from deep blue (low) to sunny yellow (high). Smooth spring animations on mood selection with gentle haptic feedback on iOS.",
  },

  // ───── Finance (2) ─────
  {
    id: "subscription-manager",
    name: "Subscription Manager",
    category: "Finance",
    tagline: "Track every recurring charge in one place.",
    signature: "Monthly and yearly cost breakdown with renewal reminders.",
    screens: ["Dashboard", "Add Subscription", "Calendar", "Categories"],
    accent: "#10B981",
    emoji: "💳",
    prompt:
      "A subscription tracking app that gives users a clear picture of their recurring expenses and upcoming renewals. The dashboard shows total monthly and yearly spend as large headline numbers, with a categorized breakdown (streaming, software, fitness, news, gaming, cloud storage) displayed as a donut chart using Swift Charts on iOS or Chart.js on web. The add subscription screen lets users enter service name, amount, billing cycle (weekly/monthly/yearly), category, next renewal date, and an optional icon or color. The calendar view highlights upcoming renewal dates with color-coded dots and shows a scrollable list of what renews each day. Push notifications via UserNotifications on iOS or the Notifications API on web alert users 3 days before renewals so they can cancel unwanted services. A spending trends section shows month-over-month changes and flags subscriptions that increased in price. Data persistence uses SwiftData with Subscription (name, amount, cycle, category, nextRenewal, iconName, color, isActive) on iOS and localStorage on web. The UI uses a clean financial dashboard aesthetic with green for income/savings and the accent color for spending categories. Swipe to archive cancelled subscriptions without deleting history.",
  },
  {
    id: "garage-sale-pricer",
    name: "Garage Sale Pricer",
    category: "Finance",
    tagline: "Photograph items and get AI-suggested prices.",
    signature: "Generate price tags, track sales, and calculate profits.",
    screens: ["Inventory", "Add Item", "Price Tags", "Sales Summary"],
    accent: "#F59E0B",
    emoji: "🏷️",
    prompt:
      "A garage sale preparation app that helps users photograph items, set prices, generate printable price tags, and track sales on the day. The add item screen uses the camera to photograph an item, then suggests a price based on the item category and condition (users select from categories: electronics, clothing, furniture, books, toys, kitchen, sports, other). Users confirm or adjust the suggested price and add a brief description. The inventory screen shows a grid of all items with photos, prices, and sold/unsold status. The price tags screen generates a printable sheet of price tags with item name, price, and an optional QR code linking to item details, exportable as a PDF via ShareLink on iOS or window.print() on web. On sale day, users tap items to mark as sold and optionally record the actual sale price (for negotiated discounts). The sales summary shows total revenue, items sold vs remaining, average discount given, and a category breakdown chart using Swift Charts on iOS or Chart.js on web. Data persistence uses SwiftData with GarageItem (photo: Data, name, category, askingPrice, soldPrice, isSold, condition) on iOS and IndexedDB (for photo blobs) on web. The UI has a friendly, colorful yard-sale aesthetic with hand-drawn style borders and warm colors.",
  },

  // ───── Social (2) ─────
  {
    id: "pet-playdate-finder",
    name: "Pet Playdate Finder",
    category: "Social",
    tagline: "Find compatible playdate matches for your pet.",
    signature: "Pet profiles, scheduled meetups, and shared photo albums.",
    screens: ["Discover", "Pet Profile", "Schedule", "Photos"],
    accent: "#FF6B35",
    emoji: "🐾",
    prompt:
      "A social app for pet owners to find compatible playdate partners for their animals. Users create detailed pet profiles with photos, breed, size, age, energy level (calm/moderate/hyper), temperament tags (friendly, shy, playful, gentle), and vaccination status. The discover screen shows nearby pets as swipeable cards (using CoreLocation on iOS or Geolocation API on web for proximity) filtered by compatibility: matching size range, compatible energy levels, and species (dogs with dogs, cats with cats). Users send playdate requests with proposed date, time, and location (park, backyard, beach). The schedule screen shows upcoming and past meetups in a calendar format with details and directions via MapKit on iOS or embedded maps on web. The photos screen is a shared album where both owners can upload photos from their playdate. Data persistence uses SwiftData with Pet (name, species, breed, size, energy, temperament, photos), Playdate (petIds, date, location, status), and Photo (imageData, playdateId, caption) on iOS; localStorage and base64 image storage on web for the preview. The UI uses rounded cards with playful illustrations and a warm, friendly color palette with paw-print accents.",
  },
  {
    id: "gift-idea-vault",
    name: "Gift Idea Vault",
    category: "Social",
    tagline: "Save gift ideas year-round for everyone you love.",
    signature: "Track birthdays, budgets, and gift status from idea to given.",
    screens: ["People", "Add Idea", "Occasions", "Budget"],
    accent: "#EC4899",
    emoji: "🎁",
    prompt:
      "A year-round gift idea collection app that ensures users never scramble for last-minute presents. The people screen shows a list of recipients (family, friends, coworkers) with their upcoming birthdays or occasions and a count of saved ideas per person. The add idea screen captures gift ideas anytime inspiration strikes: item name, link/photo, estimated price, which person it is for, and occasion (birthday, holiday, anniversary, just because). Ideas flow through statuses: Idea -> Purchased -> Wrapped -> Given, tracked with simple tap-to-advance. The occasions screen shows a timeline of upcoming events with countdown days and associated gift ideas, sending push notifications 2 weeks before via UserNotifications on iOS or the Notifications API on web. The budget screen shows spending per person and per occasion with limits users can set, visualized as progress bars that turn amber at 80% and red at 100%. Data persistence uses SwiftData with Person (name, birthday, relationship, notes), GiftIdea (title, url, photoData, price, status, personId, occasion) on iOS and localStorage on web. The UI uses a warm, celebratory design with confetti micro-animations when marking a gift as given. Supports ShareLink to send wishlists to family members who ask 'what do they want?'.",
  },

  // ───── Education (2) ─────
  {
    id: "flashcard-duel",
    name: "Flashcard Duel",
    category: "Education",
    tagline: "Study with spaced repetition, compete with friends.",
    signature: "Challenge friends to timed quizzes with custom decks.",
    screens: ["Decks", "Study", "Duel", "Leaderboard"],
    accent: "#6366F1",
    emoji: "🧠",
    prompt:
      "A flashcard study app combining spaced-repetition learning with competitive timed quizzes. Users create custom decks (language vocab, science terms, history dates, coding concepts) with front/back card pairs and optional images. The study screen implements SM-2 spaced repetition: cards appear based on their due date, and users rate recall difficulty (Again, Hard, Good, Easy) which adjusts the next review interval. The duel mode challenges friends to answer the same deck under time pressure; both players see cards simultaneously and tap to reveal, then self-grade. Faster correct answers earn more points, displayed on a split-screen racing format. The leaderboard shows rankings among friends per deck with stats like accuracy, average speed, and longest study streak. Data persistence uses SwiftData with Deck (title, category, cardCount), Card (front, back, imageData, interval, easeFactor, nextReview), and DuelResult (deckId, scores, date) on iOS; localStorage with equivalent structures on web. Cards flip with a 3D rotation animation (rotateY transform). The UI uses a scholarly but modern aesthetic with indigo accents, clean typography, and subtle paper textures on card surfaces. Study reminders via UserNotifications keep users consistent.",
  },
  {
    id: "plant-care-guide",
    name: "Plant Care Guide",
    category: "Education",
    tagline: "Identify plants and never forget to water them.",
    signature: "Personalized care schedules with photo progress tracking.",
    screens: ["My Plants", "Add Plant", "Care Schedule", "Progress"],
    accent: "#22C55E",
    emoji: "🌱",
    prompt:
      "A houseplant care app that helps users identify plants, track watering and care schedules, and monitor growth through photos. The add plant screen uses the camera with VisionKit on iOS or a file upload on web to photograph a plant, then suggests identification from a built-in database of 100+ common houseplants with care requirements. Users confirm the plant type and set its location (windowsill, desk, bathroom, patio) which influences care recommendations based on typical light levels. The care schedule screen shows a weekly calendar grid with watering, fertilizing, and rotation reminders color-coded per plant, powered by UserNotifications on iOS or the Notifications API on web. The progress screen displays a photo timeline for each plant showing growth over weeks and months in a horizontal scrollable strip. Users log care actions with one tap (watered, fertilized, repotted, pruned) to build a care history. Data persistence uses SwiftData with Plant (name, species, location, photoData, waterIntervalDays, lastWatered, lightNeeds), CareLog (plantId, action, date, note), and ProgressPhoto (plantId, imageData, date) on iOS; localStorage and base64 on web. The UI uses a fresh green-and-white botanical aesthetic with leaf illustrations and gentle animations when marking tasks complete.",
  },

  // ───── Lifestyle (1) ─────
  {
    id: "micro-adventure-generator",
    name: "Micro-Adventure Generator",
    category: "Lifestyle",
    tagline: "Discover unique local adventures for any budget.",
    signature: "Input your constraints and get curated activity suggestions with directions.",
    screens: ["Generate", "Adventure Detail", "Saved", "History"],
    accent: "#F97316",
    emoji: "🧭",
    prompt:
      "A local adventure suggestion app that generates unique activity ideas based on user constraints. The generate screen presents input fields for location (current GPS via CoreLocation on iOS or Geolocation API on web, or manual entry), available time (30 min to full day), budget (free/$/$$/$$$$), group size (solo, couple, small group, large group), and optional mood tags (active, relaxing, creative, social, nature). Based on these inputs, the app suggests 3-5 curated adventure ideas from a built-in database of activity templates contextualized to the user's area (park picnics, urban sketching, coffee shop hopping, sunset hikes, free museum days, farmers market tours, photo walks, volunteer opportunities). The adventure detail screen shows a description, estimated duration, cost breakdown, what to bring checklist, and a map pin with directions via MapKit on iOS or an embedded map on web. Users save favorites and rate completed adventures (1-5 stars) with photos. The history screen shows a visual journal of past adventures with ratings, photos, and dates in a masonry grid. Data persistence uses SwiftData with Adventure (title, description, category, duration, cost, location, rating, photos, completedAt) on iOS and localStorage on web. The UI uses an outdoor-inspired palette with warm oranges, natural greens, and topographic map pattern accents.",
  },
];
