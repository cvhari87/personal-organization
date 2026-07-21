"use client"

import { useEffect, useState } from "react"
import { X, Download, Share } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isIOS() {
  if (typeof window === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false)
  const [showIOSPrompt, setShowIOSPrompt] = useState(false)

  useEffect(() => {
    // Don't show if already installed
    if (isInStandaloneMode()) return

    const dismissed = localStorage.getItem("pwa-install-dismissed")
    if (dismissed) return

    // iOS: show manual instructions (Safari doesn't support beforeinstallprompt)
    if (isIOS()) {
      setShowIOSPrompt(true)
      return
    }

    // Android/Chrome: listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowAndroidPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      setDeferredPrompt(null)
      setShowAndroidPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowAndroidPrompt(false)
    setShowIOSPrompt(false)
    localStorage.setItem("pwa-install-dismissed", "true")
  }

  // iOS install instructions
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in">
        <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Share className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Install on iPhone</h3>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="text-xs text-muted-foreground space-y-2 mb-3">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-primary/10 text-primary rounded-full flex items-center justify-center font-semibold text-[10px]">1</span>
              <span>Tap the <strong className="text-foreground">Share</strong> button <span className="inline-block">⎙</span> at the bottom of Safari</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-primary/10 text-primary rounded-full flex items-center justify-center font-semibold text-[10px]">2</span>
              <span>Scroll down and tap <strong className="text-foreground">"Add to Home Screen"</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 bg-primary/10 text-primary rounded-full flex items-center justify-center font-semibold text-[10px]">3</span>
              <span>Tap <strong className="text-foreground">"Add"</strong> in the top right corner</span>
            </li>
          </ol>
          <button
            onClick={handleDismiss}
            className="w-full py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            Got it
          </button>
        </div>
        {/* Arrow pointing down to Safari toolbar */}
        <div className="flex justify-center mt-1">
          <div className="w-3 h-3 bg-card border-r border-b border-border rotate-45 -mt-2" />
        </div>
      </div>
    )
  }

  // Android/Chrome install prompt
  if (showAndroidPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in">
        <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-1">Install Priority Notes</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Add to your home screen for quick access and offline use
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAndroidInstall}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
