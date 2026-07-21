"use client"

import { useState, useCallback, useRef } from "react"
import { X, Upload, ChevronRight, Plus, Check, AlertCircle, Type, AlignLeft, Sparkles, Loader2, Camera, Image as ImageIcon } from "lucide-react"
import { Category, TodoItem, ItemType } from "@/lib/types"
import { generateId } from "@/lib/store"
import { parseAppleNotesText, ParsedImportItem } from "@/lib/import-parser"
import { findFuzzyDuplicates } from "@/lib/dedup"
import { haptics } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/firebase"

const PRESET_COLORS = [
  "#007AFF", "#34C759", "#FF9500", "#FF3B30",
  "#AF52DE", "#5856D6", "#FF2D55", "#00C7BE",
]

type Step = "paste" | "preview" | "assign"
type ImportMode = "manual" | "ai"

interface ImportSheetProps {
  open: boolean
  categories: Category[]
  onClose: () => void
  onImport: (categoryId: string, items: TodoItem[]) => void
  onAddCategory: (category: Category) => void
}

// ── Type badge shown in preview ──────────────────────────────────────────────
function TypeBadge({ type }: { type: ItemType }) {
  if (type === "header") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-500 bg-amber-500/10 rounded px-1 py-0.5 flex-shrink-0">
        <Type className="w-2.5 h-2.5" />H
      </span>
    )
  }
  if (type === "text") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-secondary rounded px-1 py-0.5 flex-shrink-0">
        <AlignLeft className="w-2.5 h-2.5" />T
      </span>
    )
  }
  return null
}

