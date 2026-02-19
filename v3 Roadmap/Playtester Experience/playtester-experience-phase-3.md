# Playtester Experience — Phase 3: Accessibility Audit (P2)

## Goal
Verify and complete accessibility features: colorblind mode, screen reader basics for lobby, and touch target size compliance.

## Non-goals
- No full WCAG AA compliance (stretch goal).
- No voice control.
- No alternative input methods.

## Player-facing outcomes
- Colorblind mode provides complete differentiation (no color-only indicators).
- Lobby is navigable with screen reader (basic support).
- All touch targets meet minimum size requirements (44x44px).

## Technical plan
### Server
- No changes required.

### Engine
- No changes required.

### TV
- Audit all color-only indicators; add shape/pattern differentiation.
- Verify focus indicators are visible for keyboard navigation.
- Add ARIA labels to key interactive elements.

### Phone
- Audit touch target sizes:
  - All buttons minimum 44x44px
  - Adequate spacing between targets
  - Hex/vertex/edge tap targets appropriately sized
- Audit colorblind mode:
  - Player colors have pattern/shape differentiation
  - Resource icons distinguishable by shape
  - Status indicators not color-only
- Add basic screen reader support for lobby:
  - ARIA labels on room list, join buttons
  - Announce room state changes

### Shared
- Create accessibility testing checklist.
- Document colorblind palette and pattern mappings.
- Ensure all shared components have appropriate ARIA attributes.

## APIs & data shape changes
- No API changes.

## Acceptance criteria
- Colorblind mode tested with simulator; all elements distinguishable.
- Touch targets verified at 44x44px minimum.
- Lobby navigable with VoiceOver/TalkBack (basic flow).
- No accessibility regressions from V2.

## Manual test scenarios
1) Enable colorblind mode → verify all player colors distinguishable.
2) Enable colorblind mode → verify resource icons distinguishable by shape.
3) Use VoiceOver on phone → navigate lobby and join a room.
4) Measure touch targets → verify minimum 44x44px.
5) Use keyboard on TV → verify focus indicators visible.

## Risk & rollback
- Risk: Screen reader support may require significant markup changes.
- Risk: Increasing touch target size may affect layout.
- Rollback: Keep accessibility features behind settings toggles; revert layout changes if needed.
