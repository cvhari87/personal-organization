# 📝 Priority Notes

A production-grade, iOS-inspired notes & task manager built as a Progressive Web App. Installable on any device, works offline, syncs across sessions via Firebase, and uses Gemini AI to auto-categorize imported content.

🔗 **Live App:** [class5-todo-list.vercel.app](https://class5-todo-list.vercel.app)

---

## ✨ Features

### Core
- **Categorized Notes** — Organize tasks into color-coded categories with drag-and-drop reordering
- **Flagged Items** — Pin important tasks to a dedicated Flagged tab with badge counts
- **Recurring Tasks** — Daily-reset items that automatically uncomplete each new day
- **Archive** — Completed flagged items can be archived and restored at any time
- **Universal Search** — Search across all tabs (flagged, notes, archive) with highlighted results

### AI-Powered
- **Smart Import** — Paste text or upload images (whiteboard photos, screenshots, handwritten notes) and Gemini 2.5 Flash extracts, classifies, and categorizes items automatically
- **Auto-Classification** — Each imported line is classified as `todo`, `header`, or `text` based on context
- **Fuzzy Duplicate Detection** — Levenshtein-based dedup prevents importing items that already exist (cross-category + intra-batch)

### Progressive Web App
- **Installable** — Add to home screen on iOS/Android for a native app experience
- **Offline-First** — localStorage for instant loads + Firestore persistent cache for offline writes
- **Service Worker** — Background caching for assets and offline capability
- **Push Notifications** — Due date and overdue reminders via Web Notifications API (iOS 16.4+ PWA)
- **Haptic Feedback** — Vibration patterns for interactions (Android)

### Security & Sync
- **Firebase Auth** — Google sign-in with session management
- **Real-Time Sync** — Firestore real-time subscriptions with intelligent merge conflict resolution
- **PIN Lock** — Optional app-level PIN protection that activates on background
- **Offline Merge** — Items created offline are reconciled with server state on reconnect without data loss

---

## 🏗️ Architecture

```
app/
├── page.tsx                    # Main SPA — view routing, state management, drag-and-drop
├── layout.tsx                  # PWA metadata, theme provider, analytics
├── api/categorize/route.ts     # Gemini AI endpoint (Firebase Admin auth + content analysis)
├── register-sw.tsx             # Service worker registration
components/
├── auth-screen.tsx             # Google sign-in flow
├── category-card.tsx           # Category row with item count + color
├── category-manager.tsx        # Create/edit categories
├── flagged-list.tsx            # Flagged + recurring items view
├── archive-list.tsx            # Archived items view
├── note-detail.tsx             # Category detail with inline editing
├── import-sheet.tsx            # AI-powered import (text + image)
├── pin-lock.tsx                # PIN entry/setup screen
├── settings-sheet.tsx          # App settings
├── pwa-install-prompt.tsx      # Install banner
lib/
├── store.ts                    # localStorage persistence + recurring reset logic
├── firestore.ts                # Firestore CRUD + real-time subscriptions
├── firebase.ts                 # Firebase client init with offline persistence
├── dedup.ts                    # Levenshtein fuzzy matching + duplicate detection
├── import-parser.ts            # Apple Notes text parser (checkmarks, bullets, headers)
├── notifications.ts            # Due date notification scheduling
├── haptics.ts                  # Vibration API patterns
├── types.ts                    # TypeScript interfaces (Category, TodoItem)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16, React 19 |
| **Language** | TypeScript 5.7 |
| **Styling** | Tailwind CSS 4, Radix UI primitives |
| **Auth & Database** | Firebase Auth, Cloud Firestore (offline persistence) |
| **AI** | Google Gemini 2.5 Flash (text + vision) |
| **Drag & Drop** | dnd-kit (pointer + touch sensors) |
| **Deployment** | Vercel (auto-deploy on push) |
| **Analytics** | Vercel Analytics |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Auth + Firestore enabled
- Google Gemini API key

### Setup

```bash
# Clone the repo
git clone https://github.com/cvhari87/class5-todo-list.git
cd class5-todo-list

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase and Gemini credentials
```

### Environment Variables

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-side, for API route auth)
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Gemini AI
GEMINI_API_KEY=
```

### Run

```bash
npm run dev        # Development server on http://localhost:3000
npm run build      # Production build
npm start          # Production server
```

---

## 📱 Key Design Decisions

**Offline-first data flow** — The app loads from localStorage synchronously on startup, then subscribes to Firestore for real-time sync. This ensures the UI is interactive immediately, even with no network. Writes go to Firestore's IndexedDB cache first, then sync to the server.

**Merge conflict resolution** — On the first server snapshot after login, local and server state are merged: local items take priority for state (completed, flagged, text edits), while server-only items are added. This handles the case where a user makes changes right before closing the app and the Firestore write doesn't complete.

**Import intelligence** — The import flow uses Gemini for classification but Levenshtein distance for dedup (threshold: 0.82). This keeps dedup fast and deterministic while leveraging AI only where it adds value (understanding intent vs. mechanical string comparison).

---

## 📄 License

MIT
