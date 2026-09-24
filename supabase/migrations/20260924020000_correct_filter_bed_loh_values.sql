-- LOH_FB1 and LOH_FB2 are already published by the WTP PLC as percentages.
-- The preceding instrument-alignment release incorrectly multiplied these
-- values by four. Restore the original instrument readings in both stores.
UPDATE public.historian_logs
SET value = value / 4.0
WHERE section = 'wtp'
  AND tag_id IN ('WTP-LOH-FB1', 'WTP-LOH-FB2')
  AND value BETWEEN 0 AND 100;

UPDATE public.telemetry_latest
SET value = value / 4.0
WHERE section = 'wtp'
  AND tag_id IN ('WTP-LOH-FB1', 'WTP-LOH-FB2')
  AND value BETWEEN 0 AND 100;
