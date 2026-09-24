-- ============================================================
-- Migration: 20260924000000_seed_new_wtp_sensors.sql
-- Purpose:   Seed 5 new WTP sensors into tag_config so that
--            ingest_telemetry() can write historian_logs rows.
--            Without this, the RPC JOIN finds no matching row
--            and silently drops readings for these sensors.
-- Sensors:   WTP-ROF-FB1, WTP-LOH-FB1, WTP-LOH-FB2,
--            WTP-Trip1, WTP-Trip2
-- Safe:      ON CONFLICT DO NOTHING — never overwrites existing
--            alarm_enabled / high_setpoint / low_setpoint.
-- ============================================================

INSERT INTO public.tag_config (tag_id, section, label, unit, is_active, alarm_enabled)
VALUES
  ('WTP-ROF-FB1', 'wtp', 'Rate of Flow (Filter Bed 1)', 'm³/hr', true, true),
  ('WTP-LOH-FB1', 'wtp', 'Loss of Head (FB1)',          'm',     true, true),
  ('WTP-LOH-FB2', 'wtp', 'Loss of Head (FB2)',          'm',     true, true),
  -- Trip sensors: alarm_enabled=false because the backend 5-min snapshot
  -- skips instrumentType='pump' sensors for standard High/Low evaluation.
  -- Trip alarms are handled separately via backend Trip detection logic
  -- (added in scada-ingest/index.ts Component 2 fix).
  ('WTP-Trip1',   'wtp', 'HT Pump 1 Trip',              '',    true, false),
  ('WTP-Trip2',   'wtp', 'HT Pump 2 Trip',              '',    true, false)
ON CONFLICT (section, tag_id) DO NOTHING;
