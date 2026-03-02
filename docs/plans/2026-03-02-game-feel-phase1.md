# Phase 1: Core Moment Animations - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform flat game events into satisfying, animated moments that feel like a polished board game app.

**Architecture:** Add new CSS animations and JavaScript animation components to the existing show layer system. The moment detector already captures all game events - we enhance the `runBeat()` function to use richer animations instead of simple text toasts.

**Tech Stack:** CSS animations, CSS transforms, vanilla JavaScript, existing show-layer.js infrastructure

---

## Overview

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Dice Animation Component | Animated 3D-style dice that tumble and reveal |
| 2 | Dice Integration | Wire dice component into runBeat dice_roll handler |
| 3 | Resource Collection Animation | Flying resource icons when players collect |
| 4 | Build Animation Component | Settlement/road/city placement animations |
| 5 | Build Integration | Wire build animations into runBeat build handler |
| 6 | Turn Transition Enhancement | Dramatic turn handoff with player highlight |
| 7 | Trade Animation Enhancement | Animated offer cards and acceptance effects |

---

## Task 1: Dice Animation Component

Create a visual dice roller component that shows animated dice.

**Files:**
- Create: `apps/server/public/tv/dice-animation.js`
- Create: `apps/server/public/tv/dice-animation.css`
- Modify: `apps/server/public/tv/index.html` (add CSS import)

### Step 1: Create the dice animation CSS

Create `apps/server/public/tv/dice-animation.css`:

```css
/* Dice Animation Component */
.diceOverlay {
  position: fixed;
  inset: 0;
  z-index: 4600;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms var(--ease-out);
}

.diceOverlay.show {
  opacity: 1;
}

.diceContainer {
  display: flex;
  gap: 24px;
  perspective: 600px;
}

.die {
  width: 80px;
  height: 80px;
  position: relative;
  transform-style: preserve-3d;
}

.die.rolling {
  animation: diceRoll 600ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}

@keyframes diceRoll {
  0% {
    transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(0.6);
  }
  20% {
    transform: rotateX(180deg) rotateY(90deg) rotateZ(45deg) scale(1.1);
  }
  40% {
    transform: rotateX(360deg) rotateY(180deg) rotateZ(90deg) scale(1);
  }
  60% {
    transform: rotateX(540deg) rotateY(270deg) rotateZ(135deg) scale(1.05);
  }
  80% {
    transform: rotateX(680deg) rotateY(340deg) rotateZ(170deg) scale(1);
  }
  100% {
    transform: rotateX(var(--finalRotX, 720deg)) rotateY(var(--finalRotY, 360deg)) rotateZ(0deg) scale(1);
  }
}

.dieFace {
  position: absolute;
  width: 80px;
  height: 80px;
  background: linear-gradient(145deg, #f5f5f5 0%, #e0e0e0 100%);
  border: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 900;
  color: #1a1a2e;
  box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.5), inset 0 -2px 4px rgba(0, 0, 0, 0.1);
  backface-visibility: hidden;
}

.dieFace[data-value="1"] { transform: rotateY(0deg) translateZ(40px); }
.dieFace[data-value="6"] { transform: rotateY(180deg) translateZ(40px); }
.dieFace[data-value="2"] { transform: rotateY(-90deg) translateZ(40px); }
.dieFace[data-value="5"] { transform: rotateY(90deg) translateZ(40px); }
.dieFace[data-value="3"] { transform: rotateX(90deg) translateZ(40px); }
.dieFace[data-value="4"] { transform: rotateX(-90deg) translateZ(40px); }

/* Pip dots for dice faces */
.dieFace::before {
  content: attr(data-value);
}

/* Result display */
.diceResult {
  position: absolute;
  bottom: -60px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 48px;
  font-weight: 900;
  color: var(--text);
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
}

.diceOverlay.showResult .diceResult {
  opacity: 1;
}

.diceResult[data-sum="7"] {
  color: var(--warn);
}
```

### Step 2: Create the dice animation JavaScript module

Create `apps/server/public/tv/dice-animation.js`:

