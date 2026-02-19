# Performance & Feel — Phase 1: Interaction Polish (P0)

## Goal

Improve the tactile feel of interactions: button press feedback, reduced tap-to-response latency, and smoother phone transitions.

## Non-goals

- No 3D rendering optimizations (Phase 3).
- No asset loading changes (Phase 2).
- No new UI components.

## Player-facing outcomes

- Buttons feel responsive with visual bounce and optional haptic feedback.
- Tap-to-response time is perceptibly faster.
- Transitions between screens/states feel smooth.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Add visual feedback (scale bounce, color flash) to clickable elements.
- Ensure animations complete in <100ms for perceived responsiveness.

### Phone

- Add haptic feedback on key actions (button press, build, trade confirm).
- Add visual bounce/feedback on touch.
- Audit CSS transitions; replace any >200ms transitions with faster alternatives.
- Use `will-change` hints for animating elements.

### Shared

- Create a shared interaction feedback utility:
  - `triggerHaptic(type: 'light' | 'medium' | 'heavy')`
  - `animatePressEffect(element)`
- Ensure utility gracefully degrades on unsupported devices.

## APIs & data shape changes

- No API changes.
- New shared utility module for interaction feedback.

## Acceptance criteria

- All primary buttons (build, trade, end turn) have visual feedback.
- Phone provides haptic feedback on key actions (where supported).
- No button press feels "stuck" or unresponsive.
- Transitions complete in <200ms.
- Feedback works with reduced motion setting (visual only, no bounce).

## Manual test scenarios

1. Tap "End Turn" on phone → feel haptic + see visual feedback.
2. Tap build buttons rapidly → no missed taps or stuck states.
3. Enable reduced motion → verify feedback is still present but subtle.
4. Navigate between screens → verify smooth transitions.

## Risk & rollback

- Risk: Haptics may drain battery on some devices.
- Risk: Over-animation may feel distracting.
- Rollback: Disable haptics via settings flag; reduce animation intensity.
