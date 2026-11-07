# Changelog

All notable changes to this project will be documented in this file.

The format is based on **Keep a Changelog**, and this project aims to follow **Semantic Versioning**.

## Unreleased

### Added

- The host's phone has a ♛ menu to remove players, make someone else host, pause the turn timer and end the game. The TV has no controls.
- Trade, bank, discard and Year of Plenty amounts use −/+ steppers with resource icons in place of dropdowns.
- An identity chip on phones shows your name and colour, and a status dot shows the connection.
- Each player has a distinct display colour on the TV and phones.

- TV player rows show each player's card count, highlighted above 7.
- A confirm bar on phones for every board placement, plus a selection marker on the board.

### Changed

- The TV is redesigned for casting: the board fills the screen, players sit in HUD cards along the edges, and the useless buttons are gone. Lobby and end screens are rebuilt Jackbox-style with a big room code, QR code and player tiles.
- Phone lobby: big room code, collapsible game settings, and a sticky "I'm ready"/Start bar with a hint of who you are waiting for.
- Phone game: the main action button sits in the thumb zone, and the trade and turn hints are shorter.
- The post-game feedback form opens from a "Rate this game" button and no longer pops up on its own.

- All phone building now happens on the main board. The separate build overlay and duplicate buttons are gone.
- Board taps snap to the nearest legal spot.
- TV moment cards and toasts moved off the board and status pills, and top bar and player text are larger.
- The TV "Resources collected" toast names who gained what, and is skipped when nobody gained anything.
- Settlements and cities have distinct shapes.

### Fixed

- Kicking a player mid-game no longer resets the current turn. It used to cancel the robber or give the current player a second roll.
- TV score pills such as "10/10 VP" stay on one line.
- Confirm buttons could sit under the build overlay and could not be tapped.
- A pending placement was cleared by unrelated live updates.
- Discard selection could go past the required count, which disabled Submit with no explanation.
- Reconnecting phones were marked disconnected when their old connection closed.
- The join link kept a LAN IP behind a reverse proxy.
- A stray brace in `phone.js` stopped the phone page from loading.
