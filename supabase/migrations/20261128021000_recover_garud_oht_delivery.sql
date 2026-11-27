-- Keep the regular hourly Garud job. An OHT that comes back between hourly
-- runs can go stale again before the next run, so check for missed fresh data.
SELECT cron.schedule(
  'gis-oht-recovery-cron',
  '7-57/5 * * * *',
  $job$
  WITH config AS (
    SELECT cron_secret, oht1_device_id, oht2_device_id
    FROM public.gis_config
    WHERE auto_sync_enabled
      AND id = (SELECT id FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
  )
  SELECT net.http_post(
    url := 'https://oizfikvgvwumhcllufqu.supabase.co/functions/v1/gis-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', config.cron_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  FROM config
  WHERE config.cron_secret IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM (VALUES ('OHT1', config.oht1_device_id), ('OHT2', config.oht2_device_id)) station(prefix, device_id)
      WHERE NULLIF(station.device_id, '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM (VALUES ('-PT', 0, 10), ('-PT2', 0, 10), ('-LT', -2, 102), ('-Flow', 0, 50)) garud_tag(suffix, low, high)
          JOIN public.telemetry_latest t ON t.tag_id = station.prefix || garud_tag.suffix
          WHERE t.quality = 'good'
            AND t.received_at BETWEEN now() - interval '15 minutes' AND now() + interval '5 minutes'
            AND t.value BETWEEN garud_tag.low AND garud_tag.high
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.gis_sync_logs log
          WHERE log.triggered_at >= now() - interval '1 hour'
            AND log.success
            AND log.request_payload @> jsonb_build_object('wtpUnits', jsonb_build_array(
              jsonb_build_object('ohts', jsonb_build_array(jsonb_build_object('ohT_Device_id', station.device_id)))
            ))
        )
    );
  $job$
);
