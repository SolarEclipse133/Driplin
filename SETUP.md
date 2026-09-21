# Driplin Setup Guide

This guide assumes no coding experience. It lists every account and key the
app needs, where to get each one, and where to put it. You only need the
section for the feature currently being built — sections are marked with
when they become necessary.

## Where keys live (read once)

Secrets are **never** written into the code and never committed to GitHub.
Depending on where the app is running, they live in one of three places:

| Where the app runs | Where the keys go |
|---|---|
| Claude's remote coding session | The environment settings page at claude.ai/code (environment variables) |
| Your own computer (`npm run dev`) | A file called `.env.local` in the project folder — copy `.env.example` to `.env.local` and fill in values |
| The live site on Vercel | Vercel dashboard → your project → Settings → Environment Variables |

The variable **names** are identical in all three places and are all listed
in `.env.example`.

---

## 1. Supabase (needed now — feature 1: login)

Supabase hosts the database and handles passwords.

1. Go to https://supabase.com and create a free account.
2. Click **New project**. Pick any name (e.g. "driplin"), set a strong
   database password (save it somewhere safe — you rarely need it again),
   and choose a region near Texas (e.g. *US East*). Wait ~2 minutes for it
   to provision.
3. **Run the database setup script:** in the left sidebar choose
   **SQL Editor**, click **New query**, open the file
   `supabase/migrations/0001_auth_and_organizations.sql` from this project
   on GitHub, copy its entire contents into the query box, and click
   **Run**. You should see "Success. No rows returned."
4. **Get your keys:** left sidebar → **Project Settings** (gear icon) →
   **API**. Copy these three values into wherever the app is running
   (table above):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
     ⚠️ This one is an admin key. Treat it like a bank password.
5. **Recommended while testing:** left sidebar → **Authentication** →
   **Sign In / Providers** → **Email** → turn **off** "Confirm email".
   This lets you sign up and log in immediately without clicking a link in
   an email. Turn it back on before real customers use the app.

## 2. Rachio (needed for feature 3)

1. Log in at https://app.rach.io with the account that owns (or test-drives)
   the controller.
2. Click your account icon → **Account Settings** → **GET API KEY**.
3. Copy the key → `RACHIO_API_KEY`.

Note: property managers don't need this — they paste their own company's
Rachio key into the app when connecting their first controller (Property →
Connect a Rachio controller). The env var is only a convenience for
development/testing.

## 3. Hydrawise (needed for feature 8 — later)

Once Hunter approves your API access: Hydrawise account → **Account
Details** → **Generate API Key** → `HYDRAWISE_API_KEY`. Until then the app
uses a built-in simulated Hydrawise controller, so nothing is needed now.

## 4. Twilio — SMS alerts (needed for feature 6)

1. Create an account at https://www.twilio.com (trial works for testing;
   trial accounts can only text phone numbers you verify with them).
2. Buy/claim a phone number with SMS capability.
3. From the Console home page copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
   - Your Twilio number (format `+15125551234`) → `TWILIO_FROM_NUMBER`

## 5. Resend — email alerts (needed for feature 6)

1. Create an account at https://resend.com (free tier is fine).
2. **API Keys** → **Create API Key** → copy it → `RESEND_API_KEY`.
3. To send from your own domain later you'll verify the domain there;
   for testing, Resend's built-in `onboarding@resend.dev` sender works.

## 6. Internal settings (needed for feature 4)

- `CREDENTIALS_ENCRYPTION_KEY`: encrypts the Rachio and Hydrawise keys your
  customers hand over, so a database dump or a stray backup never contains a
  working key to someone's irrigation account. Generate one with:

  ```
  openssl rand -base64 32
  ```

  **Keep it somewhere safe.** If it is lost, every stored key becomes
  unreadable and every customer has to reconnect. If it is left unset,
  Driplin refuses to store new keys rather than storing them in the clear.

- `CRON_SECRET`: a random password so only Vercel's scheduler can trigger
  the nightly LCRA data pull. Make one at
  https://generate-secret.vercel.app/32 (refresh for a new one) and paste
  it in. You never need to remember it.
- `ADMIN_ALERT_EMAIL`: the email address that should receive "LCRA reading
  crossed a threshold — please verify the drought stage" alerts. Probably
  your own email.

---

## Deploying to Vercel (the live site)

1. Create a free account at https://vercel.com — choose **Continue with
   GitHub** so it can see your repositories.
2. Click **Add New… → Project**, find **Driplin** in the repository list,
   and click **Import**. (If it isn't listed, click "Adjust GitHub App
   Permissions" and grant access to the Driplin repository.)
3. Leave every build setting at its default — Vercel detects Next.js
   automatically. Before clicking Deploy, open the
   **Environment Variables** section and add these (names exactly as
   shown; where each value comes from is in the sections above):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key (secret — this is its proper home) |
   | `CRON_SECRET` | a random password — generate at https://generate-secret.vercel.app/32 |
   | `CREDENTIALS_ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts customers' vendor API keys |
   | `ADMIN_ALERT_EMAIL` | your email, for LCRA threshold alerts |

   Optional, for turning on real notifications later: `RESEND_API_KEY`,
   `RESEND_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM_NUMBER`. Leave them out for log-only mode.
   (`RACHIO_API_KEY` is not needed in Vercel — managers paste their
   company's key into the app itself.)
4. Click **Deploy**. After a minute or two you get a URL like
   `driplin-xyz.vercel.app` — that's the live app. The nightly LCRA
   cron job (defined in `vercel.json`) activates automatically.
5. After any future code push to the repository's main branch, Vercel
   redeploys on its own.
6. When real users are about to sign up: turn Supabase's
   **Confirm email** setting back on (Authentication → Sign In /
   Providers → Email) so accounts must verify their address.

## Running the app on your own computer (optional)

1. Install Node.js (LTS version) from https://nodejs.org.
2. Download the project: `git clone https://github.com/SolarEclipse133/Driplin.git`
3. In the project folder: `npm install`
4. Copy `.env.example` to a new file named `.env.local` and fill in the
   values you have so far (Supabase at minimum).
5. Run `npm run dev` and open http://localhost:3000 in your browser.
