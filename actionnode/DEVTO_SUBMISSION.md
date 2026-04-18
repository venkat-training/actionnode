---
title: ActionNode: A Real-Time Sustainability Command Center for Earth Day 2026
published: true
tags: devchallenge, weekendchallenge, earthday, sustainability
---

*This is a submission for [Weekend Challenge: Earth Day Edition](https://dev.to/challenges/weekend-2026-04-16)*

---

## What I Built

**ActionNode** — a real-time sustainability dashboard that turns complex environmental data into personal, collective action.

The app is built around Earth Day 2026's dual themes: **"Planet vs. Plastics"** and **"Our Power, Our Planet"**. Rather than a static tips site, I wanted to build something that functions as a genuine tool — one that gives users *live data* and *immediate actions*, not just inspiration.

It ships with three integrated modules:

**⚡ Grid Health** — Real-time carbon intensity for Australian energy zones (NSW, VIC, QLD). The UI dynamically shifts between Green, Amber, and Red states based on the live gCO₂eq/kWh value. It tells you *right now* whether it's a good time to run the dishwasher, charge your EV, or delay energy-heavy tasks.

**🔍 Plastic Audit** — Type any product name and get its packaging verdict, eco-score (A–E), and a smart "Green Swap" recommendation — powered by the Open Food Facts open database. Log your action (swapped, refused, recycled) in two taps.

**🌿 Community Hub** — A real-time global counter of Earth Day actions, a live pledge feed, and a form to log your own event. Every action updates the aggregate via Supabase Realtime.

---

## Demo

🔗 **[Live App → actionnode.vercel.app](https://actionnode.vercel.app)**

```
The UI shifts from green → amber → red based on live carbon intensity.
Search "coca cola" or "evian water" in the Plastic Audit tab to see it in action.
```

{% embed https://github.com/yourusername/actionnode %}

---

## Code

The full codebase is on GitHub: [github.com/yourusername/actionnode](https://github.com/yourusername/actionnode)

Key files worth reading:

- `app/api/grid/route.ts` — Secure server-side proxy for Electricity Maps API
- `app/api/audit/route.ts` — Open Food Facts + Gemini AI integration  
- `lib/electricity.ts` — Data normalisation: raw gCO₂ → actionable UI state
- `supabase/migrations/001_init.sql` — Full schema with RLS policies

---

## How I Built It

I'm an Integration Architect by profession, and I wanted this submission to reflect that — not just "I used Next.js and a free API" but a proper architectural approach to a real problem.

### The Stack

```
Next.js 15 (App Router) + TypeScript
Tailwind CSS + Shadcn/UI
Supabase (PostgreSQL + Realtime + Row Level Security)
Electricity Maps API (grid carbon intensity)
Open Food Facts API (product packaging data)
Google Gemini API (AI-powered Green Swap suggestions)
Recharts (sparkline visualisations)
TanStack Query (server state + caching)
Vercel (Edge Functions for deployment)
```

### Security — The Bit Most Hackathons Get Wrong

Every external API call goes through Next.js Route Handlers. The browser never touches an API key. This is the #1 security mistake I see in weekend projects — keys ending up in the client bundle.

```typescript
// app/api/grid/route.ts
export async function GET() {
  const API_KEY = process.env.ELECTRICITY_MAPS_API_KEY // server-only
  const res = await fetch(`https://api.electricitymaps.com/v3/carbon-intensity/latest?zone=AUS-NSW`, {
    headers: { 'auth-token': API_KEY! }
  })
  // Normalize and return — key never leaves the server
}
```

Supabase has Row Level Security on every table. The global impact counter is a read-only aggregate view — users can only touch their own logs.

### Data Normalisation — Turning Numbers Into Actions

The core architectural pattern is transforming raw API data into meaningful UI state:

```typescript
// lib/electricity.ts
export function normalizeGridData(intensity: number): GridStatus {
  if (intensity < 250) return { 
    label: 'EXCELLENT', tier: 'green', 
    advice: 'Perfect time to charge EVs and run appliances!',
    uiTheme: 'theme-green' 
  }
  // ... progressive degradation
}
```

When the Electricity Maps API returns `245 gCO₂eq/kWh`, the entire dashboard responds — card borders turn green, the status bar fills, and the advice copy changes. This is event-driven UI design in practice.

### Why Google Gemini for Green Swaps?

Static "try glass bottles instead" tips are everywhere. I used the Gemini API to generate *contextualised* suggestions based on the product category, the user's country, and the specific packaging type detected:

```typescript
// lib/gemini.ts
const prompt = `
  Product: ${productName} (category: ${category})
  Packaging issue: ${packagingIssue}
  User location: Australia
  
  Suggest ONE specific, locally-available plastic-free alternative.
  Be specific — name actual brands or stores where possible.
  Under 40 words.
`
```

The result is suggestions like "Try Loving Earth chocolate (glass jar, available at Woolworths) instead of this foil-and-plastic wrapper" — which is genuinely useful compared to "choose eco-friendly packaging."

### The Community Counter — Supabase Realtime

The global action tally updates in real-time using Supabase's Realtime subscriptions:

```typescript
// hooks/useGlobalCounter.ts
const channel = supabase
  .channel('global_stats')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'plastic_logs' },
    (payload) => setCount(c => c + 1)
  )
  .subscribe()
```

Every time anyone logs an action anywhere in the world, every connected client sees the counter tick up. That's the collective impact visualised in real-time.

---

## Prize Categories

**Best Use of Google Gemini** — The Gemini API powers the "Green Swap AI" feature in the Plastic Audit module. It generates location-aware, category-specific plastic-free alternatives for flagged products. See `lib/gemini.ts` for the implementation.

---

## Challenges & Decisions

**Grid Data Coverage**: Electricity Maps has excellent Australian NEM coverage but rate limits on the free tier. I implemented a 10-minute cache via TanStack Query so the app stays within free tier limits even with many users.

**Open Food Facts Data Quality**: Not every product has packaging tags. I built graceful degradation — if packaging data is unavailable, the UI shows "Data unavailable" rather than guessing. Honesty about data limits is a feature, not a bug.

**Real-Time vs. Performance**: Supabase Realtime is powerful but WebSocket connections have overhead. I used a hybrid approach — the global counter updates via Realtime, but individual user logs use standard REST with optimistic updates for instant perceived responsiveness.

---

## What This Could Become

ActionNode is designed as a foundation, not a weekend toy:

- **Local Council White-Label**: The Community Hub can be licensed to local councils to run their own Earth Day registries
- **EV Fleet Optimisation**: The Grid Health module extended with scheduling logic for small business fleets  
- **Workplace Carbon Reports**: Monthly personal carbon offset summaries, exportable for ESG reporting

---

## Run It Yourself

```bash
git clone https://github.com/yourusername/actionnode
cd actionnode
cp .env.example .env.local
# Add: ELECTRICITY_MAPS_API_KEY, GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
# Visit http://localhost:3000
```

Full setup guide in [SETUP.md](./SETUP.md).

---

*Built in Sydney, Australia 🌏 — where Earth Day falls on a Wednesday this year. Every gCO₂ counts.*
