"use client"

import { Archive, ArchiveRestore, Flag, Trophy } from "lucide-react"
import { Category, TodoItem } from "@/lib/types"
import { haptics } from "@/lib/haptics"

interface ArchivedItem {
  item: TodoItem
  category: Category
}

interface ArchiveListProps {
  archivedItems: ArchivedItem[]
  totalArchivedEver: number          // all-time count (including currently archived)
  onUnarchiveItem: (categoryId: string, itemId: string) => void
  searchQuery?: string
}

function itemKey(ai: ArchivedItem) {
  return `${ai.category.id}-${ai.item.id}`
}

export function ArchiveList({ archivedItems, totalArchivedEver, onUnarchiveItem, searchQuery = "" }: ArchiveListProps) {
  const isSearching = searchQuery.trim().length > 0

  if (archivedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-accent/30 flex items-center justify-center mb-4">
          {totalArchivedEver > 0
            ? <Trophy className="w-8 h-8 text-amber-500" />
            : <Archive className="w-8 h-8 text-accent-foreground" />
          }
        </div>
        {isSearching ? (
          <>
            <p className="text-muted-foreground text-center">No results for &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-sm text-muted-foreground/70 text-center mt-1">Try a different search term</p>
          </>
        ) : totalArchivedEver > 0 ? (
          <>
            <p className="font-semibold text-foreground text-center">
              You&apos;ve completed {totalArchivedEver} task{totalArchivedEver !== 1 ? "s" : ""}! 🎉
            </p>
            <p className="text-sm text-muted-foreground/70 text-center mt-1">
              Nothing here right now — archive completed flagged items to track them
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-center">No archived items</p>
            <p className="text-sm text-muted-foreground/70 text-center mt-1">
              Complete a flagged item and tap the archive icon to store it here
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-background/50">
        <div className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-accent-foreground" />
          <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wide">
            Archived ({archivedItems.length})
          </span>
        </div>
        {totalArchivedEver > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-500" />
            {totalArchivedEver} completed
          </span>
        )}
      </div>

      <div>
        {archivedItems.map(ai => (
          <div
            key={itemKey(ai)}
            className="flex items-center gap-2 px-2 py-3 bg-card border-b border-border last:border-0"
          >
            {/* Category color left border */}
            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: ai.category.color }} />

            {/* Spacer */}
            <div className="w-3 flex-shrink-0" />

            {/* Read-only checkbox */}
            <div className="flex-shrink-0">
              <div
                className="h-5 w-5 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: ai.category.color, backgroundColor: ai.category.color + "30" }}
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke={ai.category.color}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Item text + category */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate line-through text-muted-foreground">
                {ai.item.text}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ai.category.color }} />
                <span className="text-xs text-muted-foreground">{ai.category.name}</span>
              </div>
            </div>

            <Flag className="w-3.5 h-3.5 text-amber-400 fill-current flex-shrink-0" />

            {/* Unarchive button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                haptics.medium()
                onUnarchiveItem(ai.category.id, ai.item.id)
              }}
              className="flex items-center justify-center w-9 h-9 rounded-full active:bg-primary/10 active:text-primary text-muted-foreground/50 hover:text-muted-foreground transition-colors flex-shrink-0"
              aria-label="Unarchive"
            >
              <ArchiveRestore className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
