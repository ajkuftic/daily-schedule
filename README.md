# Daily Schedule

A self-hosted web app that sends your family a daily email newsletter with today's calendar events, weather, and an AI-written blurb. Configure it once through a browser UI, then get a digest every morning (or whenever you schedule it).

## Features

- Pulls events from Google Calendar, Outlook/Microsoft 365, Apple iCloud, CalDAV, and ICS feeds
- Current weather via Open-Meteo (no API key required)
- AI blurb summarising the day (requires an Anthropic API key)
- Sends via Gmail OAuth, SMTP, or any compatible mail provider
- Configurable schedule (any hour of the day)
- Incoming webhook to trigger a send from external automations (Home Assistant, Zapier, Make, etc.)
- Outgoing webhook notifies a URL after each successful send
- Live preview in the browser before sending
- Simple browser-based setup UI — no config files to edit

## Quick Start with Docker

**Prerequisites:** Docker and Docker Compose installed.

```bash
# 1. Clone the repo
git clone https://github.com/ajkuftic/daily-schedule.git
cd daily-schedule

# 2. Create a .env file with a strong session secret
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# 3. Start the app
docker compose up -d

# 4. Open the setup UI
open http://localhost:3000
```

Data (SQLite database, session store) is persisted in `./data` on the host.

### Stopping and updating

```bash
# Stop
docker compose down

# Pull latest image and restart
docker compose pull && docker compose up -d
```

## Running without Docker

**Prerequisites:** Node.js 22+

```bash
npm install
npm start        # production
npm run dev      # development (auto-restarts on file changes)
```

The app listens on port 3000 by default. Set `PORT` in your environment to change it.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Directory for SQLite databases |
| `SESSION_SECRET` | `change-me` | Secret for signing session cookies — **change this in production** |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID (can also be set in the UI) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret (can also be set in the UI) |

All other settings (family name, calendars, email, schedule, API keys) are configured through the web UI and stored in the SQLite database.

## Setup Walkthrough

Navigate to `http://localhost:3000` and complete each step in the left nav:

1. **Family** — family name, recipient email address, timezone, and default city for weather
2. **Calendars** — add one or more calendar sources (Google, Outlook, iCloud, CalDAV, ICS)
3. **Email** — configure how the newsletter is sent (Gmail OAuth or SMTP)
4. **API Keys** — Anthropic API key for AI blurbs (optional but recommended)
5. **Schedule** — choose the daily send time
6. **Google OAuth** — required only if you use Google Calendar or Gmail
7. **Webhooks** — incoming trigger URL and optional outgoing notification URL

Once all steps are done, the **Dashboard** will show a "Send Now" button and a "Preview" link.

## Google OAuth Setup

To use Google Calendar or send via Gmail:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the **Google Calendar API** and/or **Gmail API**.
3. Create OAuth 2.0 credentials (type: Web application).
4. Add `http://localhost:3000/auth/google/callback` as an authorised redirect URI (adjust the host/port for your deployment).
5. Copy the Client ID and Client Secret into the app under **API Keys** or **Google OAuth**.
6. Click **Authorise Google** on the Google OAuth setup page.

## Incoming Webhook

The app generates a secret URL on the Webhooks page:

```
POST http://localhost:3000/webhook/<your-secret>
```

Calling this endpoint triggers an immediate newsletter send, identical to clicking "Send Now". Use it with any automation platform that can make HTTP requests.

## Outgoing Webhook

Enter a URL on the Webhooks page and the app will `POST` a JSON payload to it after each successful send:

```json
{
  "date": "2026-03-20",
  "dateStr": "Thursday, March 20, 2026",
  "status": "success",
  "subject": "The Daily Kuftic — Thursday, March 20, 2026",
  "sentTo": "family@example.com"
}
```

## Deploying to a Server

Any machine that can run Docker works. A few things to keep in mind:

- **Reverse proxy**: Run Caddy or nginx in front of the app and terminate TLS there. Point it at `localhost:3000`.
- **Session secret**: Set a strong `SESSION_SECRET` in your `.env` — the default `change-me` is not safe.
- **Persistent data**: Make sure the `./data` volume mount points somewhere that survives container restarts and host reboots.
- **Google OAuth redirect URI**: Update the authorised redirect URI in the Google Cloud Console to your real domain, e.g. `https://daily.example.com/auth/google/callback`.

### Example: Caddy reverse proxy

```
daily.example.com {
    reverse_proxy localhost:3000
}
```

### Example: docker-compose.yml for a named volume

```yaml
services:
  daily-schedule:
    image: ghcr.io/ajkuftic/daily-schedule:latest
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - data:/data
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
    restart: unless-stopped

volumes:
  data:
```

## Tech Stack

- **Runtime**: Node.js 22 / Express
- **Templates**: EJS
- **Database**: SQLite via better-sqlite3
- **Calendar integrations**: googleapis, @azure/msal-node, tsdav, native fetch for ICS
- **Email**: nodemailer (SMTP + Gmail OAuth)
- **Weather**: Open-Meteo API (free, no key required)
- **AI blurbs**: Anthropic Claude via @anthropic-ai/sdk
