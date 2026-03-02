# Game Feel Polish Design

**Date:** 2026-03-02
**Status:** Approved
**Goal:** Transform the Catan LAN experience from "dashboard" to "polished board game"

## Problem Statement

The game currently feels like a functional dashboard rather than an engaging board game experience. Key issues:
- Static visuals with insufficient motion and animation
- Game events feel flat without celebration or drama
- Passive viewing experience on the TV - no excitement or tension building

## Design Principles

Inspired by polished board game adaptations (Wingspan, Ticket to Ride apps):
- **Smooth animations** - Pieces move with easing and weight
- **Tactile feedback** - Sound effects synced with visual impact
- **Visual celebration** - Particle effects, glows, highlights for positive events
- **Clarity and pacing** - Visual hierarchy, pauses to let moments breathe

## Architecture

The implementation builds on existing infrastructure:
- **Moment detector** (`moment-detector.js`) - Already detects game events
- **Show layer** (`show-layer.js`) - Toast, spotlight, confetti system
- **Audio system** (`audio.js`) - Sound effects and music
- **Board renderer** (`board-ui.js`) - SVG-based 2D board

All phases enhance rather than replace existing systems.

---

## Phase 1: Core Moment Animations

Make fundamental game events feel satisfying.

### 1.1 Dice Rolling
| Element | Implementation |
|---------|----------------|
| Suspense build | 300-500ms anticipation pause before roll |
| Animated roll | CSS/canvas dice tumble animation |
| Dramatic reveal | Dice settle, brief pause, number resolves |
| Sound sync | Dice SFX triggers at roll start |
| Resource cascade | Animated resource icons fly to collecting players |

### 1.2 Building Placement
| Element | Implementation |
|---------|----------------|
| Piece animation | Scale up from 0 or drop in from above |
| Impact feel | Subtle bounce/squash on settle |
| Sound sync | Build SFX plays at moment of impact |
| Board highlight | Brief glow around placed structure |
| Camera focus | Smooth pan to build location |

### 1.3 Turn Transitions
| Element | Implementation |
|---------|----------------|
| Visual handoff | Current player dims, next player highlights |
| Name announcement | Brief moment card showing whose turn |
| Camera reset | Smooth move to show full board |

### 1.4 Trading
| Element | Implementation |
|---------|----------------|
| Offer appearance | Trade offers slide/fade in |
| Negotiation state | Visual indicators for considering/rejected |
| Deal completion | "Handshake" animation on accept |
| Resource exchange | Show resources moving between players |

---

## Phase 2: Visual Celebrations

Add "juice" - particles, effects, celebration moments.

### 2.1 Particle Effects
- **Resource collection**: Particle burst in resource color
- **Build completion**: Sparkle/dust effect
- **Victory points gained**: Star/shine effect
- **Robber**: Dark/ominous particle trail

### 2.2 Screen Effects
- **Milestone announcements**: Full-screen dramatic treatment
- **Roll of 7**: Screen tint/shake for danger
- **Victory**: Enhanced confetti + screen glow
- **Close game**: Vignette/color shift when near victory

### 2.3 Glows and Highlights
- **Current player**: Structures gently pulse
- **Buildable locations**: Valid spots have subtle glow
- **Trade focus**: Relevant player areas highlight

### 2.4 Achievement Moments
- **First of type**: Special animation for first settlement/road/city
- **Tie breaking**: Drama when longest road changes hands
- **Point thresholds**: Celebrations at 5, 8, 10 VP

---

## Phase 3: Living Board

Make the board feel alive at all times.

### 3.1 Animated Terrain Tiles

Create animated versions of all terrain types using AI video generation.

| Terrain | Animation |
|---------|-----------|
| Water | Ripple/shimmer |
| Wheat | Gentle swaying |
| Forest | Wind through trees, shadow movement |
| Sheep/Pasture | Grass movement |
| Ore | Occasional glint/sparkle |
| Desert | Heat haze or dust |

**Asset Pipeline:**
```
Existing PNG → AI Video Gen → Frame extraction → CSS sprite sheet
```

Each terrain has 5 variants, requiring ~25 animated tiles total.

### 3.2 Port Animations
- Boats/docks have subtle rocking motion
- Sailing effect on port trade icons

### 3.3 Robber Presence
- Idle animation (menacing presence)
- Movement animation when relocated

### 3.4 Structure Animations
- Settlements/cities have subtle idle state
- Optional: Smoke, flags, occasional travelers

---

## Phase 4: Timing & Pacing

Create dramatic rhythm and focus.

### 4.1 Suspense Pauses
- Brief pause before dice reveal
- Pause before milestone announcement
- Dramatic pause when approaching victory

### 4.2 Transitions
- Smooth setup → main game transition
- Turn handoff animations
- End game → victory screen

### 4.3 Camera Work
Implement the currently-stubbed focus functions:
- `focusVertex()` - Focus on settlement/city
- `focusEdge()` - Focus on road
- `focusHex()` - Focus on hex tile
- `focusPlayerArea()` - Focus on player's territory
- `cinematicReset()` - Reset to full board view

Dynamic camera behaviors:
- Focus during key moments
- Slow zoom when tension is high

### 4.4 Visual Hierarchy
- Dim inactive areas during actions
- Spotlight system for key moments
- Progressive information reveal

---

## Dependencies

### External Tools Needed
- **AI Video Generation**: For animated terrain tiles (Runway, Pika, or similar)
- **Frame extraction tool**: Convert video to sprite sheets

### Existing Systems Enhanced
- Show layer (toasts, spotlights, confetti)
- Moment detector (event detection)
- Audio system (sound effects)
- Board renderer (SVG tiles)

---

## Success Criteria

After implementation, the game should:
1. Feel like a polished board game app, not a web dashboard
2. Create anticipation during key moments (dice, trades)
3. Celebrate player achievements visibly
4. Have a living, breathing board even during quiet moments
5. Draw the eye to important events through pacing and focus

---

## Next Steps

1. Create detailed implementation plan from this design
2. Prioritize phases (recommend Phase 1 first for highest impact)
3. Begin Phase 1 implementation
