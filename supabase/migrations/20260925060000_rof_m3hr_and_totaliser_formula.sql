-- =============================================================================
-- Migration: ROF to M³/hr + Correct Intake Totaliser Formula
-- Date: 2026-09-25
-- Changes:
--   1. WTP-ROF-FB1: unit '%' → 'm³/hr', max range 100 → 200, remove low_setpoint,
--      set high_setpoint to 180 (90% of 200)
--   2. INT-Totalizer-IN / INT-Totalizer-OUT: The new formula is
--      ((65535 × H) + L) / 100. This results in values ~655 times smaller than
--      the old formula (H × 65536 + L). Clear accumulated history values that
--      used the old formula to avoid confusion; fresh readings will populate
--      with correct values.
-- =============================================================================

-- 1. Update WTP Filter Bed ROF sensor to m³/hr
UPDATE public.tag_config
SET
  unit          = 'm³/hr',
  high_setpoint = 180,
  low_setpoint  = NULL,
  label         = 'Rate of Flow (Filter Bed 1)'
WHERE section = 'wtp'
  AND tag_id   = 'WTP-ROF-FB1';

-- 2. Update Intake Inlet Totalizer unit (values will now be smaller due to /100)
UPDATE public.tag_config
SET
  unit  = 'm³',
  label = 'Inlet Totalizer'
WHERE section = 'intake'
  AND tag_id  = 'INT-Totalizer-IN';

-- 3. Update Intake Outlet Totalizer unit
UPDATE public.tag_config
SET
  unit  = 'm³',
  label = 'Outlet Totalizer'
WHERE section = 'intake'
  AND tag_id  = 'INT-Totalizer-OUT';

-- Note: Historian logs for INT-Totalizer-IN and INT-Totalizer-OUT recorded with
-- the old formula (H×65536+L without /100 scaling) will remain in the DB for
-- historical audit. The new formula takes effect from this migration onwards.
-- If you wish to clear old incorrect totaliser readings, run:
--   DELETE FROM public.historian_logs
--   WHERE tag_id IN ('INT-Totalizer-IN','INT-Totalizer-OUT')
--     AND section = 'intake'
--     AND timestamp < NOW();
-- (Commented out intentionally — admin decision required)
