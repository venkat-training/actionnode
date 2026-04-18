-- ============================================================
-- ActionNode — Supabase Database Schema
-- Earth Day 2026 Challenge
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── PROFILES ───────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
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
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── PLASTIC LOGS ────────────────────────────────────────────
CREATE TABLE public.plastic_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  item_name     text NOT NULL CHECK (length(item_name) <= 200),
  barcode       text,
  material_type text,           -- 'PET', 'HDPE', 'Single-use', 'Glass', etc.
  ecoscore      text,           -- 'a', 'b', 'c', 'd', 'e', 'unknown'
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
  USING (auth.uid() = user_id);

-- ─── COMMUNITY PLEDGES ────────────────────────────────────────
CREATE TABLE public.community_pledges (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name  text NOT NULL CHECK (length(display_name) <= 80),
  action_type   text NOT NULL CHECK (
    action_type IN ('refused', 'swapped', 'recycled', 'cleanup', 'planted')
  ),
  city          text CHECK (length(city) <= 80),
  country       text DEFAULT 'AU',
  user_id       uuid REFERENCES auth.users,  -- nullable for anonymous
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

-- Anonymous pledges allowed via edge function (rate-limited)
CREATE POLICY "Anon can insert pledges"
  ON public.community_pledges FOR INSERT
  TO anon
  WITH CHECK (
    -- Only allow if rate limit not exceeded (handled at app layer)
    true
  );

-- ─── GLOBAL IMPACT VIEW ───────────────────────────────────────
-- Read-only aggregate — safe to expose publicly
CREATE OR REPLACE VIEW public.global_impact_stats AS
SELECT
  COUNT(*) AS total_actions,
  COUNT(*) FILTER (WHERE action_type = 'swapped')   AS total_swaps,
  COUNT(*) FILTER (WHERE action_type = 'refused')   AS total_refused,
  COUNT(*) FILTER (WHERE action_type = 'recycled')  AS total_recycled,
  COUNT(DISTINCT city) AS cities_active,
  COUNT(DISTINCT DATE(created_at)) AS days_active,
  MAX(created_at) AS last_action_at
FROM public.community_pledges;

-- Grant public read on the view
GRANT SELECT ON public.global_impact_stats TO anon, authenticated;

-- ─── GRID CACHE ────────────────────────────────────────────────
-- Cache grid API responses to stay within free tier limits
CREATE TABLE public.grid_cache (
  zone          text PRIMARY KEY,         -- 'AUS-NSW', 'AUS-VIC', etc.
  intensity     integer NOT NULL,          -- gCO2eq/kWh
  renewable_pct integer,
  status        text,                     -- 'green', 'amber', 'red'
  fetched_at    timestamp with time zone DEFAULT timezone('utc', now())
);

-- Only service role can write to cache
ALTER TABLE public.grid_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read grid cache"
  ON public.grid_cache FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_plastic_logs_user_id ON public.plastic_logs(user_id);
CREATE INDEX idx_plastic_logs_created_at ON public.plastic_logs(created_at DESC);
CREATE INDEX idx_community_pledges_created_at ON public.community_pledges(created_at DESC);
CREATE INDEX idx_community_pledges_city ON public.community_pledges(city);

-- ─── SEED DATA (optional for testing) ─────────────────────────
-- Run this only in development
INSERT INTO public.community_pledges (display_name, action_type, city, country) VALUES
  ('Sarah K.', 'refused', 'Sydney', 'AU'),
  ('Liam T.', 'swapped', 'Melbourne', 'AU'),
  ('Priya S.', 'planted', 'Brisbane', 'AU'),
  ('James M.', 'cleanup', 'Perth', 'AU'),
  ('Mei L.', 'recycled', 'Auckland', 'NZ'),
  ('Carlos R.', 'refused', 'São Paulo', 'BR'),
  ('Anna K.', 'swapped', 'Berlin', 'DE'),
  ('Kenji T.', 'recycled', 'Tokyo', 'JP');
