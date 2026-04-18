# 🌍 ActionNode — Earth Day 2026 Sustainability Command Center

> *Your personal grid for collective environmental change.*

**Live Demo**: [actionnode.vercel.app](https://actionnode.vercel.app)
**Built for**: [DEV Weekend Challenge — Earth Day 2026](https://dev.to/challenges/weekend-2026-04-16)
**Tags**: `#devchallenge` `#weekendchallenge`

---

## What I Built

ActionNode is a real-time sustainability dashboard that turns complex environmental data into personal power. It's built around the Earth Day 2026 themes of **"Planet vs. Plastics"** and **"Our Power, Our Planet"** — giving users three actionable modules:

| Module | What It Does |
|--------|-------------|
| ⚡ **Grid Health** | Live carbon intensity for Australian energy zones (NSW/VIC/QLD), with the optimal "charge window" for EVs and appliances |
| 🔍 **Plastic Audit** | Real-time product lookup via Open Food Facts API — scan any product and get its eco-score, plastic verdict, and green swap suggestions |
| 🌿 **Community Hub** | Real-time global counter of Earth Day actions, live pledge feed, and event logging |

---

## Repository Snapshot (Current)

This repository snapshot contains the backend Route Handlers and database schema that power the dashboard features:

- `app/api/grid/route.ts` (Grid Health API)
- `app/api/audit/route.ts` (Plastic Audit API)
- `app/api/pledges/route.ts` (Community Hub API)
- `supabase/migrations/001_init.sql` (database tables, views, policies)

If you are troubleshooting UI behavior, confirm your frontend routes/components are present in your local branch and that they consume the current API response fields below.

---

## Demo

![ActionNode Demo](./public/demo-preview.png)

The app features:
- **Dynamic UI theming** — the grid card shifts Green/Amber/Red based on live carbon intensity
- **Two-tap logging** — audit a product and log your action in under 5 seconds  
- **Real-time community counter** — every action updates the global tally via Supabase Realtime

---

## Tech Stack

```
Frontend:   Next.js 15 (App Router) + TypeScript
Styling:    Tailwind CSS + Shadcn/UI
Database:   Supabase (PostgreSQL + Realtime + RLS)
APIs:       Electricity Maps (grid data) + Open Food Facts (plastic audit)
Deployment: Vercel (Edge Functions)
State:      TanStack Query (React Query)
Charts:     Recharts
```

---

## How I Built It

### Architecture Overview

As an Integration Architect, I built ActionNode using a **serverless-first, security-by-design** approach:

```
Client (Next.js) → Server Actions/Route Handlers → Third-Party APIs
                ↓
         Supabase (Auth + RLS + Realtime)
```

All third-party API keys live exclusively in server-side Route Handlers — the browser never sees them. This is a common security gap in hackathon submissions that I made a priority to get right.

### Security Implementation

1. **API Key Protection**: All external API calls go through Next.js Route Handlers (`/api/grid`, `/api/audit`). Zero secrets in the client bundle.

2. **Row Level Security (RLS)**: Every Supabase table has RLS enabled. Users can only read/write their own logs. The global counter is an aggregated read-only view.

3. **Input Validation**: Zod schemas on every user input — no raw strings hit the database.

4. **CSP Headers**: Content Security Policy configured in `next.config.ts` to prevent XSS.

### API Response Notes (April 18, 2026)

- `GET /api/grid` now includes a `viewerGuide` object and human-friendly `zoneName` fields for easier interpretation in UI cards/tooltips.
- `GET /api/audit` now includes `sourceUrl` for each product so the UI can deep-link to the Open Food Facts product page.
- `GET /api/pledges` returns an `actionTypes` helper list for form labels.
- `POST /api/pledges` accepts normalized action aliases (for example `earth day action`), and returns the inserted pledge payload so Recent Activities can update immediately without an extra fetch.

### Data Normalization (The Architecture Bit)

Raw carbon intensity (gCO₂eq/kWh) gets transformed into actionable UI state:

```typescript
// lib/electricity.ts
export function normalizeGridData(raw: number): GridStatus {
  if (raw < 250) return { label: 'EXCELLENT', tier: 'green', advice: 'Perfect time to charge EVs!' }
  if (raw < 350) return { label: 'GOOD', tier: 'green', advice: 'Good conditions for energy use.' }  
  if (raw < 500) return { label: 'MODERATE', tier: 'amber', advice: 'Delay heavy appliances if possible.' }
  return { label: 'HIGH', tier: 'red', advice: 'High carbon — conserve energy now.' }
}
```

This is exactly the kind of data transformation pattern I use professionally — taking a raw number and making it meaningful for end users.

### Why Open Food Facts?

I chose Open Food Facts over proprietary barcode APIs because:
- 100% free, open-source (ODbL licence — perfect for a community project)
- Global database with packaging tags and eco-scores
- Aligns with the spirit of Earth Day — open knowledge for a healthier planet

---

## Prize Categories

**Best Use of Google Gemini** — I integrated the Gemini API to power the "Green Swap AI" feature in the Plastic Audit module. When a product is flagged as containing plastic, Gemini generates a contextualised suggestion based on the product's category, the user's location (AU), and current market alternatives. This goes beyond static tips — it's genuinely intelligent, personalised sustainability advice.

---

## Supabase Schema

```sql
-- See supabase/migrations/001_init.sql for full schema
-- Key tables: profiles, plastic_logs, community_pledges
-- Key views: global_impact_stats (public read-only aggregate)
-- All tables: RLS enabled, policies scoped to auth.uid()
```

---

## Running Locally

```bash
git clone https://github.com/venkat-training/actionnode.git
cd actionnode
cp .env.example .env.local
# Fill in your API keys (see .env.example)
npm install
npm run dev
```

---

## What's Next

ActionNode isn't just a weekend project. The architecture is designed to scale:

- **Local Council Integration**: The Community Hub can be white-labelled for councils to run their own Earth Day event registries
- **EV Fleet Management**: The Grid Health module can be extended to optimise charging schedules for small business EV fleets
- **Carbon Budget Tracking**: Monthly personal carbon offset reporting, exportable for workplace sustainability reports

---

## License

MIT — because open-source is how we change the world.

---

*Built with 🌿 in Sydney, Australia for Earth Day 2026.*
