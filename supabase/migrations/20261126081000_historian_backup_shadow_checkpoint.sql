CREATE TABLE IF NOT EXISTS public.historian_backup_shadow_checkpoint (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_window timestamptz NOT NULL CHECK (extract(epoch FROM next_window) % 300 = 0),
  end_window timestamptz NOT NULL CHECK (extract(epoch FROM end_window) % 300 = 0),
  last_digest text CHECK (last_digest ~ '^[0-9a-f]{64}$'),
  last_verified_at timestamptz,
  CHECK (next_window <= end_window)
);

ALTER TABLE public.historian_backup_shadow_checkpoint ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historian_backup_shadow_checkpoint FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.historian_backup_shadow_checkpoint TO service_role;
