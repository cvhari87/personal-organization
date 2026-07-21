/**
 * Local notification scheduling for due-date reminders.
 * Uses the Web Notifications API — works on iOS 16.4+ PWA (added to home screen).
 * Falls back silently on unsupported browsers.
 */

import { Category } from "./types"

const NOTIF_SCHEDULED_KEY = "notif-scheduled-dates"

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false
  if (!("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false

  const result = await Notification.requestPermission()
  return result === "granted"
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported"
  if (!("Notification" in window)) return "unsupported"
  return Notification.permission
}

/**
 * Schedule local notifications for all items due today or overdue.
 * Fires at 9:00 AM local time if not yet past, otherwise fires in 5 seconds.
 * Tracks which dates have been scheduled to avoid duplicates per session.
 */
export function scheduleDueNotifications(categories: Category[]): void {
  if (typeof window === "undefined") return
  if (!("Notification" in window)) return
  if (Notification.permission !== "granted") return

  const today = new Date().toISOString().split("T")[0]
  const now = new Date()

  // Collect all due/overdue items
  const dueItems: { text: string; categoryName: string; dueDate: string }[] = []
  const overdueItems: { text: string; categoryName: string; dueDate: string }[] = []

  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.type !== "todo" || item.completed || !item.dueDate) continue
      if (item.dueDate === today) {
        dueItems.push({ text: item.text, categoryName: cat.name, dueDate: item.dueDate })
      } else if (item.dueDate < today) {
        overdueItems.push({ text: item.text, categoryName: cat.name, dueDate: item.dueDate })
      }
    }
  }

  // Calculate delay until 9am today (or 5s if already past 9am)
  const nineAM = new Date(now)
  nineAM.setHours(9, 0, 0, 0)
  const delayMs = nineAM > now ? nineAM.getTime() - now.getTime() : 5000

  // Schedule due-today notification
  if (dueItems.length > 0) {
    const sessionKey = `due-${today}`
    const scheduled = getScheduledDates()
    if (!scheduled.includes(sessionKey)) {
      setTimeout(() => {
        if (Notification.permission !== "granted") return
        if (dueItems.length === 1) {
          new Notification("Due today", {
            body: `${dueItems[0].text} · ${dueItems[0].categoryName}`,
            icon: "/icon-192.png",
            badge: "/icon-72.png",
            tag: `due-${today}`,
          })
        } else {
          new Notification(`${dueItems.length} items due today`, {
            body: dueItems.map(i => `• ${i.text}`).join("\n"),
            icon: "/icon-192.png",
            badge: "/icon-72.png",
            tag: `due-${today}`,
          })
        }
      }, delayMs)
      markScheduled(sessionKey)
    }
  }

  // Schedule overdue notification (fires in 10s if not already shown today)
  if (overdueItems.length > 0) {
    const sessionKey = `overdue-${today}`
    const scheduled = getScheduledDates()
    if (!scheduled.includes(sessionKey)) {
      setTimeout(() => {
        if (Notification.permission !== "granted") return
        if (overdueItems.length === 1) {
          new Notification("Overdue item", {
            body: `${overdueItems[0].text} · ${overdueItems[0].categoryName} (was due ${overdueItems[0].dueDate})`,
            icon: "/icon-192.png",
            badge: "/icon-72.png",
            tag: `overdue-${today}`,
          })
        } else {
          new Notification(`${overdueItems.length} overdue items`, {
            body: overdueItems.map(i => `• ${i.text} (${i.dueDate})`).join("\n"),
            icon: "/icon-192.png",
            badge: "/icon-72.png",
            tag: `overdue-${today}`,
          })
        }
      }, 10000)
      markScheduled(sessionKey)
    }
  }
}

function getScheduledDates(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(NOTIF_SCHEDULED_KEY) ?? "[]")
  } catch {
    return []
  }
}

function markScheduled(key: string): void {
  try {
    const existing = getScheduledDates()
    sessionStorage.setItem(NOTIF_SCHEDULED_KEY, JSON.stringify([...existing, key]))
  } catch {
    // ignore
  }
}
