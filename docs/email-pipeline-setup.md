# Email Pipeline (Resend) Setup

Detailed, step-by-step reference for getting a real inbound email to run through
the VIPER inbox pipeline on your machine. For the short version and when you'd
need this, see the "Email Pipeline (Resend)" section in
[onboarding.md](./onboarding.md).

VIPER turns inbound security emails into Notifications and Work Order tickets.
Resend receives the mail, parses it, and calls a webhook on your machine;
`processInboxEmail` (Inngest) does the rest.

This walks you from nothing to a real email being processed locally. You only
need it if you're working on the inbox pipeline. Allow ~20 minutes.

## 1. Sign up with a personal email

**Use a personal email address, not your work one.**

Our Google Workspace blocks outbound mail to `*.resend.app`, which is exactly where you'll be sending test emails. If your Resend account is tied to your work address you'll be stuck immediately. Sign up at [resend.com](https://resend.com) with a personal address, and send your test emails from that account.

The free tier is plenty, and you get your own sandbox — no shared credentials.

## 2. Sending vs receiving, and API key permissions

Two distinctions trip people up, and they're unrelated:

**The product has two halves.** *Sending* is transactional email your app pushes out. *Receiving* (inbound) is Resend accepting mail on your behalf, parsing it, and calling a webhook. The inbox pipeline only uses **receiving**.

**API keys have two permission levels.** New keys default to **Sending access**, which cannot read received email. The pipeline calls `emails.receiving.get()` and `attachments.get()`, so it needs **Full access** or it dies immediately with a 401.

Create the key under **API Keys → Create API Key → Full access**, then add it to `.env`:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Verify before going further — a `restricted_api_key` error means you made a sending-only key:

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/emails/receiving
```

> ⚠️ Secrets go in `.env`, **never `.env.ci`**. Despite `.gitignore` listing `.env*`, `.env.ci` is *tracked* — tracked files ignore that pattern — and it feeds a GitHub Actions workflow. A key committed there is a leaked key.

## 3. Get your receiving address

Resend gives you a working inbound address with **no domain and no DNS setup**:

> **Emails → Receiving** tab → **⋯** → **Receiving address**

You'll get something like `anything@ab12cd34.resend.app`. The part before the `@` is freeform, so `test@`, `advisories@` etc. all land in the same inbox.

> 🚫 If the dashboard pushes you to "Add a domain", back out. Adding a company domain would reroute real company email into Resend. You do not need it.

## 4. Expose your local app to the internet

Resend has to reach your laptop, so you need a tunnel. (Same applies if you're testing with n8n.)

**cloudflared** is easiest — no account needed:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a URL like `https://corps-issn-portrait-fighter.trycloudflare.com`. Keep the terminal open; **if the process dies the URL changes** and you'll have to update the webhook.

**ngrok** works too, but needs a free account and `ngrok config add-authtoken <token>` first, then `ngrok http 3000`.

Run VIPER with the tunnel URL so the links it generates are correct:

```bash
NEXT_PUBLIC_APP_URL="https://<YOUR_TUNNEL_URL>" npm run dev:all
```

## 5. Point a webhook at your machine

> **Webhooks → Add Webhook**
> - **Endpoint URL:** `https://<YOUR_TUNNEL_URL>/api/email`
> - **Event:** `email.received` — that one only

Copy the **signing secret** it shows you into `.env`:

```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

`/api/email` returns a 500 until *both* `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are set. Restart the dev server after editing `.env` — it's only read at boot.

Sanity check — a **400 is correct** here, it means the route is live and rejecting an unsigned payload. A 500 means a missing env var; a 404 means the tunnel is pointing at the wrong port.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://<YOUR_TUNNEL_URL>/api/email -H 'content-type: application/json' -d '{}'
```

## 6. Set your Anthropic key

The pipeline makes several Anthropic calls (relevance triage, classification, entity extraction, hospital-impact triage), so `ANTHROPIC_API_KEY` must be set in `.env` or the run fails partway through.

## 7. Send a test email

From your **personal** account, email your `@…resend.app` address. Attach a PDF if you want to exercise attachment handling.

Write it like a genuine security advisory. The first agent in the chain decides whether the email is relevant at all, and drops marketing, newsletters and meeting invites as `not_relevant` before anything else runs — a "test test test" email will be correctly ignored.

## 8. Watch it run

Resend POSTs to `/api/email`, which enqueues an Inngest event.

**Inngest dev UI — <http://localhost:8288>** → *Runs* → newest `process-inbox-email`. Every step and its output is visible, which makes this the best place to debug.

Note the webhook payload is **metadata only** — no body, no attachment bytes. The pipeline calls Resend back for the email content and downloads each attachment separately.

**MinIO console — <http://localhost:9001>** (login `minioadmin` / `minioadmin`) → the `viper` bucket → `inbox/<emailId>/`. Attachments are uploaded here, and it's the quickest way to confirm they made it.

**Database** — a successful run leaves a `notification_source` row joined to a `notification` (with `type`, `priority` and a populated `hospitalImpact`), plus one `notification_attachment` per file.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Run dies at `fetch-email-content` with a 401 | Sending-only API key | Step 2 |
| `/api/email` returns 500 | `RESEND_API_KEY` or `RESEND_WEBHOOK_SECRET` missing from `.env` | Steps 2 & 5 |
| `/api/email` returns 404 | Tunnel pointing at the wrong port | Step 4 |
| Webhook never arrives | Tunnel died, so its URL changed | Restart it, update the webhook URL |
| Gmail bounces with "Message blocked" | Workspace blocks `*.resend.app` | Send from a personal account (step 1) |
| Run returns `{skipped: true, reason: "duplicate"}` | That email was already processed — `externalId` is unique | Send a new email |
| Run returns `{skipped: true}` | Triage judged the email `not_relevant` | Write a realistic advisory (step 7) |
