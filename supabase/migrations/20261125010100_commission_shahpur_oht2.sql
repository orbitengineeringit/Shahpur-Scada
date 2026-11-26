-- Reuse the original four tag IDs to retain their historian identity.
-- TOTALIZER2 is a separate RTU register. Its direction and unit are unconfirmed.
UPDATE public.mqtt_config
SET oht_topic_2 = 'shahpur-oht2'
WHERE NULLIF(trim(oht_topic_2), '') IS NULL OR oht_topic_2 = 'sahpur/oht2/plc01/update';

INSERT INTO public.tag_config (section, tag_id, label, unit, is_active, alarm_enabled)
VALUES
  ('oht', 'OHT2-PT', 'Inlet Pressure (PT)', 'Bar', true, true),
  ('oht', 'OHT2-LT', 'Water Level (LT)', '%', true, true),
  ('oht', 'OHT2-Flow', 'Outlet Flow Meter', 'm³/hr', true, true),
  ('oht', 'OHT2-Totalizer', 'Totalizer', 'm³', true, false),
  ('oht', 'OHT2-Totalizer2', 'Totalizer 2', '', true, false)
ON CONFLICT (section, tag_id) DO UPDATE SET is_active = true;
