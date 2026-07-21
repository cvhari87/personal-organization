# Project Context

This is a **Notes & Todo app** built for a Bootcamp class project (class5, worked on in class6).

## Goals
- A mobile-first notes/todo app where items are organized into categories
- Users can flag items, reorder categories by drag-and-drop, and view flagged items in a dedicated tab
- Currently working on: `class6branch` — experimenting with new features without touching `main`

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI primitives + shadcn/ui pattern
- **Icons**: Lucide React
- **State**: React `useState` / `useEffect` (no external state library)
- **Persistence**: localStorage via `lib/store.ts`
- **Package manager**: npm (pnpm not installed on this machine)

## Project Structure
```
app/
  page.tsx          # Root component — manages all state, renders views
  layout.tsx        # Root layout
components/
  category-card.tsx   # Card shown in the Notes tab for each category
  category-manager.tsx # Dialog to add/edit categories
  flagged-list.tsx    # List of flagged items shown in Flagged tab
  note-detail.tsx     # Detail view when a category is selected
  theme-provider.tsx
lib/
  types.ts    # TodoItem, Category, ItemType types
  store.ts    # localStorage read/write helpers
  utils.ts    # cn() utility
```

## Data Model
```ts
type ItemType = "todo" | "header" | "text"

interface TodoItem {
  id: string
  text: string
  type: ItemType
  completed: boolean
  flagged: boolean
  createdAt: Date
}

interface Category {
  id: string
  name: string
  color: string
  priority: number
  items: TodoItem[]
}
```

## Key Conventions
- All state lives in `app/page.tsx` — pass handlers down as props
- Components are in `/components`, not `/app`
- Use `cn()` from `lib/utils` for conditional class names
- localStorage is the only persistence layer — no backend, no database
- Mobile-first layout: `max-w-lg mx-auto` container

## Dev Commands
```bash
npm run dev     # Start dev server at localhost:3000
npm run build   # Production build
npm run lint    # Lint
```

## Branch Strategy
- `main` — stable, production branch (auto-deploys to Vercel)
- `class6branch` — active development branch for class6 changes
