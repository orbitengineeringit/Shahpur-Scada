-- Align Shahpur WTP with the installed field instruments.
-- The inlet EFM, inlet totalizer and inlet pH transmitter do not exist at site;
-- remove their synthetic cache/history/config so they cannot reappear in UI or exports.
DELETE FROM public.alarms
WHERE section = 'wtp'
  AND tag_id IN ('WTP-Flow-IN', 'WTP-Totalizer-IN', 'WTP-PH-IN');

DELETE FROM public.historian_logs
WHERE section = 'wtp'
  AND tag_id IN ('WTP-Flow-IN', 'WTP-Totalizer-IN', 'WTP-PH-IN');

DELETE FROM public.telemetry_latest
WHERE section = 'wtp'
  AND tag_id IN ('WTP-Flow-IN', 'WTP-Totalizer-IN', 'WTP-PH-IN');

DELETE FROM public.tag_config
WHERE section = 'wtp'
  AND tag_id IN ('WTP-Flow-IN', 'WTP-Totalizer-IN', 'WTP-PH-IN');

-- LOH is a direct 0–100% PLC value. ROF is reported/stored in cubic metres.
UPDATE public.tag_config
SET unit = 'm³', label = 'Rate of Flow (Filter Bed 1)'
WHERE section = 'wtp' AND tag_id = 'WTP-ROF-FB1';

UPDATE public.tag_config
SET unit = '%', high_setpoint = 85, low_setpoint = NULL,
    label = CASE tag_id
      WHEN 'WTP-LOH-FB1' THEN 'Loss of Head (FB1)'
      ELSE 'Loss of Head (FB2)'
    END
WHERE section = 'wtp' AND tag_id IN ('WTP-LOH-FB1', 'WTP-LOH-FB2');

-- Existing LOH rows were stored on the old 0–25 scale. Convert them once so
-- historical fetches use the same 0–100% engineering unit as new telemetry.
UPDATE public.historian_logs
SET value = LEAST(100, value * 4)
WHERE section = 'wtp'
  AND tag_id IN ('WTP-LOH-FB1', 'WTP-LOH-FB2')
  AND value BETWEEN 0 AND 25;

UPDATE public.telemetry_latest
SET value = LEAST(100, value * 4)
WHERE section = 'wtp'
  AND tag_id IN ('WTP-LOH-FB1', 'WTP-LOH-FB2')
  AND value BETWEEN 0 AND 25;
