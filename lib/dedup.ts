import { Category } from "./types"

// Normalize for comparison: lowercase, strip punctuation, collapse whitespace
function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ")
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Similarity score 0–1 (1 = identical)
function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(na, nb) / maxLen
}

export type DuplicateMatch = {
  matchedText: string
  categoryName: string
  source: "fuzzy" | "semantic" | "intra-import"
}

const FUZZY_THRESHOLD = 0.82

/**
 * Fuzzy + cross-category duplicate detection.
 * Returns a map of import text → best matching existing item.
 * Also detects near-duplicates within the import batch itself.
 *
 * @param maxItems - cap on total existing items scanned (default: unlimited).
 *   Pass a value (e.g. 500) for hot paths like inline item-add to bound cost.
 */
export function findFuzzyDuplicates(
  importTexts: string[],
  allCategories: Category[],
  maxItems?: number
): Map<string, DuplicateMatch> {
  const result = new Map<string, DuplicateMatch>()

  // ── Check against existing items in all categories ────────────────────────
  for (const text of importTexts) {
    let best: { score: number; match: DuplicateMatch } | null = null
    let scanned = 0

    outer:
    for (const cat of allCategories) {
      for (const item of cat.items) {
        // Only compare against existing todos — headers/text are structural labels
        // and are too short/generic to reliably fuzzy-match without false positives
        if (item.type !== "todo") continue
        if (maxItems !== undefined && scanned >= maxItems) break outer
        scanned++
        const score = similarity(text, item.text)
        if (score >= FUZZY_THRESHOLD) {
          if (!best || score > best.score) {
            best = {
              score,
              match: {
                matchedText: item.text,
                categoryName: cat.name,
                source: "fuzzy",
              },
            }
          }
        }
      }
    }

    if (best) result.set(text, best.match)
  }

  // ── Bug 1 fix: check for near-duplicates within the import batch itself ───
  for (let i = 0; i < importTexts.length; i++) {
    const text = importTexts[i]
    // Skip if already flagged as a duplicate of an existing item
    if (result.has(text)) continue

    for (let j = 0; j < i; j++) {
      const other = importTexts[j]
      const score = similarity(text, other)
      if (score >= FUZZY_THRESHOLD) {
        result.set(text, {
          matchedText: other,
          categoryName: "(this import)",
          source: "intra-import",
        })
        break
      }
    }
  }

  return result
}
