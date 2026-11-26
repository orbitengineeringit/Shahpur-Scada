-- Run on the pilot project after initializing its checkpoint and storing
-- historian_shadow_url and historian_shadow_signing_key in Vault.
SELECT cron.schedule('historian-sheets-backup-shadow', '*/5 * * * *', $job$
  WITH due AS (
    SELECT to_char(next_window AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS window_start
    FROM public.historian_backup_shadow_checkpoint
    WHERE id AND next_window < end_window AND next_window + interval '15 minutes' <= now()
  )
  SELECT net.http_post(
    url := endpoint.decrypted_secret,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-backup-signature', encode(extensions.hmac(due.window_start, signer.decrypted_secret, 'sha256'), 'hex')
    ),
    body := jsonb_build_object('windowStart', due.window_start, 'scheduled', true),
    timeout_milliseconds := 60000
  )
  FROM due
  CROSS JOIN vault.decrypted_secrets endpoint
  CROSS JOIN vault.decrypted_secrets signer
  WHERE endpoint.name = 'historian_shadow_url' AND signer.name = 'historian_shadow_signing_key';
$job$);