```javascript
/**
 * Dice Animation Component
 * Creates animated 3D-style dice that tumble and reveal.
 */

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "diceOverlay";
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.innerHTML = `
    <div class="diceContainer">
      <div class="die" data-die="1">
        <div class="dieFace" data-value="1"></div>
        <div class="dieFace" data-value="2"></div>
        <div class="dieFace" data-value="3"></div>
        <div class="dieFace" data-value="4"></div>
        <div class="dieFace" data-value="5"></div>
        <div class="dieFace" data-value="6"></div>
      </div>
      <div class="die" data-die="2">
        <div class="dieFace" data-value="1"></div>
        <div class="dieFace" data-value="2"></div>
        <div class="dieFace" data-value="3"></div>
        <div class="dieFace" data-value="4"></div>
        <div class="dieFace" data-value="5"></div>
        <div class="dieFace" data-value="6"></div>
      </div>
      <div class="diceResult"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function getFinalRotation(value) {
  // Map die value to final rotation that shows that face
  const rotations = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: 90, y: 0 },
    4: { x: -90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 }
  };
  const r = rotations[value] || { x: 0, y: 0 };
  // Add full rotations for dramatic effect
  return { x: r.x + 720, y: r.y + 360 };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Play the dice animation and return when complete.
 * @param {number} d1 - First die value (1-6)
 * @param {number} d2 - Second die value (1-6)
 * @param {Object} options - Animation options
 * @param {number} options.rollDurationMs - Roll animation duration (default 600)
 * @param {number} options.resultDelayMs - Delay before showing result (default 200)
 * @param {number} options.displayDurationMs - How long to show result (default 800)
 * @returns {Promise<void>}
 */
export async function playDiceAnimation(d1, d2, {
  rollDurationMs = 600,
  resultDelayMs = 200,
  displayDurationMs = 800
} = {}) {
  const overlay = ensureOverlay();
  const dice = overlay.querySelectorAll(".die");
  const resultEl = overlay.querySelector(".diceResult");
  const sum = d1 + d2;

  // Set final rotations
  const rot1 = getFinalRotation(d1);
  const rot2 = getFinalRotation(d2);

  dice[0]?.style.setProperty("--finalRotX", `${rot1.x}deg`);
  dice[0]?.style.setProperty("--finalRotY", `${rot1.y}deg`);
  dice[1]?.style.setProperty("--finalRotX", `${rot2.x}deg`);
  dice[1]?.style.setProperty("--finalRotY", `${rot2.y}deg`);

  // Reset state
  dice.forEach((die) => die.classList.remove("rolling"));
  overlay.classList.remove("show", "showResult");
  if (resultEl) {
    resultEl.textContent = "";
    resultEl.removeAttribute("data-sum");
  }

  // Show overlay
  await sleep(16);
  overlay.classList.add("show");

  // Start roll animation
  await sleep(16);
  dice.forEach((die) => die.classList.add("rolling"));

  // Wait for roll to complete
  await sleep(rollDurationMs);

  // Show result
  await sleep(resultDelayMs);
  if (resultEl) {
    resultEl.textContent = String(sum);
    resultEl.setAttribute("data-sum", String(sum));
  }
  overlay.classList.add("showResult");

  // Display result
  await sleep(displayDurationMs);

  // Hide overlay
  overlay.classList.remove("show", "showResult");
  await sleep(200);
  dice.forEach((die) => die.classList.remove("rolling"));
}

/**
 * Immediately hide the dice animation if visible.
 */
export function hideDiceAnimation() {
  if (!overlayEl) return;
  overlayEl.classList.remove("show", "showResult");
  overlayEl.querySelectorAll(".die").forEach((die) => die.classList.remove("rolling"));
}
```

### Step 3: Add CSS import to index.html

Modify `apps/server/public/tv/index.html` - find the existing CSS link and add after it:

```html
<link rel="stylesheet" href="/tv/dice-animation.css" />
```

### Step 4: Verify files created correctly

Run: `ls -la apps/server/public/tv/dice-animation.*`
Expected: Both files exist

### Step 5: Commit

```bash
git add apps/server/public/tv/dice-animation.js apps/server/public/tv/dice-animation.css apps/server/public/tv/index.html
git commit -m "feat: add dice animation component

