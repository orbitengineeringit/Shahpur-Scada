-- =============================================================================
-- Migration: Intake 2 EFM Real Data Keys & Formula Alignment
-- Date: 2026-09-25
-- Station: Shahpur Intake Well (Package-6i, MPUDCL)
-- 
-- Modbus/PLC Architecture:
--   The Intake Well has 2 Flow Meters (EFMs):
--   1. Inlet Meter:
--      - Flow: INLETFLOW (instantaneous flow rate in m³/hr)
--      - Totalizer 1: INLETTOTLIZER1 (high word / rollover factor, 16-bit)
--      - Totalizer 2: INLETTOTLIZER2 (low word / remainder, 16-bit)
--   2. Outlet Meter:
--      - Flow: OUTLETFLOW (instantaneous flow rate in m³/hr)
--      - Totalizer 1: OUTLETTOTLIZER1 (high word / rollover factor, 16-bit)
--      - Totalizer 2: OUTLETTOTLIZER2 (low word / remainder, 16-bit)
--
-- Single Final Totalizer Formula:
--   Final Totalizer = ((65535 * Totalizer1) + Totalizer2) / 100
--
-- Examples:
--   Inlet Totalizer:
--     INLETTOTLIZER1 = 16, INLETTOTLIZER2 = 36297
--     ((65535 * 16) + 36297) / 100 = 10,848.57 m³
--   Outlet Totalizer:
--     OUTLETTOTLIZER1 = 4, OUTLETTOTLIZER2 = 11353
--     ((65535 * 4) + 11353) / 100 = 2,734.93 m³
-- =============================================================================

-- Ensure tag_config records exist with canonical units and labels
INSERT INTO public.tag_config (tag_id, section, label, unit, is_active, alarm_enabled)
VALUES
  ('INT-Flow-IN', 'intake', 'Inlet Flow Meter', 'm³/hr', true, true),
  ('INT-Totalizer-IN', 'intake', 'Inlet Totalizer', 'm³', true, false),
  ('INT-Flow-OUT', 'intake', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('INT-Totalizer-OUT', 'intake', 'Outlet Totalizer', 'm³', true, false)
ON CONFLICT (section, tag_id) DO UPDATE SET
  label = EXCLUDED.label,
  unit = EXCLUDED.unit,
  is_active = EXCLUDED.is_active;
