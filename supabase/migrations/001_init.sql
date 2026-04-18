-- ============================================================
-- ActionNode — Supabase Database Schema
-- Earth Day 2026 Challenge
-- Rebuild Script (DROP & RECREATE + Seed)
-- ============================================================

-- Extensions (needed for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- DROP (for B: drop & recreate)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP VIEW IF EXISTS public.global_impact_stats;

DROP TABLE IF EXISTS public.grid_cache;
DROP TABLE IF EXISTS public.community_pledges;
DROP TABLE IF EXISTS public.plastic_logs;
DROP TABLE IF EXISTS public.profiles;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id            uuid PRIMARY KEY
                REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  full_name     text,
  avatar_url    text,
  city          text,
  country       text DEFAULT 'AU',
  created_at    timestamp with time zone DEFAULT timezone('utc', now()),
  last_active   timestamp with time zone DEFAULT timezone('utc', now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- SECURITY HARDENING (fix applied)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ============================================================
-- PLASTIC LOGS
-- ============================================================
CREATE TABLE public.plastic_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  item_name     text NOT NULL CHECK (length(item_name) <= 200),
  barcode       text,
  material_type text,
  ecoscore      text,
  action_type   text NOT NULL CHECK (
    action_type IN ('swapped', 'refused', 'recycled')
  ),
  city          text,
  country       text DEFAULT 'AU',
  created_at    timestamp with time zone DEFAULT timezone('utc', now())
);

ALTER TABLE public.plastic_logs ENABLE ROW LEVEL SECURITY;

-- Users manage only their own logs
CREATE POLICY "Users manage own logs"
  ON public.plastic_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Helpful indexes
CREATE INDEX idx_plastic_logs_user_id ON public.plastic_logs(user_id);
CREATE INDEX idx_plastic_logs_created_at ON public.plastic_logs(created_at DESC);

-- ============================================================
-- COMMUNITY PLEDGES
-- ============================================================
CREATE TABLE public.community_pledges (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name  text NOT NULL CHECK (length(display_name) <= 80),
  action_type   text NOT NULL CHECK (
    action_type IN ('refused', 'swapped', 'recycled', 'cleanup', 'planted')
  ),
  city          text CHECK (city IS NULL OR length(city) <= 80),
  country       text DEFAULT 'AU',
  user_id       uuid REFERENCES auth.users, -- nullable for anonymous
  created_at    timestamp with time zone DEFAULT timezone('utc', now())
);

ALTER TABLE public.community_pledges ENABLE ROW LEVEL SECURITY;

-- Anyone can read pledges (community feed)
CREATE POLICY "Public can read pledges"
  ON public.community_pledges FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Auth users can add pledges"
  ON public.community_pledges FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Anonymous pledges allowed via edge function (rate-limited at app layer)
CREATE POLICY "Anon can insert pledges"
  ON public.community_pledges FOR INSERT
  TO anon
  WITH CHECK (true);

-- Helpful indexes
CREATE INDEX idx_community_pledges_created_at ON public.community_pledges(created_at DESC);
CREATE INDEX idx_community_pledges_city ON public.community_pledges(city);

-- ============================================================
-- GLOBAL IMPACT VIEW (FIXED)
-- ============================================================
CREATE OR REPLACE VIEW public.global_impact_stats
WITH (security_invoker = on)
AS
SELECT
  COUNT(*) AS total_actions,
  COUNT(*) FILTER (WHERE action_type = 'swapped')   AS total_swaps,
  COUNT(*) FILTER (WHERE action_type = 'refused')   AS total_refused,
  COUNT(*) FILTER (WHERE action_type = 'recycled')  AS total_recycled,
  COUNT(DISTINCT city) AS cities_active,
  COUNT(DISTINCT DATE(created_at)) AS days_active,
  MAX(created_at) AS last_action_at
FROM public.community_pledges;

GRANT SELECT ON public.global_impact_stats TO anon, authenticated;

-- ============================================================
-- GRID CACHE
-- ============================================================
CREATE TABLE public.grid_cache (
  zone          text PRIMARY KEY,
  intensity     integer NOT NULL,
  renewable_pct integer,
  status        text,
  fetched_at    timestamp with time zone DEFAULT timezone('utc', now())
);

ALTER TABLE public.grid_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read grid cache"
  ON public.grid_cache FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO public.community_pledges (display_name, action_type, city, country)
VALUES
  ('Sarah K.', 'refused', 'Sydney', 'AU'),
  ('Liam T.', 'swapped', 'Melbourne', 'AU'),
  ('Priya S.', 'planted', 'Brisbane', 'AU'),
  ('James M.', 'cleanup', 'Perth', 'AU'),
  ('Mei L.', 'recycled', 'Auckland', 'NZ'),
  ('Carlos R.', 'refused', 'São Paulo', 'BR'),
  ('Anna K.', 'swapped', 'Berlin', 'DE'),
  ('Kenji T.', 'recycled', 'Tokyo', 'JP');

-- (Optional) Basic grants to avoid surprises
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.community_pledges TO anon, authenticated;
GRANT SELECT ON public.grid_cache TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;