Adds 3D-style animated dice that tumble and reveal results.
CSS keyframe animation with perspective transforms."
```

---

## Task 2: Dice Integration

Wire the dice animation into the existing dice_roll beat handler.

**Files:**
- Modify: `apps/server/public/tv/tv.js:1-50` (add import)
- Modify: `apps/server/public/tv/tv.js:1200-1240` (dice_roll handler)

### Step 1: Add import for dice animation

At the top of `apps/server/public/tv/tv.js`, after the existing imports (around line 39), add:

```javascript
import { playDiceAnimation } from "/tv/dice-animation.js";
```

### Step 2: Enhance the dice_roll handler

Replace the dice_roll handler (approximately lines 1200-1238) with enhanced version:

```javascript
  // -------------------------------------------------------------------------
  // Dice Roll - animated dice with dramatic reveal
  // -------------------------------------------------------------------------
  if (type === "dice_roll") {
    const d1 = beat?.d1 || 1;
    const d2 = beat?.d2 || 1;
    const sum = beat?.sum || (d1 + d2);

    // Play sound at start
    playSfx("dice");
    flashClass(elDiceBox, "diceRolling", d(650));

    // Play dice animation (blocking)
    await playDiceAnimation(d1, d2, {
      rollDurationMs: d(600),
      resultDelayMs: d(200),
      displayDurationMs: sum === 7 ? d(1000) : d(700)
    });

    // Show host copy moment card after dice settle
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: sum === 7 ? d(1000) : d(700)
    });

    // Show resources collected message (if not 7)
    if (sum && sum !== 7) {
      const room = lastRoomState;
      const game = room?.game || null;
      const board = game?.board || null;

      if (board?.hexes) {
        const matchingHexes = (board.hexes || []).filter(
          (h) => h?.token === sum && h?.resource && h.resource !== "desert" && h.id !== game?.robberHexId
        );

        if (matchingHexes.length > 0) {
          const resourceNames = [...new Set(matchingHexes.map((h) => h.resource))];
          const resourceText = resourceNames.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");
          await show.toast({
            title: "Resources collected",
            subtitle: resourceText,
            tone: "good",
            durationMs: d(1600)
          });
        }
      }
    }

    return wait(400);
  }
```

### Step 3: Verify the import is syntactically correct

Run: `node --check apps/server/public/tv/tv.js 2>&1 || echo "Syntax check done"`
Expected: No syntax errors (or "Syntax check done" if ES modules)

### Step 4: Manual test

Run: `npm run dev`
Then: Open TV view, start a game, roll dice
Expected: See animated 3D dice tumble and reveal the roll

### Step 5: Commit

```bash
git add apps/server/public/tv/tv.js
git commit -m "feat: integrate animated dice into dice_roll handler

Replaces flat text display with animated 3D dice tumble.
Shows dice animation, then moment card, then resource collection."
```

---

## Task 3: Resource Collection Animation

Create flying resource icons that animate from the board to player areas.

**Files:**
- Create: `apps/server/public/tv/resource-animation.js`
- Create: `apps/server/public/tv/resource-animation.css`
- Modify: `apps/server/public/tv/index.html` (add CSS import)

### Step 1: Create the resource animation CSS

Create `apps/server/public/tv/resource-animation.css`:

```css
/* Resource Collection Animation */
.resourceFlyContainer {
  position: fixed;
  inset: 0;
  z-index: 4550;
  pointer-events: none;
  overflow: hidden;
}

.resourceFlyIcon {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  opacity: 0;
  transform: scale(0.5);
  transition: none;
}

