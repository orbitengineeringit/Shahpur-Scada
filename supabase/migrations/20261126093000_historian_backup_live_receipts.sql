CREATE TABLE IF NOT EXISTS public.historian_backup_workbooks (
  month text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  spreadsheet_id text UNIQUE NOT NULL CHECK (spreadsheet_id ~ '^[a-zA-Z0-9_-]{20,}$'),
  readable_next jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historian_backup_receipts (
  window_start timestamptz PRIMARY KEY CHECK (extract(epoch FROM window_start) % 300 = 0),
  month text NOT NULL REFERENCES public.historian_backup_workbooks(month),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  readings integer NOT NULL CHECK (readings >= 0)
);

ALTER TABLE public.historian_backup_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historian_backup_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historian_backup_workbooks, public.historian_backup_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.historian_backup_workbooks, public.historian_backup_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.ack_historian_backup(
  expected_start timestamptz, workbook_month text, verified_digest text,
  reading_count integer, station_positions jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  UPDATE public.historian_backup_shadow_checkpoint
     SET next_window = expected_start + interval '5 minutes',
         last_digest = verified_digest, last_verified_at = now()
   WHERE id AND next_window = expected_start AND next_window < end_window;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.historian_backup_workbooks SET readable_next = station_positions WHERE month = workbook_month;
  IF NOT FOUND THEN RAISE EXCEPTION 'Backup workbook is missing'; END IF;
  INSERT INTO public.historian_backup_receipts VALUES (expected_start, workbook_month, verified_digest, reading_count);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ack_historian_backup(timestamptz,text,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_historian_backup(timestamptz,text,text,integer,jsonb) TO service_role;
