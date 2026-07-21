export type ItemType = "todo" | "header" | "text"

export interface TodoItem {
  id: string
  text: string
  type: ItemType
  completed: boolean
  flagged: boolean
  archived?: boolean         // true = moved to Archive tab (flagged items only)
  createdAt: string          // ISO date string — stored as string, safe across JSON serialization
  dueDate?: string           // ISO date string YYYY-MM-DD
  recurring?: boolean        // true = resets to incomplete each new day
  lastCompletedDate?: string // ISO date "YYYY-MM-DD" — last day it was checked off
}

export interface Category {
  id: string
  name: string
  color: string
  priority: number
  items: TodoItem[]
}
