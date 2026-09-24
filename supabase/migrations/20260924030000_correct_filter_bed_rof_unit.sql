-- ROF_FB1 is published by the WTP PLC as a direct percentage, just like the
-- two loss-of-head tags. Align the configured display unit and alarm range.
UPDATE public.tag_config
SET unit = '%', high_setpoint = 90, low_setpoint = NULL,
    label = 'Rate of Flow (Filter Bed 1)'
WHERE section = 'wtp' AND tag_id = 'WTP-ROF-FB1';
