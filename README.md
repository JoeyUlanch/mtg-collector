<p align="center">
  <strong>◆ MTG Collector</strong><br>
  <em>Scan, price, and organize your Magic: The Gathering collection — at home, on any device.</em>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="MTG Collector dashboard" width="900" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#phone-access">Phone access</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#tech-stack">Tech</a>
</p>

---

## About

**MTG Collector** is a self-hosted web app for managing a physical Magic card collection. Run it on your computer, open it on your phone over Wi‑Fi, and scan cards with the camera. Each family member gets their own login, binders, and wishlist — no cloud account required.

Card data and market prices come from [Scryfall](https://scryfall.com). Everything else stays on your machine in a local SQLite database.

---

## Features

| | |
|---|---|
| **📷 Card scanning** | Camera or photo upload → OCR → auto-match name & printing |
| **💰 Live pricing** | USD market values (foil & non-foil) via Scryfall |
| **📁 Multiple binders** | Separate collections (EDH, trades, bulk, kids…) |
| **👤 Family accounts** | Private logins — collections never mix |
| **🔍 Search** | Full Scryfall catalog + search within your own cards |
| **↕️ Sort & filter** | Name, price, CMC, rarity, set, type, foil, condition, date |
| **⭐ Wishlist** | Track wants; one tap to move into a binder when you get them |
| **📊 Stats** | Total value, rarity breakdown, most valuable cards |
| **⬇️ Export** | CSV export per binder |
| **🔄 Price sync** | Refresh market values anytime |
| **📋 QoL** | Condition / foil / notes, duplicates finder, move between binders |

---

## Quick start

**Requirements:** [Node.js](https://nodejs.org/) 18+

### Windows (easiest)

Double-click **`start-dev.bat`** for development, or **`start.bat`** for a single-port production build.

### Command line

```bash
npm run setup
npm run dev
```

| Where | URL |
|--------|-----|
| This PC | http://localhost:5173 |
| Phone (same Wi‑Fi) | http://**YOUR-PC-IP**:5173 |

Production (one port, good for sharing on the network):

```bash
npm run setup
npm run build
npm start
```

Then open **http://YOUR-PC-IP:3847**.

---

## Phone access

1. PC and phone on the **same Wi‑Fi**
2. Start the app
3. On your phone, open the **Network** URL (shown in the terminal, or under **Settings** after login)

If the phone can’t connect, allow inbound TCP on ports **5173** and **3847** (Private network) in Windows Firewall.

---

## Usage

1. **Register** an account for each person  
2. **Scan** a card (center the name line) or **search** the catalog  
3. Pick the **exact set/printing**, condition, foil, and binder  
4. Browse **Binders** to sort, filter, edit qty, and check value  
5. Use **$ Sync** on a binder to refresh prices  

Tips for scanning: good light, sharp focus on the **card name**, or fall back to typing the name.

---

## Tech stack

- **Frontend** — React, Vite, mobile-first UI  
- **Backend** — Node.js, Express, session auth  
- **Database** — SQLite (`server/data/mtg.db`)  
- **Recognition** — Tesseract.js OCR + Scryfall fuzzy match  
- **Prices & catalog** — [Scryfall API](https://scryfall.com/docs/api)

---

## Project layout

```
├── client/          # React UI
├── server/          # API, auth, OCR, Scryfall
├── docs/            # Screenshots & assets
├── start-dev.bat    # Dev server (Windows)
└── start.bat        # Production server (Windows)
```

---

## Data & privacy

- All collection data lives in **`server/data/mtg.db`** — back up that file  
- No third-party accounts; sessions stay on your home server  
- Images and prices are fetched from Scryfall as needed  
- Prices are market **estimates**, not live checkout quotes  

---

## License

Personal / family use. Card imagery and data © Wizards of the Coast / provided via Scryfall’s API terms.
