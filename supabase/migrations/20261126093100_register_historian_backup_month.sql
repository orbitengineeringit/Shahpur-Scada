CREATE OR REPLACE FUNCTION public.register_historian_backup_month(
  registration_token text, workbook_month text, workbook_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  current_month timestamp := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata');
  expected_hash text;
  registered text;
BEGIN
  SELECT decrypted_secret INTO expected_hash FROM vault.decrypted_secrets
  WHERE name = 'historian_month_registrar_hash';
  IF registration_token IS NULL OR registration_token !~ '^[0-9a-f]{64}$' OR expected_hash IS NULL OR
     encode(extensions.digest(registration_token, 'sha256'), 'hex') <> expected_hash THEN
    RAISE EXCEPTION 'Invalid workbook registration credential' USING ERRCODE = '42501';
  END IF;

  IF workbook_month IS NULL OR workbook_month NOT IN (
    to_char(current_month, 'YYYY-MM'), to_char(current_month + interval '1 month', 'YYYY-MM')
  ) OR workbook_id IS NULL OR workbook_id !~ '^[A-Za-z0-9_-]{20,}$' THEN
    RAISE EXCEPTION 'Invalid workbook registration';
  END IF;

  INSERT INTO public.historian_backup_workbooks(month, spreadsheet_id) VALUES (workbook_month, workbook_id)
  ON CONFLICT (month) DO NOTHING;
  SELECT spreadsheet_id INTO registered FROM public.historian_backup_workbooks WHERE month = workbook_month;
  RETURN registered = workbook_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_historian_backup_month(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_historian_backup_month(text,text,text) TO anon;
