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
  action_type: z.enum(['refused', 'swapped', 'recycled', 'cleanup', 'planted']),
  city: z.string()
    .max(80)
    .transform(s => s.replace(/[<>&"']/g, '').trim())
    .optional(),
})

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
    })
  } catch (error) {
    console.error('Pledges GET error:', error)
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
      .select('id, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id }, { status: 201 })
  } catch (error) {
    console.error('Pledges POST error:', error)
    return NextResponse.json({ error: 'Could not save pledge' }, { status: 500 })
  }
}