.resourceFlyIcon.flying {
  opacity: 1;
  transform: scale(1);
  transition:
    left 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
    top 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 500ms ease-out,
    transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.resourceFlyIcon.arrived {
  transform: scale(1.3);
  opacity: 0;
}

.resourceFlyIcon[data-resource="wood"] {
  background: rgba(47, 143, 82, 0.9);
  box-shadow: 0 0 12px rgba(47, 143, 82, 0.6);
}

.resourceFlyIcon[data-resource="brick"] {
  background: rgba(184, 75, 59, 0.9);
  box-shadow: 0 0 12px rgba(184, 75, 59, 0.6);
}

.resourceFlyIcon[data-resource="sheep"] {
  background: rgba(111, 207, 122, 0.9);
  box-shadow: 0 0 12px rgba(111, 207, 122, 0.6);
}

.resourceFlyIcon[data-resource="wheat"] {
  background: rgba(214, 184, 75, 0.9);
  box-shadow: 0 0 12px rgba(214, 184, 75, 0.6);
}

.resourceFlyIcon[data-resource="ore"] {
  background: rgba(154, 163, 173, 0.9);
  box-shadow: 0 0 12px rgba(154, 163, 173, 0.6);
}
```

### Step 2: Create the resource animation JavaScript

Create `apps/server/public/tv/resource-animation.js`:

```javascript
/**
 * Resource Collection Animation
 * Flying resource icons from board hexes to player areas.
 */

let containerEl = null;

function ensureContainer() {
  if (containerEl) return containerEl;
  containerEl = document.createElement("div");
  containerEl.className = "resourceFlyContainer";
  containerEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(containerEl);
  return containerEl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

const RESOURCE_ICONS = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "�ite"
};

/**
 * Animate resources flying from source to target.
 * @param {Object} options
 * @param {string} options.resource - Resource type (wood, brick, sheep, wheat, ore)
 * @param {number} options.count - Number of icons to fly (capped at 5)
 * @param {DOMRect|{x: number, y: number}} options.from - Start position
 * @param {DOMRect|{x: number, y: number}} options.to - End position
 * @param {number} options.durationMs - Flight duration (default 500)
 * @param {number} options.staggerMs - Stagger between icons (default 60)
 * @returns {Promise<void>}
 */
export async function flyResources({
  resource,
  count = 1,
  from,
  to,
  durationMs = 500,
  staggerMs = 60
} = {}) {
  const container = ensureContainer();
  const n = Math.min(5, Math.max(1, count));

  const fromX = from?.x ?? from?.left ?? 0;
  const fromY = from?.y ?? from?.top ?? 0;
  const toX = to?.x ?? to?.left ?? 0;
  const toY = to?.y ?? to?.top ?? 0;

  const icons = [];

  for (let i = 0; i < n; i++) {
    const icon = document.createElement("div");
    icon.className = "resourceFlyIcon";
    icon.setAttribute("data-resource", resource);
    icon.textContent = RESOURCE_ICONS[resource] || "?";

    // Slight random offset for natural feel
    const offsetX = (Math.random() - 0.5) * 30;
    const offsetY = (Math.random() - 0.5) * 30;

    icon.style.left = `${fromX + offsetX}px`;
    icon.style.top = `${fromY + offsetY}px`;

    container.appendChild(icon);
    icons.push({ icon, toX: toX + offsetX * 0.5, toY: toY + offsetY * 0.5 });
  }

  // Trigger reflow
  await sleep(16);

  // Stagger the flights
  for (let i = 0; i < icons.length; i++) {
    const { icon, toX: tx, toY: ty } = icons[i];

    setTimeout(() => {
      icon.classList.add("flying");
      icon.style.left = `${tx}px`;
      icon.style.top = `${ty}px`;

      setTimeout(() => {
        icon.classList.add("arrived");
        setTimeout(() => icon.remove(), 200);
      }, durationMs);
    }, i * staggerMs);
  }

  // Wait for all to complete
  await sleep(durationMs + (icons.length - 1) * staggerMs + 200);
}

/**
 * Clear all flying resources immediately.
 */
export function clearFlyingResources() {
  if (!containerEl) return;
  containerEl.innerHTML = "";
}
```

### Step 3: Add CSS import to index.html

Modify `apps/server/public/tv/index.html` - add after dice-animation.css:

```html
<link rel="stylesheet" href="/tv/resource-animation.css" />
```

### Step 4: Verify files created

Run: `ls -la apps/server/public/tv/resource-animation.*`
Expected: Both files exist

### Step 5: Commit

```bash
git add apps/server/public/tv/resource-animation.js apps/server/public/tv/resource-animation.css apps/server/public/tv/index.html
git commit -m "feat: add resource collection flying animation

Animated resource icons fly from hex to player area on collection.
Supports staggered spawning for multiple resources."
```

---

## Task 4: Build Animation Component

Create animations for settlement, road, and city placement.

**Files:**
- Create: `apps/server/public/tv/build-animation.js`
- Create: `apps/server/public/tv/build-animation.css`
- Modify: `apps/server/public/tv/index.html` (add CSS import)

### Step 1: Create the build animation CSS

Create `apps/server/public/tv/build-animation.css`:

```css
/* Build Placement Animation */
.buildEffectContainer {
  position: fixed;
  inset: 0;
  z-index: 4500;
  pointer-events: none;
  overflow: hidden;
}

.buildEffect {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ring burst effect */
.buildRing {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid var(--ring-color, var(--good));
  opacity: 0;
  transform: scale(0.3);
}

.buildRing.burst {
  animation: ringBurst 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes ringBurst {
  0% {
    opacity: 0.9;
    transform: scale(0.3);
  }
  100% {
    opacity: 0;
    transform: scale(2);
  }
}

/* Particle burst */
.buildParticle {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--particle-color, var(--good));
  opacity: 0;
}

.buildParticle.burst {
  animation: particleBurst 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes particleBurst {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--px, 0), var(--py, 0)) scale(0.3);
  }
}

