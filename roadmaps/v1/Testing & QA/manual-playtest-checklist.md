# Catan LAN — Manual Playtest Pack (v1)

Use this when doing a manual smoke, a longer playtest, or a light soak.

## Before you start

- [ ] Start the server: `npm run dev`
- [ ] Put all devices on the same Wi‑Fi (no VPN).
- [ ] TV opens: `http://localhost:3000/tv`
- [ ] Phones open (or scan the QR): `http://<host-ip>:3000/phone`
- [ ] If a device is “stuck” in the wrong room/player, use “Leave room” (or clear site data).

## Pass / fail shortcuts

- Fail if: server crashes, room becomes unusable, players duplicate, state “rewinds”, or a player can’t rejoin their seat.
- Note: a brief “Reconnecting…” overlay during Wi‑Fi changes is expected.

## 3-player session checklist

### Lobby

- [ ] TV: Create a room.
- [ ] 3 phones: Join with distinct names.
- [ ] TV: Verify all 3 players appear and show as connected.
- [ ] Host phone: Open **Advanced** and set **VP to win = 6**; TV shows **Mode: Custom (6 VP)**.
- [ ] Host phone: Open **Advanced** and set **Host PIN = 1234** (any 4–8 digits).
- [ ] Host phone: Change **Max players**; wrong PIN is rejected; correct PIN works.
- [ ] TV: Open **Host Controls** and **Download room snapshot**; prompts for PIN and downloads JSON.
- [ ] Phones: Toggle Ready on all 3.
- [ ] Host phone: Start game.

### Setup placements

- [ ] All players complete initial placements (2 settlements + 2 roads each, in order).
- [ ] Phone UI always shows legal placement hints (no “dead end” where you can’t proceed).
- [ ] TV board matches what phones confirm.

### Core gameplay smoke

- [ ] Roll dice a few times; resources/hands update without desync.
- [ ] Build a road and a settlement; verify costs are applied once and pieces render once.
- [ ] Create a player trade; verify reject and accept both work (no stuck offer).
- [ ] Do a bank trade (4:1 or port if available).
- [ ] Buy a dev card (if possible) and verify play restrictions (at most one dev card per turn).
- [ ] Win at **6 VP** (custom target): game ends immediately and winner is correct.

### Rejoin checks

- [ ] Phone reload (Cmd+R / pull-to-refresh): rejoins as the same player (no duplicate seat).
- [ ] Phone Wi‑Fi off for ~10s, then on: returns to the room and continues.
- [ ] TV reload: room state returns and host controls still work (admin stays claimed).

## 4-player session checklist

### Lobby capacity

- [ ] Host phone sets max players to 4.
- [ ] Join 4 phones; 5th join attempt is rejected as “Room is full”.

### Mid-game stability

- [ ] Play at least ~10 turns total (quick actions are fine).
- [ ] Run at least 3 reconnect events during the game (reload / Wi‑Fi off-on) and confirm:
  - [ ] No duplicate players are created.
  - [ ] Rejoined player keeps their identity and can act when it’s their turn.
  - [ ] Board state matches across TV + phones after reconnect.

## 6-player session checklist

### Lobby capacity

- [ ] Host phone sets max players to 6.
- [ ] Join 6 phones; 7th join attempt is rejected as “Room is full”.

### Responsiveness

- [ ] TV board interactions remain responsive during frequent state updates.
- [ ] Phones stay responsive switching tabs (Board / Hand / Trade, etc.).

### Rejoin under load

- [ ] Take 2 phones offline (Wi‑Fi off) for ~15s and return them.
- [ ] Reload 1 phone while it’s waiting for input (e.g., during placement prompts) and confirm it can continue.

## Disconnect / reconnect matrix

Run as many rows as you can during a 4p or 6p game.

| Device | Phase   | Action                                | Pass if                                                      |
| ------ | ------- | ------------------------------------- | ------------------------------------------------------------ |
| Phone  | Lobby   | Reload page                           | Rejoins same player; no duplicate in player list             |
| Phone  | Lobby   | Wi‑Fi off ~10s                        | Shows reconnecting; returns connected; seat preserved        |
| Phone  | Setup   | Reload during placement prompt        | Rejoins; can still complete required prompt                  |
| Phone  | Main    | Wi‑Fi flap (off-on 3x)                | Eventually reconnects; state matches TV                      |
| Phone  | Trade   | Sender reloads while offer is open    | Rejoins; offer state is consistent (not “ghost open”)        |
| Phone  | Trade   | Recipient reloads while offer is open | Rejoins; can still accept/reject (or offer cleanly resolves) |
| Phone  | Any     | Background app ~30s then return       | Still connected or reconnects cleanly                        |
| TV     | Lobby   | Reload page                           | Room returns; players still present; host stays admin        |
| TV     | In game | Reload page                           | Game state returns; board matches phones                     |
| Server | Lobby   | Restart server process                | Room restores from disk; players can rejoin                  |
| Server | In game | Restart server process                | Game restores; players can rejoin; no stuck room             |

## “Worst Wi‑Fi” checklist (light soak)

Aim for 30–60 minutes.

- [ ] Put at least 1–2 phones on the edge of Wi‑Fi range (or use a network conditioner if available).
- [ ] Start a 4p or 6p game and keep it running continuously.
- [ ] Every ~5 minutes:
  - [ ] Reload one phone.
  - [ ] Toggle Wi‑Fi off ~10s on a different phone.
  - [ ] Perform 1–2 state-changing actions (build / trade / end turn).
- [ ] Watch for:
  - [ ] “Reconnecting…” overlay clears without manual intervention.
  - [ ] No duplicated actions from double taps after reconnect.
  - [ ] No state rewind after reconnect (TV and phones agree).
  - [ ] No long-term drift (hand sizes, pieces, current player).

## Notes / issues to capture

- [ ] What room code, how many players, and device types.
- [ ] Exact steps to reproduce (include phase: lobby/setup/main/trade/robber).
- [ ] Screenshot/video of TV + one phone if the state diverges.
