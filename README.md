# Nova Portal ✨

**URL:** [beric.ca/nova](https://beric.ca/nova)

A personal dashboard and chat interface for interacting with Nova.

![Nova Portal](https://img.shields.io/badge/Status-In%20Development-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- 💬 **Chat** — Real-time conversation with Nova via Clawdbot Gateway
- 📊 **Dashboard** — System status (VM, EC2, Tailscale, email)
- 📋 **Kanban** — Full-featured task management with drag & drop
- 📝 **Notes** — Access to memory files and daily logs

## Screenshots

```
┌─────────────────────────────────────────────────────────┐
│  ✨ Nova                                                │
│  ─────────                                              │
│  💬 Chat        │  Chat with Nova                      │
│  📊 Dashboard   │  ─────────────────                   │
│  📋 Tasks       │  Hey Eric! I'm Nova.                 │
│  📝 Notes       │  What can I help you with? ✨        │
│                 │                                       │
│  ● Connected    │  [Type a message...]          [Send] │
└─────────────────────────────────────────────────────────┘
```

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

- **Frontend:** Vanilla HTML/CSS/JS (fast, no build step)
- **Styling:** CSS custom properties, Tokyo Night theme
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Workers
- **Backend:** Clawdbot Gateway API
- **Storage:** Cloudflare KV (tasks), LocalStorage (fallback)

## Quick Start

### Local Development

```bash
# Clone the repo
git clone https://github.com/BaruchEric/nova-portal.git
cd nova-portal

# Start local server
cd public
python3 -m http.server 8080

# Open http://localhost:8080
```

### Deploy to Cloudflare

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy static site
wrangler pages deploy ./public --project-name=nova-portal

# Deploy API worker
cd workers
wrangler deploy
```

## Configuration

### Environment Variables (Worker)

Set these in Cloudflare Dashboard → Workers → Settings → Variables:

| Variable | Description |
|----------|-------------|
| `CLAWDBOT_GATEWAY_URL` | URL to your Clawdbot Gateway |
| `CLAWDBOT_GATEWAY_TOKEN` | Auth token for Gateway API |

### KV Storage (Optional)

For persistent task storage across devices:

```bash
# Create KV namespace
wrangler kv:namespace create "NOVA_KV"

# Add binding to wrangler.toml
# [[kv_namespaces]]
# binding = "NOVA_KV"
# id = "your-kv-namespace-id"
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Focus chat input |
| `Cmd/Ctrl + 1` | Go to Chat |
| `Cmd/Ctrl + 2` | Go to Dashboard |
| `Cmd/Ctrl + 3` | Go to Tasks |
| `Cmd/Ctrl + 4` | Go to Notes |
| `Escape` | Close modals |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message to Nova |
| `/api/status` | GET | Get system status |
| `/api/notes` | GET | List notes |
| `/api/notes?file=<id>` | GET | Get note content |
| `/api/tasks` | GET | Get all tasks |
| `/api/tasks` | POST | Save tasks |

## Project Structure

```
nova-portal/
├── public/
│   ├── index.html    # Main app
│   ├── styles.css    # All styles
│   └── app.js        # All logic
├── workers/
│   ├── api.js        # Cloudflare Worker
│   └── wrangler.toml # Worker config
└── README.md
```

## Contributing

This is Nova's personal project. Contributions welcome via PR.

## License

MIT License - feel free to use and modify.

---

Built with ✨ by Nova Sinclair
