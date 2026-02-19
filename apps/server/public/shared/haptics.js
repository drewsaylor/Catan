/**
 * Haptic feedback and visual press effect module for Catan LAN.
 *
 * Provides haptic vibration (via navigator.vibrate) and visual press animation
 * for interactive elements. Gracefully degrades when haptics are unavailable.
 */

import { getSettings } from "/shared/settings.js";

// Vibration durations (ms) for each intensity level
const HAPTIC_DURATIONS = {
  light: 10,
  medium: 25,
  heavy: 50
};

// Animation class for visual press feedback
const PRESS_FEEDBACK_CLASS = "press-feedback";

/**
 * Check if the Vibration API is available.
 * @returns {boolean}
 */
function hasVibrationSupport() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * Check if haptics should be suppressed based on user settings.
 * @returns {boolean}
 */
function shouldSuppressHaptics() {
  try {
    const s = getSettings();
    if (s?.muteAll) return true;
    if (s?.lowPowerMode) return true;
    if (s?.reducedMotion) return true;
  } catch {
    // Ignore settings read errors
  }
  return false;
}

/**
 * Check if visual animations should be suppressed (reduced motion).
 * @returns {boolean}
 */
function shouldSuppressAnimation() {
  try {
    const s = getSettings();
    if (s?.reducedMotion) return true;
  } catch {
    // Ignore settings read errors
  }
  // Also check system preference directly
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
  } catch {
    // Ignore matchMedia errors
  }
  return false;
}

/**
 * Trigger a haptic vibration.
 * @param {string} type - Intensity: 'light', 'medium', or 'heavy'
 */
export function triggerHaptic(type = "medium") {
  if (!hasVibrationSupport()) return;
  if (shouldSuppressHaptics()) return;

  const duration = HAPTIC_DURATIONS[type];
  if (typeof duration !== "number" || duration <= 0) return;

  try {
    navigator.vibrate(duration);
  } catch {
    // Ignore: vibration may be blocked by browser or device
  }
}

/**
 * Apply a visual press effect (scale animation) to an element.
 * Respects reduced-motion preference.
 * @param {Element|null} element - The element to animate
 */
export function animatePressEffect(element) {
  if (!element || !(element instanceof Element)) return;
  if (shouldSuppressAnimation()) return;

  // Remove any existing animation to allow re-trigger
  element.classList.remove(PRESS_FEEDBACK_CLASS);

  // Force reflow to restart animation
  // eslint-disable-next-line no-unused-expressions
  element.offsetWidth;

  element.classList.add(PRESS_FEEDBACK_CLASS);

  // Remove class after animation completes (~150ms)
  const cleanup = () => {
    element.classList.remove(PRESS_FEEDBACK_CLASS);
    element.removeEventListener("animationend", cleanup);
  };

  element.addEventListener("animationend", cleanup, { once: true });

  // Fallback timeout in case animationend doesn't fire
  setTimeout(() => {
    element.classList.remove(PRESS_FEEDBACK_CLASS);
  }, 200);
}

/**
 * Trigger both haptic and visual feedback for a button press.
 * Convenience function that combines both effects.
 * @param {Element|null} element - The element to animate (optional)
 * @param {string} hapticType - Intensity: 'light', 'medium', or 'heavy'
 */
export function triggerPressFeedback(element, hapticType = "medium") {
  triggerHaptic(hapticType);
  if (element) {
    animatePressEffect(element);
  }
}

// Export for IIFE-style usage (non-module contexts)
if (typeof window !== "undefined") {
  window.CatanHaptics = {
    triggerHaptic,
    animatePressEffect,
    triggerPressFeedback
  };
}
