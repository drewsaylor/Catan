# Host & Ops Improvements — Phase 1: Deployment Readiness (Proxmox-friendly) (P0)

## Status
- Complete (2026-02-12)

## Goal
Make the server easy to operate: config knobs, health checks, and clear docs.

## Technical plan
### Server
- Add `GET /healthz` → `{ ok: true, uptimeMs, roomsCount }`.
- Add env vars:
  - `DATA_DIR`
  - `ROOM_TTL_HOURS`
  - `LOG_LEVEL` (default `info`)

### Docs
- Update repo `README.md` with:
  - example systemd unit
  - Proxmox/LXC notes (bind host, open port, persistent data dir)

## Acceptance criteria
- `curl http://host:PORT/healthz` works reliably.

## Risk & rollback
- Risk: None (pure additive).
