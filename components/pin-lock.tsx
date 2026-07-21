"use client"

import { useState, useEffect, useCallback } from "react"
import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptics } from "@/lib/haptics"

const PIN_HASH_KEY = "app-pin-hash"
const PIN_ENABLED_KEY = "app-pin-enabled"

// Simple SHA-256 hash using Web Crypto API
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + "notes-app-salt-2024")
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function setPinEnabled(pin: string): Promise<void> {
  const hash = await hashPin(pin)
  localStorage.setItem(PIN_HASH_KEY, hash)
  localStorage.setItem(PIN_ENABLED_KEY, "true")
}

export function disablePin(): void {
  localStorage.removeItem(PIN_HASH_KEY)
  localStorage.removeItem(PIN_ENABLED_KEY)
}

export function isPinEnabled(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(PIN_ENABLED_KEY) === "true"
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY)
  if (!stored) return false
  const hash = await hashPin(pin)
  return hash === stored
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

interface PinLockProps {
  mode: "unlock" | "setup" | "confirm"
  title?: string
  subtitle?: string
  onSuccess: (pin: string) => void
  onCancel?: () => void
}

export function PinPad({ mode, title, subtitle, onSuccess, onCancel }: PinLockProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState("")
  const [shake, setShake] = useState(false)

  const handleDigit = useCallback((d: string) => {
    if (digits.length >= 4) return
    haptics.light()
    const next = [...digits, d]
    setDigits(next)
    setError("")

    if (next.length === 4) {
      const pin = next.join("")
      setTimeout(async () => {
        if (mode === "unlock") {
          const ok = await verifyPin(pin)
          if (ok) {
            haptics.success()
            onSuccess(pin)
          } else {
            haptics.heavy()
            setShake(true)
            setError("Incorrect PIN")
            setTimeout(() => { setDigits([]); setShake(false) }, 600)
          }
        } else {
          // setup / confirm — just pass the PIN up
          onSuccess(pin)
          setDigits([])
        }
      }, 100)
    }
  }, [digits, mode, onSuccess])

  const handleDelete = () => {
    if (digits.length === 0) return
    haptics.light()
    setDigits(prev => prev.slice(0, -1))
    setError("")
  }

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"]

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background px-8 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-xs flex flex-col items-center gap-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{title ?? "Enter PIN"}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>

        {/* Dots */}
        <div className={cn("flex gap-4", shake && "animate-[shake_0.5s_ease-in-out]")}>
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all duration-150",
                i < digits.length
                  ? "bg-primary border-primary scale-110"
                  : "border-muted-foreground/40"
              )}
            />
          ))}
        </div>

        {/* Error */}
        <div className="h-5">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {keys.map((key, i) => {
            if (key === "") return <div key={i} />
            if (key === "⌫") {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  className="flex items-center justify-center h-16 rounded-2xl bg-secondary active:bg-secondary/60 transition-colors"
                  aria-label="Delete"
                >
                  <Delete className="w-5 h-5 text-foreground" />
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(key)}
                className="flex items-center justify-center h-16 rounded-2xl bg-card border border-border text-xl font-semibold active:bg-secondary transition-colors shadow-sm"
              >
                {key}
              </button>
            )
          })}
        </div>

        {/* Cancel */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-muted-foreground py-2 px-4"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Lock Screen (full-screen overlay) ───────────────────────────────────────

interface LockScreenProps {
  onUnlock: () => void
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-background">
      <PinPad
        mode="unlock"
        title="Notes"
        subtitle="Enter your PIN to continue"
        onSuccess={onUnlock}
      />
    </div>
  )
}
