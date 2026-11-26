-- Keep historical data available during backup and readback verification.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'historian-logs-cleanup-cron';
