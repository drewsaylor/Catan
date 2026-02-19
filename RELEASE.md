# Release process

This repo is a LAN-hosted “TV + phones” game. Releases are mostly about **a stable host build** and **clear notes**, not packaging.

## Versioning

- Use **Semantic Versioning**: `MAJOR.MINOR.PATCH`
- Recommended tagging convention: `vMAJOR.MINOR.PATCH` (example: `v1.0.0`)
- Changelog source of truth: `CHANGELOG.md`

## `v1.0.0` criteria (definition of “V1”)

- **All P0 phases complete** (all `v1 Roadmap/**` P0 phase docs show “Complete”).
- **Automated tests pass** on a clean checkout: `npm test`.
- **Manual smoke test passes** (see below).

## Checklist (for any release)

1. Update `CHANGELOG.md`

- Move items from “Unreleased” into a new version section (dated).
- Keep entries short and player/host-impact focused.

2. Run automated tests

```sh
npm test
```

3. Manual smoke test (LAN)

- Start the server: `npm run dev` (or `npm start`).
- TV: open `http://<host-ip>:3000/tv`, create a room.
- Phones: join `http://<host-ip>:3000/phone` with **3–6** players.
- Verify:
  - ready/unready + host start
  - setup placements for all players
  - roll dice → build road/settlement/city
  - open/accept/reject/cancel a trade
  - roll a 7 and complete discard → move robber → steal flow
  - end turn + turn advances cleanly
  - refresh TV and one phone mid-game and rejoin works

4. Tag and publish (if using git)

```sh
git tag vX.Y.Z
git push --tags
```
