-- ============================================================
-- Shahpur SCADA - Set District to Sagar (Code 427)
-- Fixes District association: Shahpur is in District Sagar, NOT Betul.
-- Garud MP GIS Portal: District Code 427 (SAGAR), ULB 0492 (SHAHPUR).
-- ============================================================

-- Ensure plant_config contains Distt. Sagar
UPDATE public.plant_config
SET plant_name = 'Shahpur SCADA (Distt. Sagar)'
WHERE TRUE;

-- Add district fields to gis_config if not present and update values
DO $$
BEGIN
  ALTER TABLE public.gis_config ADD COLUMN IF NOT EXISTS district_name TEXT NOT NULL DEFAULT 'SAGAR';
  ALTER TABLE public.gis_config ADD COLUMN IF NOT EXISTS district_code TEXT NOT NULL DEFAULT '427';
  ALTER TABLE public.gis_config ADD COLUMN IF NOT EXISTS ulb_name TEXT NOT NULL DEFAULT 'SHAHPUR';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

UPDATE public.gis_config
SET
  district_name = 'SAGAR',
  district_code = '427',
  ulb_name = 'SHAHPUR'
WHERE TRUE;
