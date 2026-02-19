# Documentation & Release — Phase 1: Docs for Real Hosting (P0)

## Status
- Complete (2026-02-14)

## Goal
Update docs so hosting is straightforward and repeatable.

## Technical plan
- Update repo `README.md`:
  - reflect post-`PLAN.md` + post-`POLISH-PLAN.md` reality
  - Proxmox runbook (VM/LXC)
  - “How to find host IP” instructions for TV

## Acceptance criteria
- A new host can deploy from scratch using only README.

## Shipped
- Root `README.md` updated to match current V1 scope (post `PLAN.md` + `POLISH-PLAN.md`).
- Added a Proxmox-friendly VM/LXC runbook (systemd + firewall + persistence).
- Added “find host IP” instructions so the TV can open `/tv`.
