"use client"

import { useState, useEffect, Suspense, useRef, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Flag, List, Moon, Sun, Search, X, GripVertical, Settings, Archive, RefreshCw, Upload, Plus } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"
import { Category } from "@/lib/types"
import { getCategories, saveCategories, getFlaggedItems, getRecurringItems, getArchivedItems, todayString, resetRecurringItems } from "@/lib/store"
import { FlaggedList } from "@/components/flagged-list"
import { ArchiveList } from "@/components/archive-list"
import { CategoryCard } from "@/components/category-card"
import { NoteDetail } from "@/components/note-detail"
import { CategoryManager } from "@/components/category-manager"
import { LockScreen, isPinEnabled } from "@/components/pin-lock"
import { SettingsSheet } from "@/components/settings-sheet"
import { scheduleDueNotifications } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import { haptics } from "@/lib/haptics"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged, signOut, User } from "firebase/auth"
import {
  saveCategoryToFirestore,
  deleteCategoryFromFirestore,
  saveAllCategoriesToFirestore,
  subscribeToCategories,
} from "@/lib/firestore"
import { AuthScreen } from "@/components/auth-screen"
import { ImportSheet } from "@/components/import-sheet"

type View = "flagged" | "categories" | "archive" | "detail"

// Separate component to read search params (must be inside Suspense)
function SearchParamsReader({ onView }: { onView: (view: string | null) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    onView(searchParams.get("view"))
  }, [searchParams, onView])
  return null
}

// Sortable category row using dnd-kit
function SortableCategoryRow({
  category,
  onClick,
  isOverlay,
}: {
  category: Category
  onClick: () => void
  isOverlay?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2",
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "scale-[1.03] shadow-2xl rounded-xl opacity-95"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 touch-none p-2 text-muted-foreground/30 hover:text-muted-foreground/70 cursor-grab active:cursor-grabbing select-none transition-colors"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <CategoryCard category={category} onClick={onClick} />
      </div>
    </div>
  )
}

// ─── Universal search results (searches across ALL tabs) ─────────────────────

type SearchResultItem = {
  kind: "note" | "flagged" | "recurring" | "archived"
  categoryId: string
  categoryName: string
  categoryColor: string
  itemText: string
  itemId: string
}

