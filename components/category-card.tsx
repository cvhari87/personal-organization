"use client"

import { ChevronRight, Flag } from "lucide-react"
import { Category } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CategoryCardProps {
  category: Category
  onClick: () => void
  isDragging?: boolean
}

export function CategoryCard({ category, onClick, isDragging }: CategoryCardProps) {
  const todoItems = category.items.filter(item => item.type === "todo")
  const completedCount = todoItems.filter(item => item.completed).length
  const totalCount = todoItems.length
  const flaggedCount = todoItems.filter(item => item.flagged && !item.completed && !item.recurring).length
  const recurringCount = todoItems.filter(item => item.recurring).length
  const progress = totalCount > 0 ? completedCount / totalCount : 0

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 px-5 py-6 bg-card rounded-2xl shadow-sm active:scale-[0.98] active:shadow-none transition-all cursor-pointer",
        isDragging && "opacity-50"
      )}
      style={{ minHeight: 104 }}
    >
      {/* Color icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: category.color + "20" }}
      >
        <div className="w-8 h-8 rounded-xl" style={{ backgroundColor: category.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-xl truncate">{category.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-base text-muted-foreground">
            {totalCount === 0 ? "No items" : `${completedCount}/${totalCount} done`}
          </span>
          {flaggedCount > 0 && (
            <span className="flex items-center gap-0.5 text-base text-accent-foreground font-medium">
              <Flag className="w-4 h-4" />
              {flaggedCount}
            </span>
          )}
          {recurringCount > 0 && (
            <span className="text-base text-green-600 font-medium">
              🔄 {recurringCount} daily
            </span>
          )}
        </div>

        {/* Mini progress bar */}
        {totalCount > 0 && (
          <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden w-full max-w-[160px]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: category.color,
              }}
            />
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-3xl font-bold text-muted-foreground/60">{totalCount}</span>
        <ChevronRight className="w-6 h-6 text-muted-foreground/50" />
      </div>
    </div>
  )
}
