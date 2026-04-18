// app/api/pledges/route.ts
// Community pledges — GET feed & POST new pledge
// Input sanitised with Zod, RLS enforced at DB layer

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const PledgeSchema = z.object({
  display_name: z.string()
    .min(1).max(80)
    .transform(s => s.replace(/[<>&"']/g, '').trim())
    .default('Anonymous Warrior'),
  action_type: z.string()
    .trim()
    .transform((value) => {
      const normalized = value.toLowerCase().replace(/[\s_-]+/g, '')
      const aliasMap: Record<string, 'refused' | 'swapped' | 'recycled' | 'cleanup' | 'planted'> = {
        refused: 'refused',
        refuse: 'refused',
        swapped: 'swapped',
        swap: 'swapped',
        recycled: 'recycled',
        recycle: 'recycled',
        cleanup: 'cleanup',
        cleanups: 'cleanup',
        clean: 'cleanup',
        planted: 'planted',
        plant: 'planted',
        earthdayaction: 'cleanup',
        earthday: 'cleanup',
      }

      return aliasMap[normalized] || normalized
    })
    .pipe(z.enum(['refused', 'swapped', 'recycled', 'cleanup', 'planted'])),
  city: z.string()
    .max(80)
    .transform(s => s.replace(/[<>&"']/g, '').trim())
    .optional(),
  country: z.string()
    .max(3)
    .transform((s) => s.trim().toUpperCase())
    .default('AU'),
})

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient(url, key)
}

export async function GET() {
  try {
    const supabase = getSupabaseClient()

    const [pledgeRes, statsRes] = await Promise.all([
      supabase
        .from('community_pledges')
        .select('id, display_name, action_type, city, country, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('global_impact_stats')
        .select('*')
        .single()
    ])

    return NextResponse.json({
      pledges: pledgeRes.data || [],
      stats: statsRes.data || { total_actions: 0, total_swaps: 0, total_refused: 0, cities_active: 0 },
      actionTypes: [
        { value: 'refused', label: 'Refused single-use plastic' },
        { value: 'swapped', label: 'Swapped to reusable option' },
        { value: 'recycled', label: 'Recycled correctly' },
        { value: 'cleanup', label: 'Joined a clean-up action' },
        { value: 'planted', label: 'Planted for Earth Day' },
      ],
    })
  } catch (error) {
    console.error('Pledges GET error:', error)
    if (error instanceof Error && error.message.includes('environment variables')) {
      return NextResponse.json({ error: 'Pledges service is not configured' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load community data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = PledgeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid pledge data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('community_pledges')
      .insert(parsed.data)
      .select('id, display_name, action_type, city, country, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, pledge: data }, { status: 201 })
  } catch (error) {
    console.error('Pledges POST error:', error)
    if (error instanceof Error && error.message.includes('environment variables')) {
      return NextResponse.json({ error: 'Pledges service is not configured' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save pledge' }, { status: 500 })
  }
}
