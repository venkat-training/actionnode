// lib/supabase.ts
// Supabase client — browser-safe (uses anon key only)

import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// ─── Browser Client (uses anon key — safe for client components) ───
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Server Admin Client (uses service role — server-only!) ───
// NEVER import this in client components
export function createServerSupabaseClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createServerSupabaseClient must only be used server-side')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Type definitions ──────────────────────────────────────────
export interface PlasticLog {
  id: string
  user_id: string
  item_name: string
  material_type?: string
  ecoscore?: string
  action_type: 'swapped' | 'refused' | 'recycled'
  city?: string
  created_at: string
}

export interface CommunityPledge {
  id: string
  display_name: string
  action_type: 'refused' | 'swapped' | 'recycled' | 'cleanup' | 'planted'
  city?: string
  country?: string
  created_at: string
}

export interface GlobalImpactStats {
  total_actions: number
  total_swaps: number
  total_refused: number
  total_recycled: number
  cities_active: number
  last_action_at: string
}
