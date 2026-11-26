-- Read-only, scoped transport for the owner-run Apps Script archive worker.
CREATE SCHEMA IF NOT EXISTS historian_archive_private;
REVOKE ALL ON SCHEMA historian_archive_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS historian_archive_private.credential (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32)
);
ALTER TABLE historian_archive_private.credential ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE historian_archive_private.credential FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.historian_archive_page(
  archive_token text, source_table text, range_start timestamptz,
  range_end timestamptz, cursor_time timestamptz DEFAULT NULL,
  cursor_id uuid DEFAULT NULL, page_size integer DEFAULT 200,
  verify_window boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE
  time_column text;
  result jsonb;
BEGIN
  IF archive_token IS NULL OR archive_token !~ '^[a-f0-9]{64}$' OR NOT EXISTS (
    SELECT 1 FROM historian_archive_private.credential c
    WHERE c.sha256 = pg_catalog.sha256(pg_catalog.convert_to(archive_token, 'UTF8'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Archive access denied';
  END IF;

  IF range_start IS NULL OR range_end IS NULL OR range_start >= range_end
     OR range_end - range_start > interval '32 days' OR range_end > now()
     OR (cursor_time IS NULL) <> (cursor_id IS NULL)
     OR page_size IS NULL OR page_size NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid archive page';
  END IF;

  CASE source_table
    WHEN 'historian_logs' THEN time_column := 'timestamp';
    WHEN 'historian_aggregates' THEN time_column := 'bucket_start';
    WHEN 'alarms' THEN time_column := 'created_at';
    ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown archive source';
  END CASE;

  IF verify_window THEN
    EXECUTE pg_catalog.format($query$
      WITH ordered AS (
        SELECT (row_number() OVER (ORDER BY src.%1$I, src.id) - 1) / $3 AS batch,
          src.id AS archive_id, src.%1$I AS archive_time, to_jsonb(src)::text AS body
        FROM public.%2$I src
        WHERE src.%1$I >= $1 AND src.%1$I < $2
      ), batches AS (
        SELECT batch, count(*) AS row_count,
          encode(sha256(convert_to(string_agg(body, chr(10) ORDER BY archive_time, archive_id), 'UTF8')), 'hex') AS digest
        FROM ordered GROUP BY batch
      )
      SELECT jsonb_build_object('count', COALESCE(sum(row_count), 0),
        'digest', encode(sha256(convert_to(COALESCE(string_agg(digest, chr(10) ORDER BY batch), ''), 'UTF8')), 'hex'))
      FROM batches
    $query$, time_column, source_table)
    INTO result USING range_start, range_end, page_size;
    RETURN result;
  END IF;

  EXECUTE pg_catalog.format($query$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', page.archive_id,
      'time', page.archive_time, 'body', page.body) ORDER BY page.archive_time, page.archive_id), '[]'::jsonb)
    FROM (
      SELECT src.id AS archive_id, src.%1$I AS archive_time, to_jsonb(src)::text AS body
      FROM public.%2$I src
      WHERE src.%1$I >= $1 AND src.%1$I < $2
        AND ($3 IS NULL OR (src.%1$I, src.id) > ($3, $4))
      ORDER BY src.%1$I, src.id LIMIT $5
    ) page
  $query$, time_column, source_table)
  INTO result USING range_start, range_end, cursor_time, cursor_id, page_size;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.historian_archive_page(text,text,timestamptz,timestamptz,timestamptz,uuid,integer,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.historian_archive_page(text,text,timestamptz,timestamptz,timestamptz,uuid,integer,boolean)
  TO anon, authenticated;
