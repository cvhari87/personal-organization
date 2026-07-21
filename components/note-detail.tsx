"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { ArrowLeft, Plus, Flag, Trash2, GripVertical, Heading, AlignLeft, CheckSquare, ArrowUpDown, RefreshCw, CalendarDays, X, ExternalLink, FolderInput, Pencil, CheckCheck, Square, Share2, ListTodo, Sparkles, Archive } from "lucide-react"
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
import { Category, TodoItem, ItemType } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { generateId, todayString } from "@/lib/store"
import { haptics } from "@/lib/haptics"
import { findFuzzyDuplicates } from "@/lib/dedup"

const PRESET_COLORS = [
  "#007AFF", "#34C759", "#FF9500", "#FF3B30",
  "#AF52DE", "#5856D6", "#FF2D55", "#00C7BE",
]

type SortOrder = "default" | "flagged" | "incomplete" | "alpha"

interface NoteDetailProps {
  category: Category
  allCategories: Category[]
  onBack: () => void
  onUpdateCategory: (category: Category) => void
  onDeleteCategory: () => void
  onMoveItem: (itemId: string, targetCategoryId: string) => void
  onBulkMoveItems: (itemIds: string[], targetCategoryId: string) => void
  onArchiveItem: (itemId: string) => void
  scrollToItemId?: string
}

