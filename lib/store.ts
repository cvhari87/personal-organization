import { Category, TodoItem } from "./types"

const STORAGE_KEY = "todo-categories"
const STORAGE_VERSION_KEY = "todo-categories-version"
const CURRENT_VERSION = 5 // Bumped: added archived field

export function todayString(): string {
  return new Date().toISOString().split("T")[0] // "YYYY-MM-DD"
}

const NOW = new Date().toISOString()

const defaultCategories: Category[] = [
  {
    id: "1",
    name: "Work",
    color: "#007AFF",
    priority: 1,
    items: [
      { id: "w0", text: "This week", type: "header", completed: false, flagged: false, createdAt: NOW },
      { id: "w1", text: "Review project proposal", type: "todo", completed: false, flagged: true, createdAt: NOW },
      { id: "w2", text: "Send weekly report", type: "todo", completed: false, flagged: false, createdAt: NOW },
      { id: "w3", text: "Focus on the Q3 deliverables before the end of month.", type: "text", completed: false, flagged: false, createdAt: NOW },
      { id: "w4", text: "Schedule team meeting", type: "todo", completed: true, flagged: false, createdAt: NOW },
    ],
  },
  {
    id: "2",
    name: "Personal",
    color: "#34C759",
    priority: 2,
    items: [
      { id: "p1", text: "Call mom", type: "todo", completed: false, flagged: true, createdAt: NOW },
      { id: "p2", text: "Buy groceries", type: "todo", completed: false, flagged: false, createdAt: NOW },
      { id: "p3", text: "Renew gym membership", type: "todo", completed: false, flagged: true, createdAt: NOW },
    ],
  },
  {
    id: "3",
    name: "Health",
    color: "#FF9500",
    priority: 3,
    items: [
      { id: "h0", text: "Goals", type: "header", completed: false, flagged: false, createdAt: NOW },
      { id: "h1", text: "Exercise 20 mins", type: "todo", completed: false, flagged: false, recurring: true, createdAt: NOW },
      { id: "h2", text: "Drink 8 glasses of water", type: "todo", completed: false, flagged: false, recurring: true, createdAt: NOW },
      { id: "h3", text: "Book dentist appointment", type: "todo", completed: false, flagged: true, createdAt: NOW },
    ],
  },
]

/**
 * Reset recurring items that were completed on a previous day.
 * Called on every app load — safe to call multiple times per day.
 */
export function resetRecurringItems(categories: Category[]): { categories: Category[]; changed: boolean } {
  const today = todayString()
  let changed = false

  const updated = categories.map(cat => ({
    ...cat,
    items: cat.items.map(item => {
      if (
        item.type === "todo" &&
        item.recurring &&
        item.completed &&
        item.lastCompletedDate !== today
      ) {
        changed = true
        return { ...item, completed: false }
      }
      return item
    }),
  }))

  return { categories: updated, changed }
}

export function getCategories(): Category[] {
  if (typeof window === "undefined") return defaultCategories

  // Check version - if outdated, bump the version but keep existing data.
  // Field migrations are handled below via spreads (e.g. type: item.type || "todo").
  const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY)
  if (!storedVersion || parseInt(storedVersion) < CURRENT_VERSION) {
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION.toString())
    // Fall through to read and migrate stored data rather than wiping it.
  }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Category[]
      // Migrate: ensure all items have required fields
      const migrated = parsed.map(cat => ({
        ...cat,
        items: cat.items.map(item => ({
          ...item,
          type: item.type || "todo",
        })),
      }))

      // Auto-reset recurring items from previous days
      const { categories, changed } = resetRecurringItems(migrated)
      if (changed) {
        // Save the reset state immediately
        localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
      }
      return categories
    } catch {
      return defaultCategories
    }
  }
  return defaultCategories
}

export function saveCategories(categories: Category[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
}

export function getFlaggedItems(categories: Category[]): { item: TodoItem; category: Category }[] {
  const flagged: { item: TodoItem; category: Category }[] = []
  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority)

  for (const category of sortedCategories) {
    for (const item of category.items) {
      // Active flagged = flagged, not recurring, not archived
      if (item.type === "todo" && item.flagged && !item.recurring && !item.archived) {
        flagged.push({ item, category })
      }
    }
  }

  return flagged
}

export function getArchivedItems(categories: Category[]): { item: TodoItem; category: Category }[] {
  const archived: { item: TodoItem; category: Category }[] = []
  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority)

  for (const category of sortedCategories) {
    for (const item of category.items) {
      if (item.type === "todo" && item.flagged && item.archived) {
        archived.push({ item, category })
      }
    }
  }

  return archived
}

export function getRecurringItems(categories: Category[]): { item: TodoItem; category: Category }[] {
  const recurring: { item: TodoItem; category: Category }[] = []
  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority)

  for (const category of sortedCategories) {
    for (const item of category.items) {
      if (item.type === "todo" && item.recurring) {
        recurring.push({ item, category })
      }
    }
  }

  return recurring
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}
