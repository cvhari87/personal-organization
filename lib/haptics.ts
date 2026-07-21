/**
 * Haptic feedback utility using the Web Vibration API.
 * Works on Android. iOS Safari has limited/no support for the Vibration API,
 * but the calls are silently ignored — no errors thrown.
 */

function vibrate(pattern: number | number[]) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern)
  }
}

export const haptics = {
  /** Short tap — for toggling checkboxes, selecting items */
  light: () => vibrate(10),

  /** Medium tap — for flagging, confirming actions */
  medium: () => vibrate(20),

  /** Strong tap — for deleting, destructive actions */
  heavy: () => vibrate([30, 10, 30]),

  /** Success pattern — for completing tasks, adding items */
  success: () => vibrate([10, 50, 20]),

  /** Warning pattern — for invalid actions */
  warning: () => vibrate([20, 30, 20, 30, 20]),
}
