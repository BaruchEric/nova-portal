# Nova Portal

**URL:** beric.ca/nova

A personal dashboard and chat interface for interacting with Nova.

## Features

- 💬 **Chat** — Real-time conversation with Nova
- 📊 **Dashboard** — System status, tasks, and metrics
- 📋 **Kanban** — Task management board
- 📝 **Notes** — Access to memory/notes

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Cloudflare     │────▶│  Static Site     │
│  Pages          │     │  (Frontend)      │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         │              ┌────────▼─────────┐
         │              │  Cloudflare      │
         └──────────────│  Workers (API)   │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │  Clawdbot        │
                        │  Gateway         │
                        └──────────────────┘
```

## Tech Stack

- **Frontend:** HTML/CSS/JS (vanilla, fast)
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Workers
- **Backend:** Clawdbot Gateway API

## Development

```bash
# Local dev
cd ~/clawd/projects/nova-portal
python3 -m http.server 8080

# Deploy
wrangler pages deploy ./public
```