export function ImportSheet({ open, categories, onClose, onImport, onAddCategory }: ImportSheetProps) {
  const [step, setStep] = useState<Step>("paste")
  const [importMode, setImportMode] = useState<ImportMode>("ai")
  const [rawText, setRawText] = useState("")
  const [items, setItems] = useState<ParsedImportItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  )
  // AI suggested category
  const [aiSuggestedCategory, setAiSuggestedCategory] = useState<string>("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Image import
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // New category inline creation
  const [creatingNew, setCreatingNew] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])

  const reset = useCallback(() => {
    setStep("paste")
    setRawText("")
    setItems([])
    setCreatingNew(false)
    setNewCatName("")
    setNewCatColor(PRESET_COLORS[0])
    setSelectedCategoryId(categories[0]?.id ?? null)
    setAiSuggestedCategory("")
    setAiError(null)
    setAiLoading(false)
    setImagePreview(null)
    setImageBase64(null)
    setImageMimeType("image/jpeg")
  }, [categories])

  const handleClose = () => {
    reset()
    onClose()
  }

  // ── Step 1 → 2: manual parse ─────────────────────────────────────────────
  const handleParse = () => {
    if (!rawText.trim()) return
    haptics.light()
    const parsed = parseAppleNotesText(rawText)
    if (parsed.length === 0) return
    // Fuzzy + cross-category duplicate check
    const dupeMap = findFuzzyDuplicates(parsed.map(i => i.text), categories)
    const withDupes = parsed.map(i => {
      const dupe = dupeMap.get(i.text)
      return dupe ? { ...i, selected: false, duplicate: dupe } : i
    })
    setItems(withDupes)
    setStep("preview")
  }

  // ── Handle image file selection (resize to max 1024px before sending) ──────
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const MAX = 1024
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
        const resized = canvas.toDataURL("image/jpeg", 0.85)
        setImageBase64(resized.split(",")[1])
        setImageMimeType("image/jpeg")
        setImagePreview(resized)
        setRawText("")
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImagePreview(null)
    setImageBase64(null)
    setImageMimeType("image/jpeg")
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
  }

  // ── Step 1 → 2: AI auto-categorize (text or image) ──────────────────────
  const handleAiCategorize = async () => {
    if (!rawText.trim() && !imageBase64) return
    haptics.light()
    setAiLoading(true)
    setAiError(null)

    try {
      // Get Firebase ID token for auth
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error("Not signed in")
      const idToken = await currentUser.getIdToken()

      const body = imageBase64
        ? { imageBase64, imageMimeType, existingCategories: categories.map(c => c.name) }
        : { text: rawText, existingCategories: categories.map(c => c.name) }

      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json() as {
        suggestedCategory: string
        items: { text: string; type: ItemType; completed: boolean }[]
      }

      // Run fuzzy duplicate check client-side
      const rawParsed = data.items.filter(i => i.text?.trim()).map(i => i.text.trim())
      const fuzzyDupes = findFuzzyDuplicates(rawParsed, categories)

      const parsed: ParsedImportItem[] = data.items
        .filter(i => i.text?.trim())
        .map(i => {
          const text = i.text.trim()
          const dupe = fuzzyDupes.get(text)
          return {
            id: `ai-${crypto.randomUUID()}`,
            text,
            type: i.type ?? "todo",
            completed: i.completed ?? false,
            selected: !dupe,
            duplicate: dupe,
          }
        })

      if (parsed.length === 0) throw new Error("No items returned from AI")

      setItems(parsed)
      setAiSuggestedCategory(data.suggestedCategory ?? "")

      // Pre-select the suggested category if it matches an existing one
      const match = categories.find(
        c => c.name.toLowerCase() === data.suggestedCategory?.toLowerCase()
      )
      if (match) {
        setSelectedCategoryId(match.id)
      } else {
        // Will create new category with suggested name
        setSelectedCategoryId(null)
        setNewCatName(data.suggestedCategory ?? "")
        setNewCatColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
      }

      setStep("preview")
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI categorization failed")
    } finally {
      setAiLoading(false)
    }
  }

  // ── Toggle item selection ────────────────────────────────────────────────
  const toggleItem = (id: string) => {
    haptics.light()
    setItems(prev => prev.map(it => it.id === id ? { ...it, selected: !it.selected } : it))
  }

  // ── Toggle item type (todo ↔ header ↔ text) ──────────────────────────────
  const cycleType = (id: string) => {
    haptics.light()
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const next: ItemType = it.type === "todo" ? "header" : it.type === "header" ? "text" : "todo"
      return { ...it, type: next }
    }))
  }

  // ── Step 2 → 3 ───────────────────────────────────────────────────────────
  const handleGoAssign = () => {
    const anySelected = items.some(i => i.selected)
    if (!anySelected) return
    haptics.light()
    setStep("assign")
  }

  // ── Create new category inline ────────────────────────────────────────────
  const handleCreateCategory = () => {
    if (!newCatName.trim()) return
    haptics.success()
    const newCat: Category = {
      id: generateId(),
      name: newCatName.trim(),
      color: newCatColor,
      priority: Date.now(),
      items: [],
    }
    onAddCategory(newCat)
    setSelectedCategoryId(newCat.id)
    setCreatingNew(false)
    setNewCatName("")
    setNewCatColor(PRESET_COLORS[0])
  }

  // ── Final import ─────────────────────────────────────────────────────────
  const handleImport = () => {
    if (!selectedCategoryId) return
    haptics.success()
    const now = new Date().toISOString()
    const todoItems: TodoItem[] = items
      .filter(i => i.selected)
      .map(i => ({
        id: generateId(),
        text: i.text,
        type: i.type,
        completed: i.completed,
        flagged: false,
        createdAt: now,
      }))
    onImport(selectedCategoryId, todoItems)
    reset()
    onClose()
  }

  if (!open) return null

  const selectedCount = items.filter(i => i.selected).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="relative bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom)] flex flex-col max-h-[90dvh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Import</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === "paste" && "Paste your note text below"}
              {step === "preview" && `${selectedCount} of ${items.length} items selected`}
              {step === "assign" && "Choose a destination note"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-5 pb-4 flex-shrink-0">
          {(["paste", "preview", "assign"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={cn(
                "w-2 h-2 rounded-full transition-colors",
                step === s ? "bg-primary" : i < ["paste","preview","assign"].indexOf(step) ? "bg-primary/40" : "bg-border"
              )} />
              {i < 2 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-1 capitalize">{step}</span>
        </div>

        {/* ── STEP 1: Paste ── */}
        {step === "paste" && (
          <div className="flex flex-col flex-1 overflow-hidden px-5 pb-5 gap-4">

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
            />

            {/* Image preview OR text area */}
            {imagePreview ? (
              <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden border border-border bg-secondary/40 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Selected" className="w-full object-contain max-h-[240px]" />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <textarea
                className="flex-1 min-h-[160px] w-full rounded-xl bg-secondary/60 border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground font-mono"
                placeholder={"Paste your Apple Notes text here…\n\nExamples:\n• Buy groceries\n- Call dentist\n✓ Already done task\nTODAY'S GOALS\n[ ] New task"}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                autoFocus
              />
            )}

            {/* Photo import buttons (AI mode only) */}
            {importMode === "ai" && !imagePreview && (
              <div className="flex gap-2 -mt-1">
                <button
                  onClick={() => { haptics.light(); cameraInputRef.current?.click() }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-medium transition-colors border border-border"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Take Photo
                </button>
                <button
                  onClick={() => { haptics.light(); fileInputRef.current?.click() }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-medium transition-colors border border-border"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Choose Photo
                </button>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex rounded-xl bg-secondary/60 p-1 gap-1 flex-shrink-0">
              <button
                onClick={() => { setImportMode("ai"); clearImage() }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-medium transition-all",
                  importMode === "ai"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Auto with AI
              </button>
              <button
                onClick={() => { setImportMode("manual"); clearImage() }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-medium transition-all",
                  importMode === "manual"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Manual
              </button>
            </div>

            {aiError && (
              <div className="flex items-center gap-2 text-destructive text-xs px-1 -mt-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {aiError}
              </div>
            )}

            <button
              onClick={importMode === "ai" ? handleAiCategorize : handleParse}
              disabled={(!rawText.trim() && !imageBase64) || aiLoading}
              className="w-full h-14 rounded-2xl font-semibold text-base bg-primary text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {imageBase64 ? "Reading image…" : "Analyzing with AI…"}
                </>
              ) : importMode === "ai" ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  {imageBase64 ? "Extract from Image" : "Auto-Categorize"}
                </>
              ) : (
                <>
                  <ChevronRight className="w-5 h-5" />
                  Preview Items
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 2: Preview ── */}
        {step === "preview" && (
          <div className="flex flex-col flex-1 overflow-hidden px-5 pb-5 gap-3">
            {/* AI suggestion banner */}
            {importMode === "ai" && aiSuggestedCategory && (
              <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-3 py-2 flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-xs text-primary font-medium">
                  AI suggested: <span className="font-bold">&ldquo;{aiSuggestedCategory}&rdquo;</span>
                </p>
              </div>
            )}

            {/* Select all / none */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={() => { haptics.light(); setItems(p => p.map(i => i.duplicate ? i : { ...i, selected: true })) }}
                  className="text-xs text-primary font-medium"
                >All</button>
                <span className="text-muted-foreground text-xs">·</span>
                <button
                  onClick={() => { haptics.light(); setItems(p => p.map(i => ({ ...i, selected: false }))) }}
                  className="text-xs text-muted-foreground font-medium"
                >None</button>
              </div>
              <p className="text-xs text-muted-foreground">Tap to select · Tap badge to change type</p>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto rounded-xl bg-secondary/40 divide-y divide-border">
              {items.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors",
                    !item.selected && !item.duplicate && "opacity-40"
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      item.selected ? "bg-primary border-primary" : "border-border"
                    )}
                  >
                    {item.selected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </button>

                  {/* Text + duplicate warning */}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "text-sm block truncate",
                      item.type === "header" && "font-semibold",
                      item.type === "text" && "text-muted-foreground italic",
                      item.completed && "line-through text-muted-foreground"
                    )}>
                      {item.text}
                    </span>
                    {item.duplicate && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5 mt-0.5">
                        <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
                        {item.duplicate.source === "semantic"
                          ? "Similar to"
                          : item.duplicate.source === "intra-import"
                          ? "Duplicate of another imported item:"
                          : "Possible duplicate of"} &ldquo;{item.duplicate.matchedText}&rdquo;{item.duplicate.source !== "intra-import" && ` in ${item.duplicate.categoryName}`}
                      </span>
                    )}
                  </div>

                  {/* Type badge — tap to cycle */}
                  <button
                    onClick={() => cycleType(item.id)}
                    title="Tap to change type"
                    className="flex-shrink-0"
                  >
                    <TypeBadge type={item.type} />
                    {item.type === "todo" && (
                      <span className={cn(
                        "text-[10px] font-semibold rounded px-1 py-0.5",
                        item.completed
                          ? "text-green-600 bg-green-500/10"
                          : "text-primary bg-primary/10"
                      )}>
                        {item.completed ? "done" : "todo"}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {selectedCount === 0 && (
              <div className="flex items-center gap-2 text-amber-500 text-xs px-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Select at least one item to continue
              </div>
            )}

            {/* AI mode: inline destination picker so user can import without going to step 3 */}
            {importMode === "ai" && (
              <div className="flex-shrink-0 rounded-2xl bg-secondary/60 p-3 flex flex-col gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination note</p>

                {selectedCategoryId ? (
                  /* Existing category selected */
                  <div className="flex items-center gap-3">
                    {(() => {
                      const cat = categories.find(c => c.id === selectedCategoryId)
                      return cat ? (
                        <>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
                            <div className="w-3.5 h-3.5 rounded-md" style={{ backgroundColor: cat.color }} />
                          </div>
                          <span className="font-medium text-sm flex-1">{cat.name}</span>
                        </>
                      ) : null
                    })()}
                    <button
                      onClick={() => { haptics.light(); setStep("assign") }}
                      className="text-sm text-primary font-semibold px-4 py-2 bg-primary/10 rounded-xl"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  /* New category — inline creation */
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <input
                        placeholder="New note name…"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCreateCategory() }}
                        className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={() => { haptics.light(); setStep("assign") }}
                        className="text-xs text-muted-foreground font-medium px-2 py-1"
                      >
                        Pick existing
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => { haptics.light(); setNewCatColor(c) }}
                          className={cn(
                            "w-5 h-5 rounded-full transition-transform active:scale-90",
                            newCatColor === c && "scale-110 ring-2 ring-offset-1 ring-current"
                          )}
                          style={{ backgroundColor: c, color: c }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => { haptics.light(); setStep("paste") }}
                className="h-12 px-5 rounded-2xl font-medium text-sm bg-secondary text-foreground transition-all active:scale-[0.98]"
              >
                Back
              </button>
              {importMode === "ai" ? (
                <button
                  onClick={() => {
                    if (selectedCategoryId) {
                      handleImport()
                    } else {
                      // Create the new category then import
                      if (!newCatName.trim()) return
                      haptics.success()
                      const newCat: Category = {
                        id: generateId(),
                        name: newCatName.trim(),
                        color: newCatColor,
                        priority: Date.now(),
                        items: [],
                      }
                      onAddCategory(newCat)
                      setSelectedCategoryId(newCat.id)
                      // Import after state update
                      const now = new Date().toISOString()
                      const todoItems = items
                        .filter(i => i.selected)
                        .map(i => ({
                          id: generateId(),
                          text: i.text,
                          type: i.type,
                          completed: i.completed,
                          flagged: false as const,
                          createdAt: now,
                        }))
                      onImport(newCat.id, todoItems)
                      reset()
                      onClose()
                    }
                  }}
                  disabled={selectedCount === 0 || (!selectedCategoryId && !newCatName.trim())}
                  className="flex-1 h-12 rounded-2xl font-semibold text-sm bg-primary text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Import {selectedCount} Item{selectedCount !== 1 ? "s" : ""}
                </button>
              ) : (
                <button
                  onClick={handleGoAssign}
                  disabled={selectedCount === 0}
                  className="flex-1 h-12 rounded-2xl font-semibold text-sm bg-primary text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ChevronRight className="w-4 h-4" />
                  Choose Destination ({selectedCount})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Assign category ── */}
        {step === "assign" && (
          <div className="flex flex-col flex-1 overflow-hidden px-5 pb-5 gap-3">
            {/* AI suggested new category — show inline creation pre-filled */}
            {importMode === "ai" && aiSuggestedCategory && !categories.find(c => c.name.toLowerCase() === aiSuggestedCategory.toLowerCase()) && !creatingNew && (
              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <p className="text-xs text-primary font-medium">AI suggests creating a new note:</p>
                </div>
                <input
                  placeholder="Note name…"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateCategory(); if (e.key === "Escape") setNewCatName("") }}
                  className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-1 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => { haptics.light(); setNewCatColor(c) }}
                        className={cn(
                          "w-5 h-5 rounded-full transition-transform active:scale-90",
                          newCatColor === c && "scale-110 ring-2 ring-offset-1 ring-current"
                        )}
                        style={{ backgroundColor: c, color: c }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCreateCategory}
                    disabled={!newCatName.trim()}
                    className="text-xs font-semibold text-primary px-3 py-1.5 bg-primary/10 rounded-lg disabled:opacity-40"
                  >
                    Create &amp; Select
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {/* Existing categories */}
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { haptics.light(); setSelectedCategoryId(cat.id) }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
                    selectedCategoryId === cat.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-secondary/60"
                  )}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: cat.color + "20" }}
                  >
                    <div className="w-4 h-4 rounded-md" style={{ backgroundColor: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</p>
                  </div>
                  {selectedCategoryId === cat.id && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}

              {/* Create new category inline (manual) */}
              {!creatingNew ? (
                <button
                  onClick={() => { haptics.light(); setCreatingNew(true) }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-sm">New Note</span>
                </button>
              ) : (
                <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 flex flex-col gap-3">
                  <input
                    autoFocus
                    placeholder="Note name…"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateCategory(); if (e.key === "Escape") setCreatingNew(false) }}
                    className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 flex-1 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => { haptics.light(); setNewCatColor(c) }}
                          className={cn(
                            "w-5 h-5 rounded-full transition-transform active:scale-90",
                            newCatColor === c && "scale-110 ring-2 ring-offset-1 ring-current"
                          )}
                          style={{ backgroundColor: c, color: c }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setCreatingNew(false)}
                      className="text-xs text-muted-foreground px-2 py-1"
                    >Cancel</button>
                    <button
                      onClick={handleCreateCategory}
                      disabled={!newCatName.trim()}
                      className="text-xs font-semibold text-primary px-2 py-1 disabled:opacity-40"
                    >Create</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => { haptics.light(); setStep("preview") }}
                className="h-12 px-5 rounded-2xl font-medium text-sm bg-secondary text-foreground transition-all active:scale-[0.98]"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedCategoryId}
                className="flex-1 h-12 rounded-2xl font-semibold text-sm bg-primary text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import {selectedCount} Item{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
