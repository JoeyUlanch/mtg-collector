# Docker setup for MTG Collector

Self-host the full app (UI + API + SQLite) in one container.

## Requirements

- [Docker](https://docs.docker.com/get-docker/) Desktop (Windows/Mac) or Docker Engine + Compose plugin (Linux)

## Start (recommended)

From the project root:

```bash
docker compose up -d --build
```

Open:

| Device | URL |
|--------|-----|
| This machine | http://localhost:3847 |
| Phone (same Wi‑Fi) | http://**YOUR-HOST-IP**:3847 |

Check status:

```bash
docker compose ps
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Data is kept in the Docker volume `mtg-collector-data` when you `down` (unless you add `-v`).

## First-time setup

1. Open the app in a browser  
2. **Create account** for yourself (and each family member)  
3. Scan or search cards into binders  

## Configuration

Optional: copy `.env.example` → `.env` and edit:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3847` | Host port mapped to the container |
| `SESSION_SECRET` | (compose default) | Cookie signing secret — **change for trusted networks** |
| `PUBLIC_URL` | _(empty)_ | Optional full URL shown in Settings (e.g. `http://192.168.1.20:3847`) |

Example `.env`:

```env
PORT=3847
SESSION_SECRET=your-long-random-secret
PUBLIC_URL=http://192.168.1.20:3847
```


Recreate after changing env:

```bash
docker compose up -d
```

## Data & backups

SQLite lives in the named volume **`mtg-collector-data`** at `/data/mtg.db` inside the container.

**Backup:**

```bash
docker compose cp mtg-collector:/data/mtg.db ./mtg-backup.db
```

**Restore:**

```bash
docker compose cp ./mtg-backup.db mtg-collector:/data/mtg.db
docker compose restart
```

**Bind-mount instead of a named volume** (easy folder backup) — edit `docker-compose.yml`:

```yaml
volumes:
  - ./data:/data
```

Then back up the local `./data` folder.

## Update

```bash
git pull
docker compose up -d --build
```

## Common commands

```bash
# Rebuild from scratch
docker compose build --no-cache
docker compose up -d

# Shell into the container
docker compose exec mtg-collector sh

# Remove container AND delete collection data
docker compose down -v
```

## Phone / firewall notes

- Host and phone must share a LAN (or VPN like Tailscale)  
- Allow inbound TCP **3847** on the host firewall  
- Camera may need permission; **Upload photo** always works if the camera is blocked on plain HTTP  

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port already in use | Set `PORT=3850` in `.env` and `docker compose up -d` |
| Blank page / old UI | `docker compose up -d --build` |
| Lost collection after rebuild | Don’t use `down -v`; restore from backup |
| Unhealthy container | `docker compose logs mtg-collector` |
| Permission errors on bind mount | Ensure `./data` is writable by UID 1001 |

## Architecture

```
Browser / phone
      │
      ▼
 :3847  →  container (Express + static React)
                │
                ▼
           /data/mtg.db  (volume)
                +
           Scryfall API (outbound HTTPS)
```

One image, one process, no external database.