/* Scale-in for the structure itself */
.buildScaleIn {
  animation: buildScaleIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes buildScaleIn {
  0% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  60% {
    opacity: 1;
    transform: scale(1.15) translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Glow pulse after placement */
.buildGlow {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--glow-color, rgba(57, 217, 138, 0.4)) 0%, transparent 70%);
  opacity: 0;
}

.buildGlow.pulse {
  animation: glowPulse 600ms ease-out forwards;
}

@keyframes glowPulse {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  30% {
    opacity: 0.8;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}
```

### Step 2: Create the build animation JavaScript

Create `apps/server/public/tv/build-animation.js`:

```javascript
/**
 * Build Placement Animation
 * Ring burst, particles, and glow effects for structure placement.
 */

let containerEl = null;

function ensureContainer() {
  if (containerEl) return containerEl;
  containerEl = document.createElement("div");
  containerEl.className = "buildEffectContainer";
  containerEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(containerEl);
  return containerEl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Play build placement effect at a position.
 * @param {Object} options
 * @param {string} options.kind - 'road', 'settlement', or 'city'
 * @param {DOMRect|{x: number, y: number}} options.position - Center position
 * @param {string} options.playerColor - Player's color for the effect
 * @param {number} options.durationMs - Total effect duration (default 600)
 * @returns {Promise<void>}
 */
export async function playBuildEffect({
  kind = "settlement",
  position,
  playerColor = "var(--good)",
  durationMs = 600
} = {}) {
  const container = ensureContainer();

  const x = position?.x ?? position?.left ?? 0;
  const y = position?.y ?? position?.top ?? 0;

  // Create effect container
  const effect = document.createElement("div");
  effect.className = "buildEffect";
  effect.style.left = `${x}px`;
  effect.style.top = `${y}px`;

  // Ring burst
  const ring = document.createElement("div");
  ring.className = "buildRing";
  ring.style.setProperty("--ring-color", playerColor);
  effect.appendChild(ring);

  // Glow
  const glow = document.createElement("div");
  glow.className = "buildGlow";
  glow.style.setProperty("--glow-color", playerColor.replace("rgb", "rgba").replace(")", ", 0.4)"));
  effect.appendChild(glow);

  // Particles
  const particleCount = kind === "city" ? 12 : kind === "settlement" ? 8 : 5;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "buildParticle";
    particle.style.setProperty("--particle-color", playerColor);

    const angle = (i / particleCount) * Math.PI * 2;
    const distance = 30 + Math.random() * 40;
    particle.style.setProperty("--px", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--py", `${Math.sin(angle) * distance}px`);

    effect.appendChild(particle);
  }

  container.appendChild(effect);

  // Trigger animations
  await sleep(16);
  ring.classList.add("burst");
  glow.classList.add("pulse");
  effect.querySelectorAll(".buildParticle").forEach((p) => p.classList.add("burst"));

  // Wait and cleanup
  await sleep(durationMs);
  effect.remove();
}

/**
 * Clear all build effects immediately.
 */
export function clearBuildEffects() {
  if (!containerEl) return;
  containerEl.innerHTML = "";
}
```

### Step 3: Add CSS import to index.html

Modify `apps/server/public/tv/index.html` - add after resource-animation.css:

```html
<link rel="stylesheet" href="/tv/build-animation.css" />
```

### Step 4: Verify files created

Run: `ls -la apps/server/public/tv/build-animation.*`
Expected: Both files exist

### Step 5: Commit

```bash
git add apps/server/public/tv/build-animation.js apps/server/public/tv/build-animation.css apps/server/public/tv/index.html
git commit -m "feat: add build placement animation component

Ring burst, particle explosion, and glow effects for settlements,
roads, and cities. Particle count scales with structure importance."
```

---

## Task 5: Build Integration

Wire build animations into the existing build beat handler.

**Files:**
- Modify: `apps/server/public/tv/tv.js` (add import, enhance build handler)

### Step 1: Add import for build animation

At the top of `apps/server/public/tv/tv.js`, after the dice animation import, add:

```javascript
import { playBuildEffect } from "/tv/build-animation.js";
```

### Step 2: Enhance the build handler

Replace the build handler (approximately lines 1339-1373) with enhanced version:

```javascript
  // -------------------------------------------------------------------------
  // Build - road, settlement, or city placed with particle effects
  // -------------------------------------------------------------------------
  if (type === "build") {
    const kind = beat?.kind || "build";
    const playerColor = beat?.playerColor || "var(--good)";

    // Play sound
    playSfx("build");

    // Find the build location element
    let targetEl = null;
    if (kind === "road" && beat?.edgeId) {
      targetEl = elBoard?.querySelector?.(`[data-edge-id="${beat.edgeId}"]`);
      focusEdge(elBoard, beat.edgeId, { duration: d(800) });
    } else if (beat?.vertexId) {
      targetEl = elBoard?.querySelector?.(`[data-vertex-id="${beat.vertexId}"]`);
      focusVertex(elBoard, beat.vertexId, { duration: d(800) });
    }

    // Get position for effect
    let effectPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      effectPos = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }

    // Play build effect (non-blocking, runs in parallel)
    playBuildEffect({
      kind,
      position: effectPos,
      playerColor,
      durationMs: d(600)
    });

    // Flash the board
    flashClass(elBoard, "boardFlash", d(650));

    // Show toast with host copy
    const hostCopy = hostCopyForMoment({ ...beat, kind: `build_${kind}` }, { audience: "tv" });
    await show.toast({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(1800)
    });

    // Spotlight the build location
    if (!targetEl) {
      const momentKind =
        kind === "road"
          ? "build_road"
          : kind === "settlement"
            ? "build_settlement"
            : kind === "city"
              ? "build_city"
              : "";
      const data =
        momentKind === "build_road" ? { edgeId: beat?.edgeId || null } : { vertexId: beat?.vertexId || null };
      if (momentKind) await applyBoardMoment(elBoard, { kind: momentKind, data });
      targetEl = kind === "road" && beat?.edgeId
        ? elBoard?.querySelector?.(`[data-edge-id="${beat.edgeId}"]`)
        : beat?.vertexId
          ? elBoard?.querySelector?.(`[data-vertex-id="${beat.vertexId}"]`)
          : null;
    }

    show.spotlightElement(targetEl, { tone: "good", pad: 18, durationMs: d(850), pulse: true, shade: 0.34 });

    return wait(620);
  }
```

### Step 3: Verify syntax

Run: `node --check apps/server/public/tv/tv.js 2>&1 || echo "Syntax check done"`
Expected: No syntax errors

### Step 4: Manual test

Run: `npm run dev`
Then: Open TV view, start a game, place a settlement
Expected: See particle burst and glow effect at build location

### Step 5: Commit

```bash
git add apps/server/public/tv/tv.js
git commit -m "feat: integrate build animations into build handler

Particle burst and glow effects play at structure location.
Effect intensity scales with structure type (road < settlement < city)."
```

---

## Task 6: Turn Transition Enhancement

Enhance turn handoffs with more dramatic visual transitions.

**Files:**
- Modify: `apps/server/public/tv/tv.css` (add turn transition styles)
- Modify: `apps/server/public/tv/tv.js` (enhance turn_start handler)

### Step 1: Add turn transition CSS

Add to end of `apps/server/public/tv/tv.css`:

```css
/* Turn Transition Enhancement */
.turnBanner {
  position: fixed;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 4700;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  opacity: 0;
  pointer-events: none;
}

.turnBanner.show {
  opacity: 1;
}

.turnBannerName {
  font-size: 56px;
  font-weight: 900;
  letter-spacing: 1px;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.6);
  opacity: 0;
  transform: translateY(30px) scale(0.9);
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.turnBanner.show .turnBannerName {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.turnBannerLabel {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 8px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1) 100ms;
}

.turnBanner.show .turnBannerLabel {
  opacity: 1;
  transform: translateY(0);
}

.turnBannerStripe {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--player-color, var(--accent));
  transform: scaleX(0);
  transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
}

.turnBannerStripe.top {
  top: 0;
  transform-origin: left;
}

.turnBannerStripe.bottom {
  bottom: 0;
  transform-origin: right;
}

.turnBanner.show .turnBannerStripe {
  transform: scaleX(1);
}

/* Player row highlight during their turn */
.playerRow[data-active="true"] {
  background: rgba(var(--accent-rgb), 0.12);
  border-color: rgba(var(--accent-rgb), 0.4);
}
```

### Step 2: Create turn banner helper function in tv.js

Add this function before the runBeat function (around line 1130):

```javascript
// Turn Banner Helper
let turnBannerEl = null;

function ensureTurnBanner() {
  if (turnBannerEl) return turnBannerEl;
  turnBannerEl = document.createElement("div");
  turnBannerEl.className = "turnBanner";
  turnBannerEl.setAttribute("aria-hidden", "true");
  turnBannerEl.innerHTML = `
    <div class="turnBannerStripe top"></div>
    <div class="turnBannerName"></div>
    <div class="turnBannerLabel">Your Turn</div>
    <div class="turnBannerStripe bottom"></div>
  `;
  document.body.appendChild(turnBannerEl);
  return turnBannerEl;
}

async function showTurnBanner(playerName, playerColor, durationMs = 1200) {
  const banner = ensureTurnBanner();
  const nameEl = banner.querySelector(".turnBannerName");
  const stripes = banner.querySelectorAll(".turnBannerStripe");

  if (nameEl) {
    nameEl.textContent = playerName;
    nameEl.style.color = playerColor;
  }
  stripes.forEach((s) => s.style.setProperty("--player-color", playerColor));

  banner.classList.add("show");
  await sleep(durationMs);
  banner.classList.remove("show");
  await sleep(300);
}
```

### Step 3: Enhance the turn_start handler

Replace the turn_start handler with enhanced version:

```javascript
  // -------------------------------------------------------------------------
  // Turn Start - dramatic banner with player name
  // -------------------------------------------------------------------------
  if (type === "turn_start") {
    const playerName = beat?.playerName || "Player";
    const playerColor = beat?.playerColor || "var(--accent)";

    flashClass(elPhasePill, "cardFlash", d(650));
    playSfx("turn");

    // Focus camera on player's area
    const structures = lastRoomState?.game?.structures || null;
    focusPlayerArea(elBoard, beat?.playerId, structures, { duration: d(1000) });

    // Show dramatic turn banner
    await showTurnBanner(playerName, playerColor, d(1100));

    // Highlight player row
    const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.playerId}"]`) || null;
    show.spotlightElement(rowEl, { tone: "info", pad: 10, durationMs: d(820), pulse: false, shade: 0.32 });

    return wait(400);
  }
