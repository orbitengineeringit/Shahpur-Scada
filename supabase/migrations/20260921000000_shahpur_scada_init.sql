-- ============================================================
-- Shahpur SCADA - Initialization Migration (Package-61, MPUDCL)
-- Sets plant configuration, MQTT broker topics, GIS station IDs,
-- and registers Shahpur sensor tags in tag_config.
-- ============================================================

-- 1) Plant Configuration
UPDATE public.plant_config
SET plant_name = 'Shahpur SCADA'
WHERE TRUE;

INSERT INTO public.plant_config (plant_name)
SELECT 'Shahpur SCADA'
WHERE NOT EXISTS (SELECT 1 FROM public.plant_config);

-- 2) MQTT Configuration for Shahpur
UPDATE public.mqtt_config
SET
  broker_url = 'mqtt://mqtt.orbitengineerings.com:1883',
  client_id = 'shahpur-client',
  intake_topic = 'sahpur/intake/plc01/update',
  wtp_topic = 'sahpur/wtp/plc01/update',
  oht_topic = 'sahpur/oht/plc01/update',
  oht_topic_2 = 'sahpur/oht/plc02/update',
  oht_topic_3 = NULL,
  oht_topic_4 = NULL
WHERE TRUE;

-- 3) GIS / MPGARUD Configuration for Shahpur
UPDATE public.gis_config
SET
  intake_device_id = 'SHA_INTK_001',
  wtp_device_id = 'SHA_WTP_001',
  oht1_device_id = 'SHA_OHT_001',
  oht2_device_id = 'SHA_OHT_002',
  oht3_device_id = NULL,
  oht4_device_id = NULL
WHERE TRUE;

-- 4) Deactivate obsolete OHT-3 & OHT-4 tags if present
UPDATE public.tag_config
SET is_active = false
WHERE tag_id LIKE 'OHT3-%' OR tag_id LIKE 'OHT4-%';

-- 5) Upsert Shahpur Sensors in tag_config
INSERT INTO public.tag_config (tag_id, section, label, unit, is_active, alarm_enabled)
VALUES
  -- Intake
  ('INT-PT1', 'intake', 'VT Pump 1 Pressure', 'Bar', true, true),
  ('INT-PT2', 'intake', 'VT Pump 2 Pressure', 'Bar', true, true),
  ('INT-HeaderPT', 'intake', 'Main Header Pressure', 'Bar', true, true),
  ('INT-LT', 'intake', 'River Level (RLT)', '%', true, true),
  ('INT-Flow-IN', 'intake', 'Inlet Flow Meter', 'm³/hr', true, true),
  ('INT-Totalizer-IN', 'intake', 'Inlet Totalizer', 'm³', true, false),
  ('INT-Flow-OUT', 'intake', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('INT-Totalizer-OUT', 'intake', 'Outlet Totalizer', 'm³', true, false),
  ('INT-Pump1', 'intake', 'VT Pump 1', '', true, false),
  ('INT-Pump2', 'intake', 'VT Pump 2', '', true, false),

  -- OHT-1 (Bus Station OHT)
  ('OHT1-PT1', 'oht', 'Inlet Pressure 1 (PT1)', 'Bar', true, true),
  ('OHT1-PT2', 'oht', 'Inlet Pressure 2 (PT2)', 'Bar', true, true),
  ('OHT1-LT', 'oht', 'Water Level (LT)', '%', true, true),
  ('OHT1-Flow', 'oht', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('OHT1-Totalizer', 'oht', 'Outlet Totalizer', 'm³', true, false),
  ('OHT1-DecrTotalizer', 'oht', 'Decremental Totalizer', 'm³', true, false),

  -- OHT-2 (Pending Commissioning)
  ('OHT2-PT1', 'oht', 'Inlet Pressure 1 (PT1)', 'Bar', true, true),
  ('OHT2-PT2', 'oht', 'Inlet Pressure 2 (PT2)', 'Bar', true, true),
  ('OHT2-LT', 'oht', 'Water Level (LT)', '%', true, true),
  ('OHT2-Flow', 'oht', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('OHT2-Totalizer', 'oht', 'Outlet Totalizer', 'm³', true, false),
  ('OHT2-DecrTotalizer', 'oht', 'Decremental Totalizer', 'm³', true, false),

  -- WTP (Pending Commissioning)
  ('WTP-LT-BW', 'wtp', 'Backwash Level', '%', true, true),
  ('WTP-LT-CW', 'wtp', 'Clear Water Level', '%', true, true),
  ('WTP-PT1', 'wtp', 'HT Pump 1 Pressure', 'Bar', true, true),
  ('WTP-PT2', 'wtp', 'HT Pump 2 Pressure', 'Bar', true, true),
  ('WTP-HeaderPT', 'wtp', 'Combined Header Pressure', 'Bar', true, true),
  ('WTP-Flow-IN', 'wtp', 'Inlet Flow Meter', 'm³/hr', true, true),
  ('WTP-Totalizer-IN', 'wtp', 'Inlet Totalizer', 'm³', true, false),
  ('WTP-Flow-OUT', 'wtp', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('WTP-Totalizer-OUT', 'wtp', 'Outlet Totalizer', 'm³', true, false),
  ('WTP-PH-IN', 'wtp', 'Inlet pH', 'pH', true, true),
  ('WTP-TA-IN', 'wtp', 'Inlet Turbidity', 'NTU', true, true),
  ('WTP-PH', 'wtp', 'Outlet pH', 'pH', true, true),
  ('WTP-CL', 'wtp', 'Outlet Chlorine', 'PPM', true, true),
  ('WTP-TA', 'wtp', 'Outlet Turbidity', 'NTU', true, true),
  ('WTP-TEM', 'wtp', 'Outlet Temperature', '°C', true, true),
  ('WTP-Pump1', 'wtp', 'HT Pump 1', '', true, false),
  ('WTP-Pump2', 'wtp', 'HT Pump 2', '', true, false)
ON CONFLICT (section, tag_id) DO UPDATE SET
  label = EXCLUDED.label,
  unit = EXCLUDED.unit,
  is_active = EXCLUDED.is_active;
