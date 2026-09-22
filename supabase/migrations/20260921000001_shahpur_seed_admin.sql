-- ============================================================
-- Shahpur SCADA - Admin User Role Seed
-- NOTE: Auth user is created via Supabase Admin API / dashboard
-- This migration ensures the admin role is assigned
-- Admin user: adminshahpur@shahpur.scada
-- ============================================================

-- Assign admin role to the Shahpur admin user(s) (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE email IN ('adminshahpur@shahpur.scada', 'admin@shahpur.scada')
ON CONFLICT DO NOTHING;
