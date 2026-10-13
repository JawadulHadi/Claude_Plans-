-- Phase 5 follow-up: auto-reset applications_this_month when billing period advances.
-- Fires as a BEFORE UPDATE trigger on users; resets the counter whenever
-- plan_period_start changes to a future value (i.e., Stripe renewed the subscription).

CREATE OR REPLACE FUNCTION public.reset_applications_on_period_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plan_period_start IS DISTINCT FROM OLD.plan_period_start
     AND NEW.plan_period_start > OLD.plan_period_start THEN
    NEW.applications_this_month := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_applications_on_period
  ON public.users;

CREATE TRIGGER trg_reset_applications_on_period
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_applications_on_period_change();
