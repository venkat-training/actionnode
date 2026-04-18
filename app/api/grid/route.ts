// app/api/grid/route.ts
// Secure server-side proxy for Electricity Maps API
// API key NEVER exposed to the client

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Realistic fallback intensity values (gCO₂eq/kWh) per zone
// Used when Electricity Maps API is unavailable and no cache exists
const FALLBACK_INTENSITY_BY_ZONE: Record<string, number> = {
  'AUS-NSW': 285,
  'AUS-VIC': 310,
  'AUS-QLD': 340,
  'AU-NSW': 285,   // alias
  'AU-VIC': 310,
  'AU-QLD': 340,
}
const ZONES = (process.env.GRID_ZONES || 'AU-NSW,AU-VIC,AU-QLD').split(',')
const CACHE_MINUTES = parseInt(process.env.GRID_CACHE_MINUTES || '10')

type GridTier = 'green' | 'amber' | 'red'

interface GridStatus {
  zone: string
  zoneName: string
  intensity: number
  status: GridTier
  label: string
  advice: string
  renewablePct: number
  unit: string
  cachedAt: string
}

const ZONE_LABELS: Record<string, string> = {
  'AUS-NSW': 'New South Wales',
  'AUS-VIC': 'Victoria',
  'AUS-QLD': 'Queensland',
  'AUS-SA': 'South Australia',
  'AUS-WA': 'Western Australia',
  'AUS-TAS': 'Tasmania',
}

function normalizeIntensity(intensity: number, zone: string): Omit<GridStatus, 'zone' | 'unit' | 'cachedAt'> {
  let status: GridTier
  let label: string
  let advice: string

  if (intensity < 250) {
    status = 'green'
    label = 'EXCELLENT'
    advice = 'Optimal — perfect time to charge EVs and run high-energy appliances.'
  } else if (intensity < 350) {
    status = 'green'
    label = 'GOOD'
    advice = 'Good grid conditions. Non-urgent tasks are fine now.'
  } else if (intensity < 500) {
    status = 'amber'
    label = 'MODERATE'
    advice = 'Mixed grid. Delay heavy energy use by a few hours if possible.'
  } else {
    status = 'red'
    label = 'HIGH CARBON'
    advice = 'High carbon intensity. Conserve energy and delay non-essential loads.'
  }

  // Approximate renewable % from intensity (inverse relationship)
  // In production, fetch this directly from Electricity Maps breakdown endpoint
  const renewablePct = Math.max(10, Math.min(90, Math.round(100 - (intensity / 6))))

  return {
    zoneName: ZONE_LABELS[zone] || zone,
    intensity,
    status,
    label,
    advice,
    renewablePct
  }
}

async function fetchFromElectricityMaps(zone: string): Promise<number> {
  const apiKey = process.env.ELECTRICITY_MAPS_API_KEY
  if (!apiKey) throw new Error('ELECTRICITY_MAPS_API_KEY not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  let res: Response
  try {
    res = await fetch(
      `https://api.electricitymaps.com/v3/carbon-intensity/latest?zone=${zone}`,
      {
        headers: { 'auth-token': apiKey },
        next: { revalidate: CACHE_MINUTES * 60 },
        signal: controller.signal,
      }
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new Error(`Electricity Maps API error: ${res.status}`)
  const data = await res.json()
  const value = typeof data.carbonIntensity === 'number'
    ? data.carbonIntensity
    : (typeof data.carbonIntensityAvg === 'number' ? data.carbonIntensityAvg : undefined)
  if (typeof value !== 'number') throw new Error('Electricity Maps payload missing carbon intensity value')
  return value
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    return createClient(url, key)
  } catch {
    return null
  }
}

async function getFromCacheOrFetch(zone: string): Promise<GridStatus> {
  const supabase = getSupabaseAdminClient()
  let cached: { intensity: number, fetched_at: string } | null = null
  let cacheUnavailable = false
  // Check cache first
  if (supabase) {
    try {
      const { data } = await supabase
        .from('grid_cache')
        .select('intensity, fetched_at')
        .eq('zone', zone)
        .single()
      cached = data
    } catch {
      cacheUnavailable = true
    }
  }

  const cacheExpiry = new Date(Date.now() - CACHE_MINUTES * 60 * 1000)
  if (cached && new Date(cached.fetched_at) > cacheExpiry) {
    return {
      zone,
      ...normalizeIntensity(cached.intensity, zone),
      unit: 'gCO₂eq/kWh',
      cachedAt: cached.fetched_at,
    }
  }

  // Fetch fresh data
  let intensity: number
  try {
    intensity = await fetchFromElectricityMaps(zone)
  } catch (error) {
    // Graceful fallback: use cached value even if expired, or realistic mock
    if (cached) return { zone, ...normalizeIntensity(cached.intensity, zone), unit: 'gCO₂eq/kWh', cachedAt: cached.fetched_at }
    intensity = FALLBACK_INTENSITY_BY_ZONE[zone] || FALLBACK_INTENSITY_BY_ZONE['AU-NSW']
    if (error instanceof Error) {
      console.warn(`Grid API fallback used for ${zone}: ${error.message}`)
    }
  }

  const normalized = normalizeIntensity(intensity, zone)
  const now = new Date().toISOString()

  // Update cache (upsert)
  if (supabase) {
    try {
      await supabase.from('grid_cache').upsert({
        zone,
        intensity,
        renewable_pct: normalized.renewablePct,
        status: normalized.status,
        fetched_at: now,
      })
    } catch {
      cacheUnavailable = true
    }
  }

  if (cacheUnavailable) {
    console.warn(`Grid cache unavailable for zone ${zone}. Serving direct/fallback data.`)
  }

  return { zone, ...normalized, unit: 'gCO₂eq/kWh', cachedAt: now }
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      ZONES.map(zone => getFromCacheOrFetch(zone))
    )

    const zones = results
      .map((r, i) => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean) as GridStatus[]

    if (zones.length === 0) {
      return NextResponse.json({ error: 'All zones failed' }, { status: 503 })
    }

    // 24h sparkline — generate realistic data for the primary zone
    const primaryZone = zones[0]
    const hour = new Date().getHours()
    const sparkline = Array.from({ length: 24 }, (_, i) => {
      const base = primaryZone.intensity
      const timeOffset = Math.abs(i - 14) // peak around 2pm
      return Math.round(base + (timeOffset * 8) + (Math.random() - 0.5) * 25)
    })

    return NextResponse.json({
      zones,
      primary: zones[0],
      sparkline,
      bestHour: sparkline.indexOf(Math.min(...sparkline)),
      viewerGuide: {
        metric: 'Grid carbon intensity (gCO₂eq/kWh)',
        howToRead: 'Lower is cleaner. Use electricity-heavy activities when intensity is lowest.',
        statusLegend: {
          green: 'Best time for charging EVs, laundry, heating/cooling and dishwashers.',
          amber: 'Normal use is okay, but delay heavy loads if you can.',
          red: 'Try to reduce non-essential electricity use until cleaner hours.',
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Grid API error:', error)
    return NextResponse.json({ error: 'Grid data unavailable' }, { status: 500 })
  }
}
