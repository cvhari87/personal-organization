"use client"

import { useState, useEffect } from "react"
import { X, Bell, BellOff, Lock, LockOpen, ChevronRight, Check, LogOut, Download } from "lucide-react"
import { User } from "firebase/auth"
import { Category } from "@/lib/types"
import { cn } from "@/lib/utils"
import { haptics } from "@/lib/haptics"
import {
  requestNotificationPermission,
  getNotificationPermission,
} from "@/lib/notifications"
import {
  isPinEnabled,
  setPinEnabled,
  disablePin,
  PinPad,
} from "@/components/pin-lock"

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  user: User | null
  onSignOut: () => void
  categories: Category[]
}

type PinFlow = "idle" | "setup-new" | "setup-confirm" | "disable-verify"

export function SettingsSheet({ open, onClose, user, onSignOut, categories }: SettingsSheetProps) {
  const handleExport = () => {
    haptics.light()
    const data = JSON.stringify(categories, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [notifPermission, setNotifPermission] = useState<string>("unsupported")
  const [pinEnabled, setPinEnabledState] = useState(false)
  const [pinFlow, setPinFlow] = useState<PinFlow>("idle")
  const [pendingPin, setPendingPin] = useState("")
  const [pinMessage, setPinMessage] = useState("")

  useEffect(() => {
    if (open) {
      setNotifPermission(getNotificationPermission())
      setPinEnabledState(isPinEnabled())
      setPinFlow("idle")
      setPinMessage("")
    }
  }, [open])

  const handleRequestNotifications = async () => {
    haptics.light()
    const granted = await requestNotificationPermission()
    setNotifPermission(granted ? "granted" : "denied")
  }

  const handlePinToggle = () => {
    haptics.light()
    if (pinEnabled) {
      setPinFlow("disable-verify")
    } else {
      setPinFlow("setup-new")
    }
  }

  const handlePinSetupFirst = (pin: string) => {
    setPendingPin(pin)
    setPinFlow("setup-confirm")
  }

  const handlePinSetupConfirm = async (pin: string) => {
    if (pin !== pendingPin) {
      setPinMessage("PINs don't match — try again")
      setPinFlow("setup-new")
      setPendingPin("")
      return
    }
    await setPinEnabled(pin)
    haptics.success()
    setPinEnabledState(true)
    setPinFlow("idle")
    setPinMessage("PIN enabled ✓")
    setTimeout(() => setPinMessage(""), 2000)
  }

  const handlePinDisableVerify = (pin: string) => {
    // verifyPin is async but PinPad handles it internally for "unlock" mode
    // For disable, we re-use the unlock flow — on success we disable
    disablePin()
    haptics.success()
    setPinEnabledState(false)
    setPinFlow("idle")
    setPinMessage("PIN disabled")
    setTimeout(() => setPinMessage(""), 2000)
  }

  if (!open) return null

  // Show PIN pad flows full-screen within the sheet
  if (pinFlow === "setup-new") {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <PinPad
          mode="setup"
          title="Set PIN"
          subtitle="Choose a 4-digit PIN"
          onSuccess={handlePinSetupFirst}
          onCancel={() => setPinFlow("idle")}
        />
      </div>
    )
  }

  if (pinFlow === "setup-confirm") {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <PinPad
          mode="confirm"
          title="Confirm PIN"
          subtitle="Enter your PIN again to confirm"
          onSuccess={handlePinSetupConfirm}
          onCancel={() => { setPinFlow("idle"); setPendingPin("") }}
        />
      </div>
    )
  }

  if (pinFlow === "disable-verify") {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <PinPad
          mode="unlock"
          title="Disable PIN"
          subtitle="Enter your current PIN to disable"
          onSuccess={handlePinDisableVerify}
          onCancel={() => setPinFlow("idle")}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="px-5 pb-2 flex flex-col gap-4">

          {/* Notifications */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notifications</p>
            <div className="bg-background rounded-2xl overflow-hidden">
              {notifPermission === "unsupported" ? (
                <div className="flex items-center gap-3 px-4 py-4">
                  <BellOff className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Not supported</p>
                    <p className="text-xs text-muted-foreground">Notifications require iOS 16.4+ with app added to home screen</p>
                  </div>
                </div>
              ) : notifPermission === "granted" ? (
                <div className="flex items-center gap-3 px-4 py-4">
                  <Bell className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Notifications enabled</p>
                    <p className="text-xs text-muted-foreground">You&apos;ll be reminded about due items at 9am</p>
                  </div>
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              ) : notifPermission === "denied" ? (
                <div className="flex items-center gap-3 px-4 py-4">
                  <BellOff className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Notifications blocked</p>
                    <p className="text-xs text-muted-foreground">Enable in iOS Settings → Safari → Notifications</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleRequestNotifications}
                  className="flex items-center gap-3 px-4 py-4 w-full active:bg-secondary transition-colors"
                >
                  <Bell className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">Enable notifications</p>
                    <p className="text-xs text-muted-foreground">Get reminders for due items at 9am</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* PIN Lock */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Security</p>
            <div className="bg-background rounded-2xl overflow-hidden">
              <button
                onClick={handlePinToggle}
                className="flex items-center gap-3 px-4 py-4 w-full active:bg-secondary transition-colors"
              >
                {pinEnabled
                  ? <Lock className="w-5 h-5 text-primary flex-shrink-0" />
                  : <LockOpen className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                }
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{pinEnabled ? "PIN lock enabled" : "Enable PIN lock"}</p>
                  <p className="text-xs text-muted-foreground">
                    {pinEnabled ? "Tap to disable or change PIN" : "Protect your notes with a 4-digit PIN"}
                  </p>
                </div>
                <div className={cn(
                  "w-10 h-6 rounded-full transition-colors flex items-center px-0.5",
                  pinEnabled ? "bg-primary" : "bg-secondary"
                )}>
                  <div className={cn(
                    "w-5 h-5 rounded-full bg-white shadow transition-transform",
                    pinEnabled ? "translate-x-4" : "translate-x-0"
                  )} />
                </div>
              </button>
            </div>
            {pinMessage && (
              <p className={cn(
                "text-xs mt-2 px-1",
                pinMessage.includes("✓") || pinMessage === "PIN disabled" ? "text-green-600" : "text-destructive"
              )}>
                {pinMessage}
              </p>
            )}
          </div>

          {/* Data */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Data</p>
            <div className="bg-background rounded-2xl overflow-hidden">
              <button
                onClick={handleExport}
                className="flex items-center gap-3 px-4 py-4 w-full active:bg-secondary transition-colors"
              >
                <Download className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Export all data</p>
                  <p className="text-xs text-muted-foreground">Download a JSON backup of all your notes</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Account */}
          {user && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Account</p>
              <div className="bg-background rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">{user.displayName?.[0] ?? "?"}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => { haptics.light(); onSignOut(); onClose() }}
                  className="flex items-center gap-3 px-4 py-4 w-full active:bg-secondary transition-colors text-destructive"
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Sign out</span>
                </button>
              </div>
            </div>
          )}

          {/* App info */}
          <div className="pt-2 pb-1">
            <p className="text-xs text-muted-foreground text-center">
              Notes App · {user ? "Synced with Google account" : "Data stored locally on this device"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