function SearchResults({
  query,
  categories,
  onSelectCategory,
  onSelectItem,
  onNavigateToTab,
}: {
  query: string
  categories: Category[]
  onSelectCategory: (id: string) => void
  onSelectItem: (categoryId: string, itemId: string) => void
  onNavigateToTab: (tab: "flagged" | "archive") => void
}) {
  const q = query.toLowerCase().trim()
  if (!q) return null

  const matchedCategories: Category[] = []
  const itemResults: SearchResultItem[] = []

  for (const cat of categories) {
    if (cat.name.toLowerCase().includes(q)) matchedCategories.push(cat)

    for (const item of cat.items) {
      if (!item.text.toLowerCase().includes(q)) continue
      if (item.type !== "todo") continue

      let kind: SearchResultItem["kind"] = "note"
      if (item.archived) kind = "archived"
      else if (item.recurring) kind = "recurring"
      else if (item.flagged) kind = "flagged"

      itemResults.push({
        kind,
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        itemText: item.text,
        itemId: item.id,
      })
    }
  }

  const totalResults = matchedCategories.length + itemResults.length

  if (totalResults === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-muted-foreground text-sm">No results for &ldquo;{query}&rdquo;</p>
      </div>
    )
  }

  function highlight(text: string) {
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) return <span>{text}</span>
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  function KindBadge({ kind }: { kind: SearchResultItem["kind"] }) {
    if (kind === "flagged") return <Flag className="w-3 h-3 text-amber-500 fill-current flex-shrink-0" />
    if (kind === "recurring") return <RefreshCw className="w-3 h-3 text-green-500 flex-shrink-0" />
    if (kind === "archived") return <Archive className="w-3 h-3 text-muted-foreground flex-shrink-0" />
    return null
  }

  return (
    <div className="flex flex-col gap-1 pb-4">
      <p className="text-xs text-muted-foreground px-1 mb-1">{totalResults} result{totalResults !== 1 ? "s" : ""}</p>

      {/* Matching note/category names */}
      {matchedCategories.map(cat => (
        <button
          key={cat.id}
          onClick={() => { haptics.light(); onSelectCategory(cat.id) }}
          className="flex items-center gap-3 px-3 py-3 rounded-xl bg-card active:bg-secondary transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
            <div className="w-4 h-4 rounded-md" style={{ backgroundColor: cat.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{highlight(cat.name)}</p>
            <p className="text-xs text-muted-foreground">{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</p>
          </div>
          <List className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      ))}

      {/* Matching items across all tabs */}
      {itemResults.map(r => (
        <button
          key={`${r.categoryId}-${r.itemId}`}
          onClick={() => {
            haptics.light()
            if (r.kind === "flagged" || r.kind === "recurring") {
              onNavigateToTab("flagged")
            } else if (r.kind === "archived") {
              onNavigateToTab("archive")
            } else {
              onSelectItem(r.categoryId, r.itemId)
            }
          }}
          className="flex items-center gap-3 px-3 py-3 rounded-xl bg-card active:bg-secondary transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: r.categoryColor + "20" }}>
            <div className="w-4 h-4 rounded-md" style={{ backgroundColor: r.categoryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{highlight(r.itemText)}</p>
            <p className="text-xs text-muted-foreground">{r.categoryName}</p>
          </div>
          <KindBadge kind={r.kind} />
        </button>
      ))}
    </div>
  )
}

export default function TodoApp() {
  const [categories, setCategories] = useState<Category[]>([])
  const [currentView, setCurrentView] = useState<View>("flagged")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchActive, setSearchActive] = useState(false)
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [scrollToItemId, setScrollToItemId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { theme, setTheme } = useTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const firestoreUnsub = useRef<(() => void) | null>(null)
  const userRef = useRef<User | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  // Auth state listener
  useEffect(() => {
    let mounted = true

    const unsub = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (!mounted) return
      setUser(firebaseUser)
      userRef.current = firebaseUser
      setAuthChecked(true)

      if (firebaseUser) {
        if (firestoreUnsub.current) { firestoreUnsub.current(); firestoreUnsub.current = null }
        
        // 1. Load local state synchronously so the app is instantly ready and offline-capable.
        // getCategories() also handles resetting recurring items locally.
        const localCats = getCategories()
        setCategories(localCats)
        if (isPinEnabled()) setLocked(true)
        scheduleDueNotifications(localCats)
        setMounted(true)

        let isFirstServerSnapshot = true

        // 2. Real-time subscription.
        firestoreUnsub.current = subscribeToCategories(firebaseUser.uid, (firestoreCats, snap) => {
          if (!mounted) return

          // Skip cached snapshots entirely. We trust our synchronous localStorage more 
          // for the initial offline state, as IndexedDB might lag behind if the app is closed quickly.
          if (snap.metadata.fromCache) return

          if (isFirstServerSnapshot) {
            isFirstServerSnapshot = false
            if (firestoreCats.length === 0) {
              // Server is completely empty (new user). Push our local state up.
              saveAllCategoriesToFirestore(firebaseUser.uid, localCats)
            } else {
              // Server has data. Merge local unsynced offline writes into the server data
              // to prevent losing items created right before the app was closed.
              const mergedCats = firestoreCats.map(serverCat => {
                const localCat = localCats.find(c => c.id === serverCat.id)
                if (!localCat) return serverCat

                // Use local items as the base — they reflect the most recent user actions
                // (completed state, flagged, text edits) even if the Firestore write didn't
                // finish before the app was closed. Only add items that exist on the server
                // but not locally (e.g. added from another session).
                const serverOnlyItems = serverCat.items.filter(
                  serverItem => !localCat.items.some(localItem => localItem.id === serverItem.id)
                )

                return { ...serverCat, items: [...localCat.items, ...serverOnlyItems] }
              })

              // Preserve categories that exist locally but haven't synced to server yet
              const localOnlyCats = localCats.filter(c => !firestoreCats.some(s => s.id === c.id))
              const finalMerged = [...mergedCats, ...localOnlyCats]

              const { categories: resetCats } = resetRecurringItems(finalMerged)

              // Always push merged state to Firestore — ensures server reflects the latest
              // local state even when item state (completed, flagged, etc.) diverged
              saveAllCategoriesToFirestore(firebaseUser.uid, resetCats)

              setCategories(resetCats)
              saveCategories(resetCats)
              scheduleDueNotifications(resetCats)
            }
          } else {
            // Skip snapshots that still have pending local writes — these are echoes of our
            // own optimistic updates and would overwrite the latest local state with a
            // potentially stale server view before the write is acknowledged.
            const hasPending = snap.docs.some(d => d.metadata.hasPendingWrites)
            if (hasPending) return

            // Fully server-confirmed snapshot.
            setCategories(firestoreCats)
            saveCategories(firestoreCats)
          }
        })
      } else {
        if (firestoreUnsub.current) { firestoreUnsub.current(); firestoreUnsub.current = null }
        const cats = getCategories()
        setCategories(cats)
        scheduleDueNotifications(cats)
        setMounted(true)
      }
    })

    return () => { mounted = false; unsub(); if (firestoreUnsub.current) firestoreUnsub.current() }
  }, [])

  // Auto-lock when app goes to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPinEnabled()) setLocked(true)
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  // Re-schedule notifications whenever categories change
  useEffect(() => {
    if (mounted) scheduleDueNotifications(categories)
  }, [categories, mounted])

  const handleViewParam = useCallback((view: string | null) => {
    if (view === "notes") setCurrentView("categories")
    else if (view === "flagged") setCurrentView("flagged")
    else if (view === "archive") setCurrentView("archive")
  }, [])

  // Save to localStorage as offline cache
  useEffect(() => {
    if (!mounted) return
    saveCategories(categories)
  }, [categories, mounted])

  const openSearch = () => {
    setSearchActive(true)
    setSearchQuery("")
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const closeSearch = () => {
    setSearchActive(false)
    setSearchQuery("")
    haptics.light()
  }

  const handleCatDragStart = (event: DragStartEvent) => {
    haptics.medium()
    setActiveCatId(event.active.id as string)
  }

  const handleCatDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCatId(null)
    if (over && active.id !== over.id) {
      haptics.light()
      setCategories(prev => {
        const sorted = [...prev].sort((a, b) => a.priority - b.priority)
        const oldIndex = sorted.findIndex(c => c.id === active.id)
        const newIndex = sorted.findIndex(c => c.id === over.id)
        const reordered = arrayMove(sorted, oldIndex, newIndex)
        const updated = reordered.map((cat, i) => ({ ...cat, priority: i + 1 }))
        if (userRef.current) updated.forEach(cat => saveCategoryToFirestore(userRef.current!.uid, cat))
        saveCategories(updated)
        return updated
      })
    }
  }

  const handleToggleComplete = (categoryId: string, itemId: string) => {
    setCategories(prev => {
      const updated = prev.map(cat => {
        if (cat.id !== categoryId) return cat
        const updatedCat = {
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item
            const completing = !item.completed
            return {
              ...item,
              completed: completing,
              lastCompletedDate: completing && item.recurring ? todayString() : item.lastCompletedDate,
            }
          }),
        }
        if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
        return updatedCat
      })
      saveCategories(updated)
      return updated
    })
  }

  const handleSelectItem = (categoryId: string, itemId: string) => {
    setSelectedCategoryId(categoryId)
    setScrollToItemId(itemId)
    setCurrentView("detail")
    closeSearch()
  }

  const handleMoveItem = (fromCategoryId: string, itemId: string, toCategoryId: string) => {
    setCategories(prev => {
      const fromCat = prev.find(c => c.id === fromCategoryId)
      const toCat = prev.find(c => c.id === toCategoryId)
      if (!fromCat || !toCat) return prev
      const item = fromCat.items.find(i => i.id === itemId)
      if (!item) return prev
      const updatedFrom = { ...fromCat, items: fromCat.items.filter(i => i.id !== itemId) }
      const updatedTo = { ...toCat, items: [...toCat.items, item] }
      if (userRef.current) {
        saveCategoryToFirestore(userRef.current!.uid, updatedFrom)
        saveCategoryToFirestore(userRef.current!.uid, updatedTo)
      }
      const updated = prev.map(c =>
        c.id === fromCategoryId ? updatedFrom : c.id === toCategoryId ? updatedTo : c
      )
      saveCategories(updated)
      return updated
    })
    toast(`Moved to ${categories.find(c => c.id === toCategoryId)?.name ?? "note"}`)
  }

  const handleReorderCategoryItems = (categoryId: string, reorderedItemIds: string[]) => {
    let updatedCat: Category | null = null
    setCategories(prev => {
      const cat = prev.find(c => c.id === categoryId)
      if (!cat) return prev
      const idOrder = new Map(reorderedItemIds.map((id, i) => [id, i]))
      const reordered = [...cat.items].sort((a, b) => (idOrder.get(a.id) ?? Infinity) - (idOrder.get(b.id) ?? Infinity))
      updatedCat = { ...cat, items: reordered }
      const updated = prev.map(c => c.id === categoryId ? updatedCat! : c)
      saveCategories(updated)
      return updated
    })
    if (userRef.current && updatedCat) saveCategoryToFirestore(userRef.current.uid, updatedCat)
  }

  const handleBulkMoveItems = (fromCategoryId: string, itemIds: string[], toCategoryId: string) => {
    let updatedFrom: Category | null = null
    let updatedTo: Category | null = null
    setCategories(prev => {
      const fromCat = prev.find(c => c.id === fromCategoryId)
      const toCat = prev.find(c => c.id === toCategoryId)
      if (!fromCat || !toCat) return prev
      const movingItems = fromCat.items.filter(i => itemIds.includes(i.id))
      if (movingItems.length === 0) return prev
      updatedFrom = { ...fromCat, items: fromCat.items.filter(i => !itemIds.includes(i.id)) }
      updatedTo = { ...toCat, items: [...toCat.items, ...movingItems] }
      const updated = prev.map(c =>
        c.id === fromCategoryId ? updatedFrom! : c.id === toCategoryId ? updatedTo! : c
      )
      saveCategories(updated)
      return updated
    })
    if (userRef.current && updatedFrom && updatedTo) {
      saveCategoryToFirestore(userRef.current.uid, updatedFrom)
      saveCategoryToFirestore(userRef.current.uid, updatedTo)
    }
  }

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setCurrentView("detail")
    closeSearch()
  }

  const handleImportItems = (categoryId: string, newItems: import("@/lib/types").TodoItem[]) => {
    setCategories(prev => {
      const updated = prev.map(cat => {
        if (cat.id !== categoryId) return cat
        const updatedCat = { ...cat, items: [...cat.items, ...newItems] }
        if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
        return updatedCat
      })
      saveCategories(updated)
      return updated
    })
    toast(`Imported ${newItems.length} item${newItems.length !== 1 ? "s" : ""}`)
  }

  const handleUpdateCategory = (updatedCategory: Category) => {
    setCategories(prev => {
      const updated = prev.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat)
      saveCategories(updated) // Sync save for immediate offline persistence
      return updated
    })
    if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCategory)
  }

  const handleAddCategory = (newCategory: Category) => {
    setCategories(prev => {
      const updated = [...prev, newCategory]
      saveCategories(updated)
      return updated
    })
    if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, newCategory)
  }

  const handleDeleteItem = (categoryId: string, itemId: string) => {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return
    const deleted = cat.items.find(i => i.id === itemId)
    if (!deleted) return
    const updatedCat = { ...cat, items: cat.items.filter(i => i.id !== itemId) }
    setCategories(prev => {
      const updated = prev.map(c => c.id === categoryId ? updatedCat : c)
      saveCategories(updated)
      return updated
    })
    if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          const restored = { ...updatedCat, items: [...updatedCat.items, deleted] }
          setCategories(prev => {
            const updated = prev.map(c => c.id === categoryId ? restored : c)
            saveCategories(updated)
            return updated
          })
          if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, restored)
        },
      },
    })
  }

  const handleDeleteCategory = (categoryId: string) => {
    const deleted = categories.find(c => c.id === categoryId)
    if (!deleted) return
    setCategories(prev => {
      const updated = prev.filter(c => c.id !== categoryId)
      saveCategories(updated)
      return updated
    })
    if (userRef.current) deleteCategoryFromFirestore(userRef.current!.uid, categoryId)
    setCurrentView("categories")
    toast("Note deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          setCategories(prev => {
            const updated = [...prev, deleted]
            saveCategories(updated)
            return updated
          })
          if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, deleted)
        },
      },
    })
  }

  // Archive a completed flagged item → set archived: true
  const handleArchiveItem = (categoryId: string, itemId: string) => {
    setCategories(prev => {
      const updated = prev.map(cat => {
        if (cat.id !== categoryId) return cat
        const updatedCat = {
          ...cat,
          items: cat.items.map(item =>
            item.id === itemId ? { ...item, archived: true } : item
          ),
        }
        if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
        return updatedCat
      })
      saveCategories(updated)
      return updated
    })
    toast("Item archived", {
      action: {
        label: "Undo",
        onClick: () => {
          setCategories(prev => {
            const restored = prev.map(cat => {
              if (cat.id !== categoryId) return cat
              const restoredCat = {
                ...cat,
                items: cat.items.map(item =>
                  item.id === itemId ? { ...item, archived: false } : item
                ),
              }
              if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, restoredCat)
              return restoredCat
            })
            saveCategories(restored)
            return restored
          })
        },
      },
    })
  }

  // Unarchive → set archived: false, completed: false (back to active flagged)
  const handleUnarchiveItem = (categoryId: string, itemId: string) => {
    setCategories(prev => {
      const updated = prev.map(cat => {
        if (cat.id !== categoryId) return cat
        const updatedCat = {
          ...cat,
          items: cat.items.map(item =>
            item.id === itemId ? { ...item, archived: false, completed: false } : item
          ),
        }
        if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
        return updatedCat
      })
      saveCategories(updated)
      return updated
    })
    toast("Item restored to Flagged")
  }

  const flaggedItems = useMemo(() => getFlaggedItems(categories), [categories])
  const recurringItems = useMemo(() => getRecurringItems(categories), [categories])
  const archivedItems = useMemo(() => getArchivedItems(categories), [categories])

  // All-time archived count: items that are flagged + archived (currently in archive)
  // We use archivedItems.length as the "ever archived" proxy since items stay archived
  const totalArchivedEver = useMemo(() => archivedItems.length, [archivedItems])
  const selectedCategory = useMemo(
    () => categories.find(cat => cat.id === selectedCategoryId),
    [categories, selectedCategoryId]
  )
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.priority - b.priority),
    [categories]
  )

  const filteredFlaggedItems = useMemo(() => {
    if (!searchQuery.trim()) return flaggedItems
    const q = searchQuery.toLowerCase()
    return flaggedItems.filter(
      fi => fi.item.text.toLowerCase().includes(q) || fi.category.name.toLowerCase().includes(q)
    )
  }, [flaggedItems, searchQuery])

  const filteredRecurringItems = useMemo(() => {
    if (!searchQuery.trim()) return recurringItems
    const q = searchQuery.toLowerCase()
    return recurringItems.filter(
      fi => fi.item.text.toLowerCase().includes(q) || fi.category.name.toLowerCase().includes(q)
    )
  }, [recurringItems, searchQuery])

  const filteredArchivedItems = useMemo(() => {
    if (!searchQuery.trim()) return archivedItems
    const q = searchQuery.toLowerCase()
    return archivedItems.filter(
      ai => ai.item.text.toLowerCase().includes(q) || ai.category.name.toLowerCase().includes(q)
    )
  }, [archivedItems, searchQuery])

  // Badge: only count active (incomplete) flagged items
  const activeFlaggedCount = useMemo(
    () => flaggedItems.filter(fi => !fi.item.completed).length,
    [flaggedItems]
  )

  // Archive all completed flagged items at once
  const handleArchiveAllCompleted = () => {
    setCategories(prev => {
      const updated = prev.map(cat => {
        const hasCompletedFlagged = cat.items.some(
          item => item.flagged && item.completed && !item.archived && !item.recurring
        )
        if (!hasCompletedFlagged) return cat
        const updatedCat = {
          ...cat,
          items: cat.items.map(item =>
            item.flagged && item.completed && !item.archived && !item.recurring
              ? { ...item, archived: true }
              : item
          ),
        }
        if (userRef.current) saveCategoryToFirestore(userRef.current!.uid, updatedCat)
        return updatedCat
      })
      saveCategories(updated)
      return updated
    })
    toast("All completed items archived")
  }

  if (!authChecked || !mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onSignedIn={() => {}} />
  }

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />
  }

  const headerTitle =
    currentView === "flagged" ? "Flagged"
    : currentView === "archive" ? "Archive"
    : "Notes"

  return (
    <div className="min-h-[100dvh] bg-background">
      <Suspense fallback={null}>
        <SearchParamsReader onView={handleViewParam} />
      </Suspense>

      <ImportSheet
        open={showImport}
        categories={categories}
        onClose={() => setShowImport(false)}
        onImport={handleImportItems}
        onAddCategory={handleAddCategory}
      />

      <SettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        user={user}
        onSignOut={() => signOut(auth)}
        categories={categories}
      />

      <div className="max-w-lg mx-auto min-h-[100dvh] flex flex-col">
        {currentView === "detail" && selectedCategory ? (
          <NoteDetail
            category={selectedCategory}
            allCategories={categories}
            onBack={() => setCurrentView("categories")}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={() => handleDeleteCategory(selectedCategory.id)}
            onMoveItem={(itemId, toCategoryId) => handleMoveItem(selectedCategory.id, itemId, toCategoryId)}
            onBulkMoveItems={(itemIds, toCategoryId) => handleBulkMoveItems(selectedCategory.id, itemIds, toCategoryId)}
            onArchiveItem={(itemId) => handleArchiveItem(selectedCategory.id, itemId)}
            scrollToItemId={scrollToItemId ?? undefined}
          />
        ) : (
          <>
            {/* ── Header ── */}
            <header className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 bg-background sticky top-0 z-10">
              {!searchActive && (
                <div className="flex items-center justify-between mb-3">
                  <h1 className="text-3xl font-bold tracking-tight">{headerTitle}</h1>
                  <div className="flex items-center gap-1">
                    {currentView === "categories" && (
                      <>
                        <button
                          onClick={() => { haptics.light(); setShowNewCategory(true) }}
                          className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label="New note"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => { haptics.light(); setShowImport(true) }}
                          className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label="Import from Apple Notes"
                        >
                          <Upload className="w-5 h-5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={openSearch}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      aria-label="Search"
                    >
                      <Search className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      aria-label="Toggle theme"
                    >
                      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => { haptics.light(); setShowSettings(true) }}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      aria-label="Settings"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {searchActive && (
                <div className="flex items-center gap-2 mb-3 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 h-10">
                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="text-muted-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={closeSearch}
                    className="text-primary text-sm font-medium px-1 py-2 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </header>

            {/* ── Content ── */}
            <main className="flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-y-auto">
              {searchActive ? (
                <SearchResults
                  query={searchQuery}
                  categories={categories}
                  onSelectCategory={handleSelectCategory}
                  onSelectItem={handleSelectItem}
                  onNavigateToTab={(tab) => {
                    setCurrentView(tab)
                    closeSearch()
                  }}
                />
              ) : currentView === "flagged" ? (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <FlaggedList
                    flaggedItems={filteredFlaggedItems}
                    recurringItems={filteredRecurringItems}
                    onToggleComplete={handleToggleComplete}
                    onSelectItem={handleSelectItem}
                    onDeleteItem={handleDeleteItem}
                    onArchiveItem={handleArchiveItem}
                    onArchiveAllCompleted={handleArchiveAllCompleted}
                    onReorderCategory={handleReorderCategoryItems}
                    searchQuery={searchActive ? searchQuery : ""}
                  />
                </div>
              ) : currentView === "archive" ? (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <ArchiveList
                    archivedItems={filteredArchivedItems}
                    totalArchivedEver={totalArchivedEver}
                    onUnarchiveItem={handleUnarchiveItem}
                    searchQuery={searchActive ? searchQuery : ""}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                    onDragStart={handleCatDragStart}
                    onDragEnd={handleCatDragEnd}
                  >
                    <SortableContext
                      items={sortedCategories.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {sortedCategories.map((category) => (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          onClick={() => {
                            if (!activeCatId) handleSelectCategory(category.id)
                          }}
                        />
                      ))}
                    </SortableContext>

                    <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                      {activeCatId ? (
                        <SortableCategoryRow
                          category={categories.find(c => c.id === activeCatId)!}
                          onClick={() => {}}
                          isOverlay
                        />
                      ) : null}
                    </DragOverlay>
                  </DndContext>

                  {categories.length === 0 && !searchQuery && (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                        <List className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="font-medium text-foreground">No notes yet</p>
                      <p className="text-sm text-muted-foreground mt-1">Tap &ldquo;New Note&rdquo; below to get started</p>
                    </div>
                  )}

                  <CategoryManager
                    onAddCategory={handleAddCategory}
                    open={showNewCategory}
                    onOpenChange={setShowNewCategory}
                  />
                </div>
              )}
            </main>

            {/* ── Bottom Tab Bar ── */}
            {!searchActive && (
              <nav
                className="fixed bottom-0 left-0 right-0 z-20 bg-background/80 backdrop-blur-xl border-t border-border"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                <div className="max-w-lg mx-auto flex">
                  {/* Flagged tab */}
                  <button
                    onClick={() => { haptics.light(); setCurrentView("flagged") }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors",
                      currentView === "flagged" ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <div className="relative">
                      <Flag className="w-6 h-6" />
                      {activeFlaggedCount > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                          {activeFlaggedCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium">Flagged</span>
                  </button>

                  {/* Notes tab */}
                  <button
                    onClick={() => { haptics.light(); setCurrentView("categories") }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors",
                      currentView === "categories" ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <div className="relative">
                      <List className="w-6 h-6" />
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                        {categories.length}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium">Notes</span>
                  </button>

                  {/* Archive tab */}
                  <button
                    onClick={() => { haptics.light(); setCurrentView("archive") }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors",
                      currentView === "archive" ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <div className="relative">
                      <Archive className="w-6 h-6" />
                      {archivedItems.length > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                          {archivedItems.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium">Archive</span>
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