```

### Step 4: Verify syntax

Run: `node --check apps/server/public/tv/tv.js 2>&1 || echo "Syntax check done"`
Expected: No syntax errors

### Step 5: Manual test

Run: `npm run dev`
Then: Play a game, end your turn
Expected: See dramatic banner with player name slide in

### Step 6: Commit

```bash
git add apps/server/public/tv/tv.css apps/server/public/tv/tv.js
git commit -m "feat: add dramatic turn transition banner

Full-screen player name banner with color-matched stripes.
Animates in with scale and slide effects for dramatic handoff."
```

---

## Task 7: Trade Animation Enhancement

Enhance trade offers and acceptances with animated cards.

**Files:**
- Modify: `apps/server/public/tv/tv.css` (add trade animation styles)
- Modify: `apps/server/public/tv/tv.js` (enhance trade handlers)

### Step 1: Add trade animation CSS

Add to end of `apps/server/public/tv/tv.css`:

```css
/* Trade Animation Enhancement */
.tradeComplete {
  position: fixed;
  inset: 0;
  z-index: 4650;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
}

.tradeComplete.show {
  opacity: 1;
}

.tradeHandshake {
  font-size: 72px;
  opacity: 0;
  transform: scale(0.5) rotate(-10deg);
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tradeComplete.show .tradeHandshake {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.tradeParticles {
  position: absolute;
  width: 200px;
  height: 200px;
}

.tradeParticle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  opacity: 0;
}

.tradeComplete.show .tradeParticle {
  animation: tradeParticleBurst 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes tradeParticleBurst {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--tx, 0)), calc(-50% + var(--ty, 0))) scale(0.3);
  }
}