export function NoteDetail({ category, allCategories, onBack, onUpdateCategory, onDeleteCategory, onMoveItem, onBulkMoveItems, onArchiveItem, scrollToItemId }: NoteDetailProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addingType, setAddingType] = useState<ItemType | null>(null)
  const [newItemText, setNewItemText] = useState("")
  const [newItemDueDate, setNewItemDueDate] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleText, setEditTitleText] = useState(category.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>("default")
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const confirmNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkMoveSheet, setShowBulkMoveSheet] = useState(false)

  const enterSelectMode = (itemId: string) => {
    haptics.medium()
    setSelectMode(true)
    setSelectedIds(new Set([itemId]))
    setAddMenuOpen(false)
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelectItem = (itemId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handleBulkComplete = () => {
    haptics.success()
    const today = new Date().toISOString().split("T")[0]
    onUpdateCategory({
      ...category,
      items: category.items.map(item =>
        selectedIds.has(item.id) && item.type === "todo"
          ? { ...item, completed: true, lastCompletedDate: today }
          : item
      ),
    })
    exitSelectMode()
  }

  const handleBulkFlag = () => {
    haptics.medium()
    onUpdateCategory({
      ...category,
      items: category.items.map(item =>
        selectedIds.has(item.id) && item.type === "todo"
          ? { ...item, flagged: !item.flagged }
          : item
      ),
    })
    exitSelectMode()
  }

  const handleBulkDelete = () => {
    haptics.heavy()
    onUpdateCategory({
      ...category,
      items: category.items.filter(item => !selectedIds.has(item.id)),
    })
    exitSelectMode()
  }

  const handleBulkArchive = () => {
    haptics.success()
    const ids = Array.from(selectedIds)
    // Archive each selected completed todo item
    ids.forEach(id => {
      const item = category.items.find(i => i.id === id)
      if (item && item.type === "todo" && item.completed) {
        onArchiveItem(id)
      }
    })
    exitSelectMode()
  }

  const handleBulkMove = (targetCategoryId: string) => {
    haptics.success()
    const ids = Array.from(selectedIds)
    onBulkMoveItems(ids, targetCategoryId)
    const targetName = allCategories.find(c => c.id === targetCategoryId)?.name ?? "note"
    toast(`Moved ${ids.length} item${ids.length !== 1 ? "s" : ""} to ${targetName}`)
    setShowBulkMoveSheet(false)
    exitSelectMode()
  }

  const handleSelectAll = () => {
    const allTodoIds = category.items
      .filter(i => i.type === "todo")
      .map(i => i.id)
    setSelectedIds(new Set(allTodoIds))
  }

  // Scroll to and briefly highlight the item from search
  useEffect(() => {
    if (!scrollToItemId) return
    const el = document.querySelector(`[data-item-id="${scrollToItemId}"]`)
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        setHighlightedItemId(scrollToItemId)
        setTimeout(() => setHighlightedItemId(null), 1800)
      }, 120)
    }
  }, [scrollToItemId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const handleItemDragStart = (event: DragStartEvent) => {
    haptics.medium()
    setActiveDragId(event.active.id as string)
  }

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    if (over && active.id !== over.id) {
      haptics.light()
      const items = [...category.items]
      const oldIndex = items.findIndex(i => i.id === active.id)
      const newIndex = items.findIndex(i => i.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onUpdateCategory({ ...category, items: arrayMove(items, oldIndex, newIndex) })
      }
    }
  }

  const startAdding = (type: ItemType) => {
    setAddingType(type)
    setNewItemText("")
    setNewItemDueDate("")
    setAddMenuOpen(false)
  }

  const commitNewItem = () => {
    if (!addingType || !newItemText.trim()) { setAddingType(null); return }
    haptics.light()
    // Fuzzy + cross-category duplicate check
    if (addingType === "todo") {
      const dupes = findFuzzyDuplicates([newItemText.trim()], allCategories, 500)
      const dupe = dupes.get(newItemText.trim())
      if (dupe) {
        toast.warning(`Similar to "${dupe.matchedText}" in ${dupe.categoryName}`, { duration: 3000 })
      }
    }
    const newItem: TodoItem = {
      id: generateId(),
      text: newItemText.trim(),
      type: addingType,
      completed: false,
      flagged: false,
      createdAt: new Date().toISOString(),
      dueDate: newItemDueDate || undefined,
    }
    onUpdateCategory({ ...category, items: [...category.items, newItem] })
    setNewItemText("")
    setNewItemDueDate("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitNewItem()
    if (e.key === "Escape") { setAddingType(null); setNewItemText("") }
  }

  const handleToggleComplete = (itemId: string) => {
    const item = category.items.find(i => i.id === itemId)
    if (item) item.completed ? haptics.light() : haptics.success()
    const today = todayString()
    onUpdateCategory({
      ...category,
      items: category.items.map(i =>
        i.id === itemId
          ? { ...i, completed: !i.completed, lastCompletedDate: !i.completed ? today : i.lastCompletedDate }
          : i
      ),
    })
  }

  const handleToggleRecurring = (itemId: string) => {
    haptics.medium()
    onUpdateCategory({
      ...category,
      items: category.items.map(item =>
        item.id === itemId
          ? { ...item, recurring: !item.recurring, flagged: item.recurring ? item.flagged : false }
          : item
      ),
    })
  }

  const handleToggleFlag = (itemId: string) => {
    haptics.medium()
    onUpdateCategory({
      ...category,
      items: category.items.map(item =>
        item.id === itemId ? { ...item, flagged: !item.flagged } : item
      ),
    })
  }

  const handleDeleteItem = (itemId: string) => {
    const deleted = category.items.find(i => i.id === itemId)
    if (!deleted) return
    haptics.heavy()
    onUpdateCategory({ ...category, items: category.items.filter(i => i.id !== itemId) })
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: () => onUpdateCategory({
          ...category,
          items: [...category.items.filter(i => i.id !== itemId), deleted],
        }),
      },
    })
  }

  const handleUpdateText = (itemId: string, text: string) => {
    onUpdateCategory({
      ...category,
      items: category.items.map(item => item.id === itemId ? { ...item, text } : item),
    })
  }

  const handleUpdateDueDate = (itemId: string, dueDate: string) => {
    onUpdateCategory({
      ...category,
      items: category.items.map(item =>
        item.id === itemId ? { ...item, dueDate: dueDate || undefined } : item
      ),
    })
  }

  const commitTitleEdit = () => {
    if (editTitleText.trim()) onUpdateCategory({ ...category, name: editTitleText.trim() })
    else setEditTitleText(category.name)
    setEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitTitleEdit()
    if (e.key === "Escape") { setEditTitleText(category.name); setEditingTitle(false) }
  }

  const handleDeleteNote = () => {
    if (confirmDeleteNote) {
      onDeleteCategory()
    } else {
      setConfirmDeleteNote(true)
      confirmNoteTimer.current = setTimeout(() => setConfirmDeleteNote(false), 3000)
    }
  }

  useEffect(() => {
    return () => { if (confirmNoteTimer.current) clearTimeout(confirmNoteTimer.current) }
  }, [])

  // ── Share note as text ────────────────────────────────────────────────────
  const handleShare = async () => {
    haptics.light()
    const lines: string[] = [`📋 ${category.name}`, ""]
    for (const item of category.items) {
      if (item.type === "header") lines.push(`\n## ${item.text}`)
      else if (item.type === "text") lines.push(item.text)
      else lines.push(`${item.completed ? "✅" : "☐"} ${item.text}${item.flagged ? " 🚩" : ""}`)
    }
    const text = lines.join("\n")
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: category.name, text }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast("Copied to clipboard") }
      catch { toast.error("Share not supported on this device") }
    }
  }

  const sortLabels: Record<SortOrder, string> = {
    default: "Default", flagged: "Flagged first", incomplete: "Incomplete first", alpha: "A → Z",
  }

  const { incompleteItems, completedItems, todoTotal, todoRemaining } = useMemo(() => {
    const sortItems = (items: TodoItem[]) => {
      switch (sortOrder) {
        case "flagged": return [...items].sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0))
        case "incomplete": return [...items].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0))
        case "alpha": return [...items].sort((a, b) => a.text.localeCompare(b.text))
        default: return items
      }
    }
    return {
      incompleteItems: sortItems(category.items.filter(item => item.type !== "todo" || !item.completed)),
      completedItems: sortItems(category.items.filter(item => item.type === "todo" && item.completed)),
      todoTotal: category.items.filter(i => i.type === "todo").length,
      todoRemaining: category.items.filter(i => i.type === "todo" && !i.completed).length,
    }
  }, [category.items, sortOrder])

  // No renderRows — use SortableItemList component below

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        {/* Back — 44px tap target */}
        <button
          onClick={onBack}
          className="flex items-center justify-center w-11 h-11 rounded-full text-primary active:bg-secondary transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Color dot — tap to change */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowColorPicker(s => !s)}
              className="w-6 h-6 rounded-full border-2 border-white/30 shadow-sm active:scale-90 transition-transform"
              style={{ backgroundColor: category.color }}
              aria-label="Change color"
            />
            {showColorPicker && (
              <div className="absolute top-8 left-0 bg-card rounded-2xl shadow-xl border border-border p-3 z-20 flex flex-wrap gap-2 w-52">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => { onUpdateCategory({ ...category, color }); setShowColorPicker(false) }}
                    className="w-10 h-10 rounded-full transition-transform active:scale-90"
                    style={{ backgroundColor: color, boxShadow: category.color === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : undefined }}
                  />
                ))}
              </div>
            )}
          </div>

          {editingTitle ? (
            <Input
              autoFocus
              value={editTitleText}
              onChange={(e) => setEditTitleText(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={handleTitleKeyDown}
              className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-lg font-semibold"
            />
          ) : (
            <h1
              onClick={() => { setEditTitleText(category.name); setEditingTitle(true) }}
              className="text-lg font-semibold cursor-pointer hover:opacity-70 transition-opacity truncate"
            >
              {category.name}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {todoTotal > 0 && (
            <span className={cn("text-sm font-medium px-2", todoRemaining === 0 ? "text-green-500" : "text-muted-foreground")}>
              {todoRemaining === 0 ? "✓ Done" : `${todoRemaining} left`}
            </span>
          )}
          {/* Select mode toggle — 44px tap target */}
          {todoTotal > 0 && (
            <button
              onClick={() => {
                if (selectMode) { exitSelectMode() } else { haptics.medium(); setSelectMode(true); setSelectedIds(new Set()); setAddMenuOpen(false) }
              }}
              className={cn(
                "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
                selectMode ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-foreground"
              )}
              aria-label={selectMode ? "Exit select mode" : "Select items"}
            >
              <CheckSquare className="w-4 h-4" />
            </button>
          )}
          {/* Delete note — 44px tap target */}
          <button
            onClick={handleDeleteNote}
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
              confirmDeleteNote ? "text-destructive bg-destructive/10" : "text-muted-foreground/40 hover:text-destructive"
            )}
            aria-label={confirmDeleteNote ? "Tap again to delete note" : "Delete note"}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Items List ── */}
      <div className="flex-1 overflow-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {incompleteItems.length > 0 && (
          <div className="divide-y divide-border/50">
            <SortableItemList
              items={incompleteItems}
              categoryColor={category.color}
              activeDragId={activeDragId}
              highlightedItemId={highlightedItemId}
              allItems={category.items}
              sensors={sensors}
              onDragStart={handleItemDragStart}
              onDragEnd={handleItemDragEnd}
              onToggleComplete={handleToggleComplete}
              onToggleFlag={handleToggleFlag}
              onToggleRecurring={handleToggleRecurring}
              onDelete={handleDeleteItem}
              onUpdateText={handleUpdateText}
              onUpdateDueDate={handleUpdateDueDate}
              onMove={(id) => { haptics.light(); setMovingItemId(id) }}
              onArchive={(id) => { haptics.medium(); onArchiveItem(id) }}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onLongPress={enterSelectMode}
              onToggleSelect={toggleSelectItem}
            />
          </div>
        )}

        {completedItems.length > 0 && (
          <div className="mt-6">
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Completed ({completedItems.length})
              </p>
            </div>
            <div className="divide-y divide-border/50 opacity-60">
              {completedItems.map(item => (
                <NoteItemRow
                  key={item.id}
                  item={item}
                  categoryColor={category.color}
                  sortable={false}
                  onToggleComplete={() => handleToggleComplete(item.id)}
                  onToggleFlag={() => handleToggleFlag(item.id)}
                  onToggleRecurring={() => handleToggleRecurring(item.id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  onUpdateText={(text) => handleUpdateText(item.id, text)}
                  onUpdateDueDate={(date) => handleUpdateDueDate(item.id, date)}
                  onArchive={() => { haptics.medium(); onArchiveItem(item.id) }}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(item.id)}
                  onLongPress={() => enterSelectMode(item.id)}
                  onToggleSelect={() => toggleSelectItem(item.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {category.items.length === 0 && !addingType && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-sm"
              style={{ backgroundColor: category.color + "18" }}
            >
              <ListTodo className="w-9 h-9" style={{ color: category.color }} />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">Nothing here yet</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
              Tap <span className="font-semibold text-foreground">+</span> below to add your first todo, header, or note.
            </p>
            <div className="flex items-center gap-1.5 mt-5 text-xs text-muted-foreground/60">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tip: long-press any item to select multiple</span>
            </div>
          </div>
        )}

        {addingType && (
          <div className="border-t border-border bg-card animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-5 flex items-center justify-center text-muted-foreground">
                {addingType === "header" && <Heading className="w-4 h-4" />}
                {addingType === "text" && <AlignLeft className="w-4 h-4" />}
                {addingType === "todo" && <CheckSquare className="w-4 h-4" />}
              </div>
              <Input
                autoFocus
                placeholder={addingType === "header" ? "Header text..." : addingType === "text" ? "Note text..." : "Todo item..."}
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300)}
                className={cn(
                  "flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50",
                  addingType === "header" ? "text-base font-semibold" : "text-sm"
                )}
              />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setAddingType(null); setNewItemText("") }}
                  className="h-9 px-3 text-muted-foreground">Cancel</Button>
                <Button size="sm" onClick={commitNewItem} disabled={!newItemText.trim()} className="h-9 px-4">Add</Button>
              </div>
            </div>
            {addingType === "todo" && (
              <div className="flex items-center gap-2 px-4 pb-3">
                <span className="text-xs text-muted-foreground">Due date:</span>
                <input
                  type="date"
                  value={newItemDueDate}
                  onChange={e => setNewItemDueDate(e.target.value)}
                  className="text-xs bg-transparent border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                {newItemDueDate && (
                  <button onClick={() => setNewItemDueDate("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky Bottom Toolbar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/90 backdrop-blur-xl px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {selectMode ? (
            /* ── Bulk action bar ── */
            <>
              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Select all todos"
                >
                  <Square className="w-3.5 h-3.5" />
                  All
                </button>
                <button
                  onClick={handleBulkComplete}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20 disabled:opacity-40 transition-colors"
                  title="Mark selected complete"
                >
                  <CheckCheck className="w-4 h-4" />
                  Done
                </button>
                <button
                  onClick={handleBulkFlag}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                  title="Toggle flag on selected"
                >
                  <Flag className="w-4 h-4" />
                  Flag
                </button>
                <button
                  onClick={() => { haptics.light(); setShowBulkMoveSheet(true) }}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
                  title="Move selected to another note"
                >
                  <FolderInput className="w-4 h-4" />
                  Move
                </button>
                <button
                  onClick={handleBulkArchive}
                  disabled={selectedIds.size === 0 || !Array.from(selectedIds).some(id => { const item = category.items.find(i => i.id === id); return item?.type === "todo" && item.completed })}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs bg-accent/20 text-accent-foreground hover:bg-accent/30 disabled:opacity-40 transition-colors"
                  title="Archive selected completed items"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 transition-colors"
                  title="Delete selected"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          ) : (
            /* ── Normal toolbar ── */
            <>
              <div className="flex items-center gap-1">
                {/* Sort button — opens bottom sheet */}
                <button
                  onClick={() => { haptics.light(); setShowSortMenu(s => !s) }}
                  className={cn(
                    "flex items-center gap-1.5 h-10 px-3 rounded-xl transition-colors",
                    sortOrder !== "default" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span className="text-xs">{sortLabels[sortOrder]}</span>
                </button>

                {/* Share button */}
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Share note"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="text-xs">Share</span>
                </button>
              </div>

              {/* Add button — 48px, prominent */}
              <div className="relative">
                <button
                  onClick={() => { haptics.light(); setAddMenuOpen(prev => !prev) }}
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
                  aria-label="Add item"
                >
                  <Plus className="w-6 h-6" />
                </button>
                {addMenuOpen && (
                  <div className="absolute bottom-14 right-0 bg-card rounded-2xl shadow-xl border border-border overflow-hidden w-48 animate-in fade-in slide-in-from-bottom-2">
                    {[
                      { type: "header" as ItemType, icon: <Heading className="w-4 h-4 text-muted-foreground" />, label: "Header" },
                      { type: "text" as ItemType, icon: <AlignLeft className="w-4 h-4 text-muted-foreground" />, label: "Text" },
                      { type: "todo" as ItemType, icon: <CheckSquare className="w-4 h-4 text-muted-foreground" />, label: "Todo" },
                    ].map(({ type, icon, label }, i, arr) => (
                      <button
                        key={type}
                        onClick={() => startAdding(type)}
                        className={cn(
                          "flex items-center gap-3 w-full px-4 py-4 text-sm hover:bg-secondary/50 active:bg-secondary transition-colors",
                          i < arr.length - 1 && "border-b border-border"
                        )}
                      >
                        {icon}<span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Selection count indicator */}
        {selectMode && (
          <div className="max-w-lg mx-auto pt-1 pb-0.5">
            <p className="text-center text-xs text-muted-foreground">
              {selectedIds.size === 0 ? "Tap items to select" : `${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} selected`}
            </p>
          </div>
        )}
      </div>

      {/* ── Move to Category Sheet ── */}
      {movingItemId && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setMovingItemId(null)}
          />
          <div
            className="relative bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 pb-3">Move to note</p>
            {allCategories
              .filter(c => c.id !== category.id)
              .sort((a, b) => a.priority - b.priority)
              .map(cat => (
                <button
                  key={cat.id}
                  onClick={() => {
                    haptics.success()
                    onMoveItem(movingItemId, cat.id)
                    setMovingItemId(null)
                  }}
                  className="flex items-center gap-3 w-full px-5 py-4 text-base transition-colors active:bg-secondary border-b border-border last:border-0 text-left"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
                    <div className="w-4 h-4 rounded-md" style={{ backgroundColor: cat.color }} />
                  </div>
                  <span className="font-medium">{cat.name}</span>
                </button>
              ))}
            {allCategories.filter(c => c.id !== category.id).length === 0 && (
              <p className="px-5 py-4 text-sm text-muted-foreground">No other notes to move to.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk Move Sheet ── */}
      {showBulkMoveSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowBulkMoveSheet(false)}
          />
          <div
            className="relative bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 pb-3">
              Move {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} to note
            </p>
            {allCategories
              .filter(c => c.id !== category.id)
              .sort((a, b) => a.priority - b.priority)
              .map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleBulkMove(cat.id)}
                  className="flex items-center gap-3 w-full px-5 py-4 text-base transition-colors active:bg-secondary border-b border-border last:border-0 text-left"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
                    <div className="w-4 h-4 rounded-md" style={{ backgroundColor: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              ))}
            {allCategories.filter(c => c.id !== category.id).length === 0 && (
              <p className="px-5 py-4 text-sm text-muted-foreground">No other notes to move to.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sort Bottom Sheet ── */}
      {showSortMenu && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowSortMenu(false)}
          />
          {/* Sheet */}
          <div
            className="relative bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 pb-2">Sort order</p>
            {(["default", "flagged", "incomplete", "alpha"] as SortOrder[]).map(opt => (
              <button
                key={opt}
                onClick={() => { haptics.light(); setSortOrder(opt); setShowSortMenu(false) }}
                className={cn(
                  "flex items-center justify-between w-full px-5 py-4 text-base transition-colors active:bg-secondary border-b border-border last:border-0",
                  sortOrder === opt ? "text-primary font-semibold" : "text-foreground"
                )}
              >
                <span>{sortLabels[opt]}</span>
                {sortOrder === opt && (
                  <span className="text-primary text-lg">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SortableItemList — proper component, not a render function ───────────────

interface SortableItemListProps {
  items: TodoItem[]
  categoryColor: string
  activeDragId: string | null
  highlightedItemId: string | null
  allItems: TodoItem[]
  sensors: ReturnType<typeof useSensors>
  onDragStart: (e: DragStartEvent) => void
  onDragEnd: (e: DragEndEvent) => void
  onToggleComplete: (id: string) => void
  onToggleFlag: (id: string) => void
  onToggleRecurring: (id: string) => void
  onDelete: (id: string) => void
  onUpdateText: (id: string, text: string) => void
  onUpdateDueDate: (id: string, date: string) => void
  onMove: (id: string) => void
  onArchive: (id: string) => void
  selectMode: boolean
  selectedIds: Set<string>
  onLongPress: (id: string) => void
  onToggleSelect: (id: string) => void
}

function SortableItemList({
  items, categoryColor, activeDragId, highlightedItemId, allItems, sensors,
  onDragStart, onDragEnd,
  onToggleComplete, onToggleFlag, onToggleRecurring, onDelete,
  onUpdateText, onUpdateDueDate, onMove, onArchive,
  selectMode, selectedIds, onLongPress, onToggleSelect,
}: SortableItemListProps) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <NoteItemRow
            key={item.id}
            item={item}
            categoryColor={categoryColor}
            sortable
            highlighted={highlightedItemId === item.id}
            onToggleComplete={() => onToggleComplete(item.id)}
            onToggleFlag={() => onToggleFlag(item.id)}
            onToggleRecurring={() => onToggleRecurring(item.id)}
            onDelete={() => onDelete(item.id)}
            onUpdateText={(text) => onUpdateText(item.id, text)}
            onUpdateDueDate={(date) => onUpdateDueDate(item.id, date)}
            onMove={item.type === "todo" ? () => onMove(item.id) : undefined}
            onArchive={item.type === "todo" && item.completed ? () => onArchive(item.id) : undefined}
            selectMode={selectMode}
            isSelected={selectedIds.has(item.id)}
            onLongPress={() => onLongPress(item.id)}
            onToggleSelect={() => onToggleSelect(item.id)}
          />
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeDragId ? (
          <NoteItemRow
            item={allItems.find(i => i.id === activeDragId)!}
            categoryColor={categoryColor}
            sortable
            isOverlay
            onToggleComplete={() => {}}
            onToggleFlag={() => {}}
            onToggleRecurring={() => {}}
            onDelete={() => {}}
            onUpdateText={() => {}}
            onUpdateDueDate={() => {}}
            selectMode={false}
            isSelected={false}
            onLongPress={() => {}}
            onToggleSelect={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ─── NoteItemRow ──────────────────────────────────────────────────────────────

interface NoteItemRowProps {
  item: TodoItem
  categoryColor: string
  sortable?: boolean
  isOverlay?: boolean
  highlighted?: boolean
  onToggleComplete: () => void
  onToggleFlag: () => void
  onToggleRecurring: () => void
  onDelete: () => void
  onUpdateText: (text: string) => void
  onUpdateDueDate: (date: string) => void
  onMove?: () => void
  onArchive?: () => void
  selectMode?: boolean
  isSelected?: boolean
  onLongPress?: () => void
  onToggleSelect?: () => void
}

function NoteItemRow({
  item, categoryColor, sortable = false, isOverlay, highlighted,
  onToggleComplete, onToggleFlag, onToggleRecurring, onDelete,
  onUpdateText, onUpdateDueDate, onMove, onArchive,
  selectMode = false, isSelected = false, onLongPress, onToggleSelect,
}: NoteItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !sortable || selectMode })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
  }
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(item.text)
  const [editingDate, setEditingDate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchIsHorizontal = useRef<boolean | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasVibratedSwipe = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipeDirection = useRef<"left" | "right" | null>(null)

  useEffect(() => {
    if (confirmDelete) {
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 2000)
    }
    return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }
  }, [confirmDelete])

  const commitEdit = () => {
    if (editText.trim()) onUpdateText(editText.trim())
    else setEditText(item.text)
    setEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit()
    if (e.key === "Escape") { setEditText(item.text); setEditing(false) }
  }

  const handleDelete = () => {
    if (confirmDelete) {
      haptics.heavy()
      onDelete()
    } else {
      haptics.medium()
      setConfirmDelete(true)
    }
  }

  // Long-press to enter select mode
  const handleRowTouchStart = (e: React.TouchEvent) => {
    if (selectMode) return
    longPressTimer.current = setTimeout(() => {
      onLongPress?.()
    }, 500)
    // Also run swipe logic
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchIsHorizontal.current = null
    hasVibratedSwipe.current = false
  }

  // Swipe-to-delete — only activates on horizontal swipe, cancels drag
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchIsHorizontal.current = null
    hasVibratedSwipe.current = false
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long-press if user moves finger
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    // Determine direction on first significant movement
    if (touchIsHorizontal.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      touchIsHorizontal.current = Math.abs(dx) > Math.abs(dy)
    }

    // Only handle horizontal swipes — vertical is scroll/drag
    if (!touchIsHorizontal.current) return
    if (selectMode) return // no swipe in select mode

    if (swipeDirection.current === null) {
      swipeDirection.current = dx < 0 ? "left" : "right"
    }

    if (swipeDirection.current === "left") {
      // Left swipe → delete (red, right side)
      const newOffset = Math.max(-80, dx)
      if (newOffset <= -40 && !hasVibratedSwipe.current) {
        haptics.medium()
        hasVibratedSwipe.current = true
      }
      setSwipeOffset(newOffset)
    } else if (swipeDirection.current === "right" && item.type === "todo" && !item.completed) {
      // Right swipe → complete (green, left side)
      const newOffset = Math.min(80, dx)
      if (newOffset >= 40 && !hasVibratedSwipe.current) {
        haptics.success()
        hasVibratedSwipe.current = true
      }
      setSwipeOffset(newOffset)
    }
  }
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (!selectMode) {
      if (swipeDirection.current === "left") {
        setSwipeOffset(swipeOffset < -40 ? -80 : 0)
      } else if (swipeDirection.current === "right" && swipeOffset >= 40) {
        onToggleComplete()
        setSwipeOffset(0)
      } else {
        setSwipeOffset(0)
      }
    }
    touchStartX.current = null
    touchStartY.current = null
    touchIsHorizontal.current = null
    swipeDirection.current = null
  }

  const today = new Date().toISOString().split("T")[0]
  const isOverdue = item.dueDate && item.dueDate < today && !item.completed
  const isDueToday = item.dueDate === today && !item.completed

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      data-item-id={item.id}
      className={cn(
        "relative overflow-hidden",
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "shadow-2xl rounded-xl opacity-95 scale-[1.02]",
        isSelected && "bg-primary/5"
      )}
      onTouchStart={handleRowTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Right-swipe complete background (green, left side) */}
      {!selectMode && item.type === "todo" && !item.completed && (
        <div
          className="absolute inset-y-0 left-0 w-20 flex items-center justify-center bg-green-500"
          style={{ opacity: swipeOffset > 0 ? Math.min(1, swipeOffset / 40) : 0 }}
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      {/* Left-swipe delete background (red, right side) */}
      {!selectMode && (
        <div
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-destructive"
          style={{ opacity: swipeOffset < 0 ? Math.min(1, Math.abs(swipeOffset) / 40) : 0 }}
        >
          <Trash2 className="w-5 h-5 text-white" />
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 bg-card transition-all select-none",
          highlighted && "bg-primary/10",
          isSelected && "bg-primary/8"
        )}
        style={{ transform: selectMode ? undefined : `translateX(${swipeOffset}px)` }}
        onClick={() => {
          if (selectMode) { onToggleSelect?.(); return }
          if (swipeOffset !== 0) setSwipeOffset(0)
        }}
      >
        {/* Select checkbox (select mode) OR grip handle (normal mode) */}
        {selectMode ? (
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-11">
            {item.type === "todo" ? (
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
              )}>
                {isSelected && <span className="text-primary-foreground text-[10px] font-bold">✓</span>}
              </div>
            ) : (
              <div className="w-5 h-5 rounded border-2 border-muted-foreground/20" />
            )}
          </div>
        ) : sortable ? (
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center w-8 h-11 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-2 flex-shrink-0" />
        )}

        {/* Checkbox / indicator — 44px tap target */}
        <div className="flex-shrink-0 flex items-center justify-center w-11 h-11">
          {item.type === "todo" && !selectMode && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                if (!item.completed) {
                  setJustCompleted(true)
                  setTimeout(() => setJustCompleted(false), 600)
                }
                onToggleComplete()
              }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!item.completed) { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600) } onToggleComplete() } }}
              className={cn(
                "flex items-center justify-center w-11 h-11 rounded-full transition-all duration-150 cursor-pointer",
                justCompleted && "scale-125",
                !justCompleted && "active:bg-secondary/50"
              )}
              aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
            >
              <Checkbox
                checked={item.completed}
                className={cn(
                  "h-5 w-5 rounded-full border-2 pointer-events-none transition-all duration-300",
                  justCompleted && "scale-110"
                )}
                style={{ borderColor: categoryColor }}
              />
            </div>
          )}
          {item.type === "todo" && selectMode && <div className="w-11 h-11" />}
          {item.type === "header" && <div className="w-1 h-4 rounded-full" style={{ backgroundColor: categoryColor }} />}
          {item.type === "text" && <AlignLeft className="w-3.5 h-3.5 text-muted-foreground/30" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-2">
          {editing && !selectMode ? (
            item.type === "text" ? (
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Escape") { setEditText(item.text); setEditing(false) } }}
                rows={3}
                className="w-full bg-transparent text-sm text-muted-foreground leading-relaxed resize-none focus:outline-none p-0 border-0"
              />
            ) : (
              <Input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                className={cn(
                  "border-0 bg-transparent p-0 h-auto focus-visible:ring-0",
                  item.type === "header" && "text-base font-semibold",
                  item.type === "todo" && "text-sm"
                )}
              />
            )
          ) : (
            <div className="flex items-center gap-1.5 group">
              <p
                onClick={(e) => {
                  if (selectMode) return
                  e.stopPropagation()
                  setEditText(item.text)
                  setEditing(true)
                }}
                className={cn(
                  "leading-snug flex-1",
                  !selectMode && "cursor-pointer select-none",
                  item.type === "header" && "text-base font-semibold tracking-tight",
                  item.type === "text" && "text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap",
                  item.type === "todo" && "text-sm",
                  item.type === "todo" && item.completed && "line-through text-muted-foreground"
                )}
              >
                {item.text}
              </p>
              {/* Edit affordance — subtle pencil shown on hover/focus, not in select mode */}
              {!selectMode && !item.completed && (
                <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/30 transition-colors flex-shrink-0" />
              )}
            </div>
          )}

          {item.type === "todo" && (
            <div className="mt-0.5">
              {editingDate ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="date"
                    defaultValue={item.dueDate ?? ""}
                    onBlur={(e) => { onUpdateDueDate(e.target.value); setEditingDate(false) }}
                    onKeyDown={(e) => { if (e.key === "Escape") setEditingDate(false) }}
                    className="text-xs bg-transparent border border-border rounded px-1 py-0.5 text-foreground focus:outline-none"
                  />
                  {item.dueDate && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); onUpdateDueDate(""); setEditingDate(false) }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
                      aria-label="Clear due date"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : item.dueDate ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingDate(true)}
                    className={cn(
                      "flex items-center gap-1 text-xs py-0.5",
                      isOverdue && "text-red-500 font-medium",
                      isDueToday && "text-orange-500 font-medium",
                      !isOverdue && !isDueToday && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="w-3 h-3" />
                    {isOverdue ? "Overdue · " : isDueToday ? "Due today · " : "Due "}{item.dueDate}
                  </button>
                  {/* Add to Google Calendar — opens gcal URL in browser */}
                  <a
                    href={(() => {
                      const dateStr = item.dueDate.replace(/-/g, "")
                      const d = new Date(item.dueDate + "T00:00:00")
                      d.setDate(d.getDate() + 1)
                      const endStr = d.toISOString().slice(0, 10).replace(/-/g, "")
                      const title = encodeURIComponent(item.text)
                      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${endStr}&details=Added+from+Notes+app`
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); haptics.light() }}
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors py-0.5"
                    title="Add to Google Calendar"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>GCal</span>
                  </a>
                </div>
              ) : (
                <button
                  onClick={() => setEditingDate(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-0.5"
                >
                  <CalendarDays className="w-3 h-3" />
                  <span>Add due date</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right actions — all 44px tap targets */}
        <div className="flex items-center flex-shrink-0">
          {item.type === "todo" && (
            <>
              {/* Recurring toggle — 44px */}
              <button
                onClick={onToggleRecurring}
                className={cn(
                  "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
                  item.recurring
                    ? "text-green-500 active:bg-green-500/10"
                    : "text-muted-foreground/30 active:bg-secondary"
                )}
                aria-label={item.recurring ? "Remove daily goal" : "Make daily goal"}
              >
                <RefreshCw className={cn("w-4 h-4", item.recurring && "stroke-[2.5]")} />
              </button>
              {/* Flag — 44px, only if not recurring */}
              {!item.recurring && (
                <button
                  onClick={onToggleFlag}
                  className={cn(
                    "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
                    item.flagged
                      ? "text-amber-500 active:bg-amber-500/10"
                      : "text-muted-foreground/30 active:bg-secondary"
                  )}
                  aria-label={item.flagged ? "Unflag" : "Flag"}
                >
                  <Flag className={cn("w-4 h-4", item.flagged && "fill-current")} />
                </button>
              )}
              {/* Archive — 44px, only for completed items */}
              {onArchive && item.completed && (
                <button
                  onClick={(e) => { e.stopPropagation(); onArchive() }}
                  className="flex items-center justify-center w-11 h-11 rounded-full transition-colors text-muted-foreground/30 active:bg-accent/20 active:text-accent-foreground hover:text-muted-foreground"
                  aria-label="Archive item"
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}
              {/* Move to category — 44px */}
              {onMove && (
                <button
                  onClick={onMove}
                  className="flex items-center justify-center w-11 h-11 rounded-full transition-colors text-muted-foreground/30 active:bg-secondary active:text-foreground"
                  aria-label="Move to another note"
                >
                  <FolderInput className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {/* Delete — 44px */}
          <button
            onClick={handleDelete}
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
              confirmDelete
                ? "text-destructive bg-destructive/10"
                : "text-muted-foreground/30 active:bg-destructive/10 active:text-destructive"
            )}
            aria-label={confirmDelete ? "Tap again to confirm delete" : "Delete item"}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {swipeOffset <= -80 && (
        <button
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  )
}
