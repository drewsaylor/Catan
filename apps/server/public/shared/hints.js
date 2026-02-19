// =============================================================================
// First-Time Player Hints System
// =============================================================================
// Provides contextual hints for first-time players. Hints are shown once per
// session and can be dismissed. Uses sessionStorage to track which hints have
// been shown.
//
// Pattern similar to settings.js - IIFE with window global export.

(function () {
  const HINTS_STORAGE_KEY = "catan_seen_hints";

  // ---------------------------------------------------------------------------
  // Hint Definitions
  // ---------------------------------------------------------------------------

  /**
   * @typedef {Object} HintDefinition
   * @property {string} id - Unique identifier for the hint
   * @property {string} message - The hint message to display
   * @property {string} [icon] - Optional icon/emoji for the hint
   * @property {number} [durationMs] - Auto-dismiss duration (0 = manual only)
   */

  /** @type {Record<string, HintDefinition>} */
  const HINT_DEFINITIONS = {
    first_roll: {
      id: "first_roll",
      message: "Tap to roll the dice!",
      icon: "dice",
      durationMs: 6000
    },
    first_build: {
      id: "first_build",
      message: "You have resources! Tap Build to construct.",
      icon: "hammer",
      durationMs: 6000
    },
    first_trade: {
      id: "first_trade",
      message: "Want different resources? Try trading!",
      icon: "trade",
      durationMs: 6000
    },
    your_turn: {
      id: "your_turn",
      message: "It's your turn! Roll to start.",
      icon: "star",
      durationMs: 5000
    },
    first_settlement: {
      id: "first_settlement",
      message: "Tap a glowing spot to place your settlement.",
      icon: "settlement",
      durationMs: 6000
    },
    first_road: {
      id: "first_road",
      message: "Tap a glowing edge to place your road.",
      icon: "road",
      durationMs: 6000
    },
    robber_intro: {
      id: "robber_intro",
      message: "A 7 was rolled! Move the robber to block a hex.",
      icon: "robber",
      durationMs: 6000
    },
    dev_card_intro: {
      id: "dev_card_intro",
      message: "Dev cards give special powers. Buy them in the More tab.",
      icon: "card",
      durationMs: 6000
    }
  };

  // ---------------------------------------------------------------------------
  // Quick Reference Content
  // ---------------------------------------------------------------------------

  const QUICK_REFERENCE = {
    title: "How to Play Catan",
    sections: [
      {
        heading: "Goal",
        items: ["Be the first to reach the victory point target (usually 10 VP)."]
      },
      {
        heading: "Your Turn",
        items: [
          "Roll the dice - everyone with settlements on matching numbers gets resources.",
          "Build roads, settlements, or cities using your resources.",
          "Trade with other players or the bank.",
          "End your turn when done."
        ]
      },
      {
        heading: "Building Costs",
        items: [
          "Road: 1 Wood + 1 Brick",
          "Settlement: 1 Wood + 1 Brick + 1 Sheep + 1 Wheat",
          "City: 3 Ore + 2 Wheat",
          "Dev Card: 1 Ore + 1 Sheep + 1 Wheat"
        ]
      },
      {
        heading: "The Robber",
        items: [
          "When a 7 is rolled, the robber moves.",
          "Players with 8+ cards must discard half.",
          "The robber blocks the hex it sits on."
        ]
      },
      {
        heading: "Victory Points",
        items: [
          "Settlement: 1 VP",
          "City: 2 VP",
          "Longest Road (5+): 2 VP",
          "Largest Army (3+ knights): 2 VP",
          "Victory Point cards: 1 VP each"
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------------
  // Storage Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the set of hint IDs that have been seen this session.
   * @returns {Set<string>}
   */
  function getSeenHints() {
    try {
      const raw = sessionStorage.getItem(HINTS_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Save the set of seen hints to sessionStorage.
   * @param {Set<string>} seen
   */
  function saveSeenHints(seen) {
    try {
      sessionStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify([...seen]));
    } catch {
      // Ignore storage errors.
    }
  }

  /**
   * Check if a specific hint has been seen this session.
   * @param {string} hintId
   * @returns {boolean}
   */
  function hasSeenHint(hintId) {
    return getSeenHints().has(hintId);
  }

  /**
   * Mark a hint as seen.
   * @param {string} hintId
   */
  function markHintSeen(hintId) {
    const seen = getSeenHints();
    seen.add(hintId);
    saveSeenHints(seen);
  }

  /**
   * Clear all seen hints (useful for testing).
   */
  function clearSeenHints() {
    try {
      sessionStorage.removeItem(HINTS_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  // ---------------------------------------------------------------------------
  // Hint Display
  // ---------------------------------------------------------------------------

  let currentHintEl = null;
  let currentHintId = null;
  let autoDismissTimer = null;

  /**
   * Get the hints container element, creating it if needed.
   * @returns {HTMLElement|null}
   */
  function getHintContainer() {
    let container = document.getElementById("hintContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "hintContainer";
      container.className = "hintContainer";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Get the icon HTML for a hint.
   * @param {string} iconName
   * @returns {string}
   */
  function getHintIcon(iconName) {
    const icons = {
      dice: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
      hammer: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 12L12 9M12 9L9 12M12 9V21M19 9a3 3 0 0 0-3-3H8a3 3 0 0 0 0 6h8a3 3 0 0 0 0-6z"/></svg>',
      trade: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>',
      star: '<svg class="hintIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>',
      settlement: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21H21M5 21V11L12 4L19 11V21M9 21V15H15V21"/></svg>',
      road: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L8 4M16 20L20 4M8 12H16M6 8H18"/></svg>',
      robber: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20C4 16 8 14 12 14C16 14 20 16 20 20"/><path d="M9 8C9 8 10 6 12 6C14 6 15 8 15 8"/></svg>',
      card: '<svg class="hintIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 6V12L15 9"/></svg>'
    };
    return icons[iconName] || "";
  }

  /**
   * Show a hint toast/popup.
   * @param {string} hintId - The hint ID from HINT_DEFINITIONS
   * @param {Object} [options] - Override options
   * @param {string} [options.message] - Custom message (overrides definition)
   * @param {number} [options.durationMs] - Auto-dismiss duration
   * @param {boolean} [options.force] - Show even if already seen
   * @returns {boolean} - Whether the hint was shown
   */
  function showHint(hintId, options = {}) {
    const def = HINT_DEFINITIONS[hintId];
    if (!def && !options.message) return false;

    // Check if already seen (unless forced)
    if (!options.force && hasSeenHint(hintId)) return false;

    // Dismiss any existing hint
    dismissHint();

    const message = options.message || def?.message || "";
    const icon = def?.icon || "";
    const durationMs = typeof options.durationMs === "number" ? options.durationMs : (def?.durationMs || 5000);

    const container = getHintContainer();
    if (!container) return false;

    // Create hint element
    const hintEl = document.createElement("div");
    hintEl.className = "hintToast";
    hintEl.setAttribute("role", "alert");

    const iconHtml = getHintIcon(icon);
    hintEl.innerHTML = `
      ${iconHtml ? `<span class="hintIconWrap">${iconHtml}</span>` : ""}
      <span class="hintMessage">${escapeHtml(message)}</span>
      <button class="hintDismissBtn" aria-label="Dismiss hint" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6L18 18"/>
        </svg>
      </button>
    `;

    // Add dismiss handler
    const dismissBtn = hintEl.querySelector(".hintDismissBtn");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => dismissHint(hintId));
    }

    // Also dismiss on tap anywhere on the hint
    hintEl.addEventListener("click", (e) => {
      if (e.target === dismissBtn || dismissBtn?.contains(e.target)) return;
      dismissHint(hintId);
    });

    container.appendChild(hintEl);
    currentHintEl = hintEl;
    currentHintId = hintId;

    // Trigger animation
    requestAnimationFrame(() => {
      hintEl.classList.add("show");
    });

    // Auto-dismiss after duration
    if (durationMs > 0) {
      autoDismissTimer = setTimeout(() => {
        dismissHint(hintId);
      }, durationMs);
    }

    return true;
  }

  /**
   * Dismiss the current hint (or a specific hint).
   * @param {string} [hintId] - If provided, marks this hint as seen
   */
  function dismissHint(hintId) {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }

    if (hintId) {
      markHintSeen(hintId);
    } else if (currentHintId) {
      markHintSeen(currentHintId);
    }

    if (currentHintEl) {
      currentHintEl.classList.remove("show");
      const el = currentHintEl;
      setTimeout(() => {
        el.remove();
      }, 300);
    }

    currentHintEl = null;
    currentHintId = null;
  }

  // ---------------------------------------------------------------------------
  // Quick Reference Overlay
  // ---------------------------------------------------------------------------

  let quickRefOverlay = null;

  /**
   * Show the quick reference overlay.
   */
  function showQuickReference() {
    if (quickRefOverlay) return;

    quickRefOverlay = document.createElement("div");
    quickRefOverlay.className = "quickRefBackdrop";
    quickRefOverlay.innerHTML = `
      <div class="quickRefPanel" role="dialog" aria-modal="true" aria-label="How to Play">
        <div class="quickRefHeader">
          <h2 class="quickRefTitle">${escapeHtml(QUICK_REFERENCE.title)}</h2>
          <button class="btn quickRefCloseBtn" type="button">Close</button>
        </div>
        <div class="quickRefContent">
          ${QUICK_REFERENCE.sections
            .map(
              (section) => `
            <div class="quickRefSection">
              <h3 class="quickRefHeading">${escapeHtml(section.heading)}</h3>
              <ul class="quickRefList">
                ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    const closeBtn = quickRefOverlay.querySelector(".quickRefCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", hideQuickReference);
    }

    // Close on backdrop click
    quickRefOverlay.addEventListener("click", (e) => {
      if (e.target === quickRefOverlay) {
        hideQuickReference();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        hideQuickReference();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    document.body.appendChild(quickRefOverlay);

    // Trigger animation
    requestAnimationFrame(() => {
      quickRefOverlay.classList.add("show");
      closeBtn?.focus();
    });
  }

  /**
   * Hide the quick reference overlay.
   */
  function hideQuickReference() {
    if (!quickRefOverlay) return;

    quickRefOverlay.classList.remove("show");
    const overlay = quickRefOverlay;
    quickRefOverlay = null;

    setTimeout(() => {
      overlay.remove();
    }, 300);
  }

  /**
   * Toggle the quick reference overlay.
   */
  function toggleQuickReference() {
    if (quickRefOverlay) {
      hideQuickReference();
    } else {
      showQuickReference();
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str || "");
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.CatanHints = {
    // Core API
    showHint,
    dismissHint,
    hasSeenHint,
    markHintSeen,
    clearSeenHints,

    // Quick reference
    showQuickReference,
    hideQuickReference,
    toggleQuickReference,

    // Definitions (for debugging/testing)
    HINT_DEFINITIONS,
    QUICK_REFERENCE
  };
})();
