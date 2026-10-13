-- Phase 5: SaaS Layer
-- Adds Stripe billing columns, agency tenant tables, and plan-enforcement indexes.

-- ─── Users: Stripe + plan tracking ─────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS plan_period_end   timestamptz;

-- Reset monthly usage counter when a new billing period starts (handled by Stripe webhook)
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── Agency tenants ─────────────────────────────────────────────────────────

-- An "agency" is just the owning user. Tenant membership maps a profile user
-- to the owning agency user, with an optional label for that slot.
CREATE TABLE IF NOT EXISTS public.agency_members (
  id              uuid primary key default gen_random_uuid(),
  agency_user_id  uuid not null references public.users(id) on delete cascade,
  member_user_id  uuid not null references public.users(id) on delete cascade,
  label           text,                        -- e.g. "Client A", "Profile 3"
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  UNIQUE (agency_user_id, member_user_id)
);

ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_owner_sees_members" ON public.agency_members
  FOR ALL USING (auth.uid() = agency_user_id);

CREATE INDEX IF NOT EXISTS idx_agency_members_owner
  ON public.agency_members (agency_user_id);

-- ─── Usage events (coarse, for billing display) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('application_submitted', 'ai_tailor', 'ai_coach', 'board_scraped')),
  metadata   jsonb default '{}',
  created_at timestamptz not null default now()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_own_data" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_month
  ON public.usage_events (user_id, created_at DESC);

-- ─── Performance index for plan enforcement ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_applications_user_month
  ON public.applications (user_id, applied_at DESC)
  WHERE applied_at IS NOT NULL;

-- ─── RPC: increment monthly application counter ──────────────────────────────
-- Called by BillingService.incrementUsage after a successful submission.
-- Resets to 0 automatically when plan_period_start advances (handled by webhook).

CREATE OR REPLACE FUNCTION public.increment_applications_count(uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
  SET applications_this_month = applications_this_month + 1
  WHERE id = uid;
END;
$$;