/* Offer card pulse when new */
.offerCard.new {
  animation: offerPulse 400ms ease-out;
}

@keyframes offerPulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.4);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 0 0 8px rgba(var(--accent-rgb), 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0);
  }
}
```

### Step 2: Create trade complete helper function in tv.js

Add this function after the turn banner helper:

```javascript
// Trade Complete Animation Helper
let tradeCompleteEl = null;

function ensureTradeComplete() {
  if (tradeCompleteEl) return tradeCompleteEl;
  tradeCompleteEl = document.createElement("div");
  tradeCompleteEl.className = "tradeComplete";
  tradeCompleteEl.setAttribute("aria-hidden", "true");

  let html = `<div class="tradeHandshake">🤝</div><div class="tradeParticles">`;
  const colors = ["var(--good)", "var(--accent)", "var(--accent2)", "var(--warn)"];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const dist = 60 + Math.random() * 40;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const color = colors[i % colors.length];
    const delay = i * 30;
    html += `<div class="tradeParticle" style="--tx:${tx}px;--ty:${ty}px;background:${color};animation-delay:${delay}ms"></div>`;
  }
  html += `</div>`;

  tradeCompleteEl.innerHTML = html;
  document.body.appendChild(tradeCompleteEl);
  return tradeCompleteEl;
}

