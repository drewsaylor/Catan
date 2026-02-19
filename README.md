# Catan LAN (TV + Phones)

LAN-hosted Catan-style party game: the TV is the “host”, phones are controllers.

- TV screen: `http://<host-ip>:3000/tv`
- Phone controller: `http://<host-ip>:3000/phone`

## Requirements

- Node.js `>=20`
- A host machine on the same LAN as your players (laptop, mini PC, VM, or Proxmox LXC)

## Quickstart (run locally)

From the repo root:

```sh
npm run dev
```

Open:

- TV: `http://localhost:3000/tv`
- Phone: `http://localhost:3000/phone`

## Hosting / Deploy (Proxmox VM/LXC runbook)

This is intended for trusted LAN play (no auth; don’t expose it to the public internet).

### 0) Choose where it runs

- **Proxmox VM**: simplest to reason about; any Debian/Ubuntu VM works.
- **Proxmox LXC**: lighter-weight; great for always-on LAN hosting.

Either way, the VM/LXC should be **bridged to your LAN** so it gets its own LAN IP (not NAT).

Suggested sizing: 1–2 vCPU, 512MB–1GB RAM, 1–2GB disk (+ optional persistent mount for saves).

### 1) Install Node 20

Debian/Ubuntu:

```sh
sudo apt-get update
sudo apt-get install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### 2) Put the repo on the host

Pick a location (example: `/opt/catan-lan`):

```sh
sudo mkdir -p /opt/catan-lan
sudo chown -R $USER:$USER /opt/catan-lan
```

Then either `git clone` the repo there, or copy this folder over (scp/rsync/etc).

If/when this repo gains npm dependencies, run:

```sh
cd /opt/catan-lan
npm install --omit=dev
```

### 3) Configure persistence (recommended)

Rooms persist as JSON under `DATA_DIR/rooms/`.

- Default: `apps/server/data`
- Recommended for hosting: set `DATA_DIR=/var/lib/catan-lan` (or an LXC mount point)

```sh
sudo mkdir -p /var/lib/catan-lan
```

### 4) Useful env vars

- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)
- `DATA_DIR` (default `apps/server/data`) — persistence root (rooms stored under `rooms/`)
- `ROOM_TTL_HOURS` (default `0` = disabled) — prune inactive rooms after this many hours (only when no active SSE clients)
- `LOG_LEVEL` (default `info`) — `debug` | `info` | `warn` | `error` | `silent`

### 5) Run with systemd

Create a user (recommended):

```sh
sudo useradd --system --user-group --shell /usr/sbin/nologin catan || true
sudo chown -R catan:catan /opt/catan-lan /var/lib/catan-lan
```

Create `/etc/systemd/system/catan-lan.service`:

```ini
[Unit]
Description=Catan LAN
After=network.target

[Service]
Type=simple
User=catan
Group=catan
WorkingDirectory=/opt/catan-lan
ExecStart=/usr/bin/npm run start
Restart=always
Environment=HOST=0.0.0.0
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/catan-lan
Environment=ROOM_TTL_HOURS=0
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
```

Enable/start:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now catan-lan
```

### 6) Open the port (Proxmox + OS firewall)

- Proxmox firewall: allow inbound TCP `3000` (or your `PORT`) to the VM/LXC.
- If using `ufw` on the guest:

```sh
sudo ufw allow 3000/tcp
```

### 7) Verify it’s up

Health check:

```sh
curl -s http://127.0.0.1:3000/healthz
```

Logs:

```sh
sudo journalctl -u catan-lan -f
```

### 8) Find the host IP (so the TV can open it)

Use the **LAN IP** of the machine running the server:

- Debian/Ubuntu (VM/LXC): `hostname -I`
- macOS (hosted on your Mac): `ipconfig getifaddr en0` (Wi‑Fi) or `ipconfig getifaddr en1` (Ethernet)
- Windows: run `ipconfig` and look for `IPv4 Address`

In Proxmox, you can also check the VM/LXC IP in the guest console (`ip addr`) or in your router’s DHCP leases.

Then on the TV browser open:

- `http://<host-ip>:3000/tv`

Phones open:

- `http://<host-ip>:3000/phone`

### Updating the host

From the repo directory:

```sh
git pull
sudo systemctl restart catan-lan
```

## Notes (what’s implemented)

- Rooms persist to disk (`DATA_DIR/rooms/*.json`), so restarting the server can resume games (best-effort; optional pruning via `ROOM_TTL_HOURS`)
- Lobby supports **3–6 max players** (default 4). Host sets in the lobby.
- Game modes: **Classic** (10 VP) or **Quick Game** (8 VP + turn nudges + setup assist). Host picks in the lobby.
- Lobby + host start + setup placements + turn loop (roll dice → robber flow on 7 → main → end turn)
- Build actions: road / settlement / city (with costs + legality checks)
- Trading: offer/accept/reject/cancel (player-to-player resource exchange)
- Bank trades + ports: 4:1 baseline, 3:1 generic ports, 2:1 specific ports (ownership-based)
- Victory points: settlements/cities; game ends at 10 VP (Classic) or 8 VP (Quick Game)
- Dev cards + largest army + longest road are implemented.

## Roadmap

- See `roadmaps/` for versioned roadmaps and planning documents
