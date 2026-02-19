# Repository Guidelines

## Project Structure & Module Organization

- `apps/server/server.js`: Node HTTP server (API + SSE + static hosting). In-memory rooms/state.
- `apps/server/public/`: client assets
  - `tv/`: TV screen UI
  - `phone/`: phone controller UI
  - `shared/`: shared UI utilities + CSS + board renderer
- `packages/game-engine/`: game state machine (phases, legality checks, trade offer state).
- `packages/shared/`: shared helpers (resources, normalization).
- `roadmaps/`: versioned roadmaps and planning documents.
- Docs: `README.md`, `AGENTS.md`.

## Build, Test, and Development Commands

From the project root:

- `npm run dev`: starts the server (defaults to port `3000`).
- `PORT=3001 npm run dev`: run on a different port.

Open:

- TV: `http://localhost:3000/tv`
- Phone: `http://localhost:3000/phone`

## Coding Style & Naming Conventions

- Languages: plain ES modules (no framework), HTML, CSS.
- Formatting: 2-space indentation, semicolons, `const` by default, `camelCase` for variables/functions.
- Files: prefer `kebab-case` (e.g., `board-ui.js`); DOM ids use `camelCase` (e.g., `tradeSendBtn`).
- Keep UI strings short and actionable (party-game style).

## Testing Guidelines

- No automated test runner is set up yet.
- Before opening a PR, do a manual smoke test: create a room on TV, join 3–4 phones, complete setup placements, roll dice, build, and trade.
- If adding tests, prefer engine-level tests (deterministic) under `packages/game-engine/` using Node’s built-in `node:test`.

## Commit & Pull Request Guidelines

- No Git history was found in this workspace; use Conventional Commits going forward:
  - Example: `feat(catan): add robber discard flow`
  - Example: `fix(server): validate trade acceptance resources`
- PRs: include a brief description, steps to test, and screenshots/GIFs for UI changes. Keep changes focused and update `README.md` or docs in `roadmaps/` when behavior changes.

## Security & Configuration Tips

- Intended for LAN play; the server is in-memory and not hardened for public internet exposure.
- Use `PORT` to avoid conflicts; room codes are not authentication.