async function showTradeComplete(durationMs = 800) {
  const el = ensureTradeComplete();
  el.classList.add("show");
  await sleep(durationMs);
  el.classList.remove("show");
  await sleep(200);
}
```

### Step 3: Enhance the trade_accepted handler

Replace the trade_accepted handler with:

```javascript
  // -------------------------------------------------------------------------
  // Trade Accepted - handshake celebration
  // -------------------------------------------------------------------------
  if (type === "trade_accepted") {
    flashClass(elOffersCard, "cardFlash", d(700));
    playSfx("trade");

    // Show handshake animation
    await showTradeComplete(d(900));

    // Show moment card
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(1200)
    });

    return wait(500);
  }
```

### Step 4: Verify syntax

Run: `node --check apps/server/public/tv/tv.js 2>&1 || echo "Syntax check done"`
Expected: No syntax errors

### Step 5: Manual test

Run: `npm run dev`
Then: Play a game with multiple players, complete a trade
Expected: See handshake emoji with particle burst

### Step 6: Commit

```bash
git add apps/server/public/tv/tv.css apps/server/public/tv/tv.js
git commit -m "feat: add trade completion celebration animation

Handshake emoji with particle burst on successful trades.
Offer cards pulse when new."
```

---

## Summary

Phase 1 implementation adds:

1. **Animated dice** - 3D tumbling dice with dramatic reveal
2. **Flying resources** - Icons animate from board to player areas
3. **Build effects** - Ring burst, particles, glow on structure placement
4. **Turn banners** - Full-screen player name announcement
5. **Trade celebration** - Handshake animation with particles

Each component is modular and builds on the existing show layer infrastructure.

---

## Next Steps

After completing Phase 1:
1. Test all animations in a full game
2. Tune timing and pacing based on feel
3. Proceed to Phase 2: Visual Celebrations (particles, milestones)
