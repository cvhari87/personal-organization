import { ItemType } from "./types"

export interface ParsedImportItem {
  id: string          // temp id for UI keying
  text: string        // cleaned text
  type: ItemType      // "todo" | "header" | "text"
  completed: boolean  // true if Apple checkmark detected
  selected: boolean   // user can deselect lines before importing
  duplicate?: {       // set if a similar item already exists
    matchedText: string
    categoryName: string
    source: "fuzzy" | "semantic" | "intra-import"
  }
}

// Apple Notes checkmark characters
const COMPLETED_PREFIXES = /^[✓✔☑✅]\s*/u

// Bullet / list prefixes to strip
const BULLET_PREFIXES = /^(\s*[-•*]|\s*\[[ x]\])\s+/i

// Header heuristic: short (≤ 40 chars), no trailing period, no lowercase-start after first word
// OR all-caps word(s)
function looksLikeHeader(text: string): boolean {
  if (text.length > 60) return false
  if (text.endsWith(".") || text.endsWith("?") || text.endsWith("!")) return false
  // All caps (at least 2 chars)
  if (/^[A-Z0-9 &/\-:]{2,}$/.test(text)) return true
  // Short title-case phrase (no verb-like lowercase words in the middle)
  const words = text.split(" ")
  if (words.length <= 4 && words.every(w => /^[A-Z]/.test(w))) return true
  return false
}

let _counter = 0
function tempId() {
  return `imp-${Date.now()}-${_counter++}`
}

export function parseAppleNotesText(raw: string): ParsedImportItem[] {
  const lines = raw.split(/\r?\n/)
  const results: ParsedImportItem[] = []

  for (const rawLine of lines) {
    let line = rawLine.trim()

    // Skip blank lines
    if (!line) continue

    // Detect completed state from Apple checkmarks
    let completed = false
    if (COMPLETED_PREFIXES.test(line)) {
      completed = true
      line = line.replace(COMPLETED_PREFIXES, "").trim()
    }

    // Strip bullet / checkbox prefixes
    line = line.replace(BULLET_PREFIXES, "").trim()

    // Skip if nothing left
    if (!line) continue

    // Determine type
    let type: ItemType = "todo"
    if (looksLikeHeader(line)) {
      type = "header"
    }

    results.push({
      id: tempId(),
      text: line,
      type,
      completed,
      selected: true,
    })
  }

  return results
}
