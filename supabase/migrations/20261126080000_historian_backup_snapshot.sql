-- Server-only source for the Sheets API backup. Keep all three datasets on
-- one PostgreSQL statement snapshot and retain the original JSON records.
CREATE OR REPLACE FUNCTION public.historian_backup_snapshot(window_start timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
SET timezone = 'UTC'
AS $$
  SELECT jsonb_build_object(
    'historian_logs', COALESCE((
      SELECT jsonb_agg(to_jsonb(h)::text ORDER BY h."timestamp", h.id)
      FROM public.historian_logs h
      WHERE h."timestamp" >= window_start AND h."timestamp" < window_start + interval '5 minutes'
    ), '[]'::jsonb),
    'alarms', COALESCE((
      SELECT jsonb_agg(to_jsonb(a)::text ORDER BY a.created_at, a.id)
      FROM public.alarms a
      WHERE a.created_at >= window_start AND a.created_at < window_start + interval '5 minutes'
    ), '[]'::jsonb),
    'historian_aggregates', COALESCE((
      SELECT jsonb_agg(to_jsonb(a)::text ORDER BY a.bucket_start, a.id)
      FROM public.historian_aggregates a
      WHERE extract(epoch FROM window_start)::bigint % 3600 = 0
        AND a.bucket_start = window_start - interval '1 hour'
    ), '[]'::jsonb)
  )
  WHERE extract(epoch FROM window_start) % 300 = 0
    AND window_start + interval '15 minutes' <= now();
$$;

REVOKE ALL ON FUNCTION public.historian_backup_snapshot(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.historian_backup_snapshot(timestamptz) TO service_role;
