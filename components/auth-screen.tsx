"use client"

import { useState } from "react"
import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "@/lib/firebase"
import { cn } from "@/lib/utils"

interface AuthScreenProps {
  onSignedIn: () => void
}

export function AuthScreen({ onSignedIn }: AuthScreenProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError("")
    try {
      await signInWithPopup(auth, googleProvider)
      onSignedIn()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign in failed"
      setError(msg.includes("popup-closed") ? "Sign in cancelled" : "Sign in failed — try again")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-8 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-xs flex flex-col items-center gap-8">
        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-10 h-10 text-primary-foreground fill-current">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
          </svg>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Sign in to sync your notes across all your devices
          </p>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className={cn(
            "w-full flex items-center justify-center gap-3 h-14 rounded-2xl border border-border bg-card shadow-sm text-base font-medium transition-all active:scale-95",
            loading && "opacity-60 cursor-not-allowed"
          )}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Your data is stored securely in your Google account and syncs automatically.
        </p>
      </div>
    </div>
  )
}
