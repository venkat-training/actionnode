# ActionNode — Complete Setup Guide

## ⏱ Time to Live: ~30 minutes

Follow these steps in order to have the app running locally and deployed.

---

## Step 1 — Clone & Install

```bash
git clone https://github.com/yourusername/actionnode
cd actionnode
npm install
```

---

## Step 2 — Supabase Setup (15 min)

1. **Create a free Supabase project** at [supabase.com](https://supabase.com)
   - Choose region: **ap-southeast-2** (Sydney) for best latency

2. **Run the database migration**:
   - Go to: Supabase Dashboard → SQL Editor
   - Open `supabase/migrations/001_init.sql`
   - Paste and click "Run"
   - You should see: `Success. No rows returned.`

3. **Enable Realtime** (for live counter):
   - Go to: Database → Replication → Tables
   - Enable `community_pledges` table

4. **Get your API keys**:
   - Go to: Project Settings → API
   - Copy: `URL`, `anon public key`, `service_role key`

---

## Step 3 — API Keys

### Electricity Maps (Grid Data) — Free Trial
1. Go to [api.electricitymaps.com](https://api.electricitymaps.com)
2. Click "Start for free" → create account
3. Copy your API token
4. Test: `curl https://api.electricitymaps.com/v3/carbon-intensity/latest?zone=AUS-NSW -H "auth-token: YOUR_KEY"`

### Google Gemini — Free Tier
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click "Create API key"
3. Free tier: 15 requests/minute, 1500/day — plenty for the challenge

### Open Food Facts — No Key Needed
Free, open-source database. No registration required.

---

## Step 4 — Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ELECTRICITY_MAPS_API_KEY=your-key
GEMINI_API_KEY=your-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 5 — Run Locally

```bash
npm run dev
```

Visit: [http://localhost:3000](http://localhost:3000)

> Note: this repository snapshot focuses on the Route Handlers and Supabase schema. If your UI pages are in a separate/private branch, run them alongside these APIs.

### Test Checklist:
- [ ] Grid Health tab loads with carbon intensity data
- [ ] Search "coca cola" in Plastic Audit — sees product + AI suggestion
- [ ] Community tab shows pledge feed
- [ ] Logging an action increments the counter
- [ ] My Impact tab shows logged actions
- [ ] `GET /api/grid` includes `viewerGuide` and per-zone `zoneName`
- [ ] `GET /api/audit?q=coca+cola` includes `sourceUrl` in product response
- [ ] `POST /api/pledges` returns full `pledge` payload for instant Recent Activities UI updates

---

## Step 6 — Test Security

```bash
# 1. Verify API key is not in client bundle
npm run build
grep -r "ELECTRICITY_MAPS" .next/static/ && echo "FAIL - key exposed!" || echo "PASS - key hidden"

# 2. Test grid endpoint (should work)
curl http://localhost:3000/api/grid

# 3. Test audit endpoint
curl "http://localhost:3000/api/audit?q=coca+cola"

# 4. Test input validation (should return 400)
curl "http://localhost:3000/api/audit?q=<script>alert(1)</script>"
```

---

## Step 7 — Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, then add environment variables:
vercel env add ELECTRICITY_MAPS_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# (NEXT_PUBLIC_ vars can be set in Vercel dashboard)

# Final deploy
vercel --prod
```

Or use the Vercel dashboard: Import GitHub repo → Set environment variables → Deploy.

---

## Step 8 — Submit to DEV.to

1. **Create GitHub repo** (must be public):
   ```bash
   git init
   git add .
   git commit -m "feat: ActionNode - Earth Day 2026 sustainability dashboard"
   git remote add origin https://github.com/yourusername/actionnode.git
   git push -u origin main
   ```

2. **Submit your DEV.to post**:
   - Copy content from `DEVTO_SUBMISSION.md`
   - Go to: [dev.to/new](https://dev.to/new)
   - Use the submission template URL from the challenge page
   - Add tags: `devchallenge`, `weekendchallenge`
   - Include your live Vercel URL
   - **Submit before April 20, 2026 at 4:59 PM AEST**

---

## Troubleshooting

**Grid data shows "fallback"?**
→ Your Electricity Maps API key may not be activated yet. The app gracefully falls back to realistic simulated data — this is fine for the demo.

**Open Food Facts returns no results?**
→ Try simpler search terms: "cola", "ketchup", "water". The database is huge but search can be finicky.

**Supabase real-time counter not updating?**
→ Check Realtime is enabled for `community_pledges` in Supabase Dashboard → Database → Replication.

**Build failing on type errors?**
→ Run `npm run type-check` to see specific errors. Most common: missing env variables in TypeScript.
