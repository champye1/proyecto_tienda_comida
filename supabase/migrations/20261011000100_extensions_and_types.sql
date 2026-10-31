-- =============================================================================
-- 1. Extensiones y tipos
-- =============================================================================

-- pgcrypto vive en el esquema `extensions` en Supabase (gen_random_bytes para tracking_token).
create extension if not exists pgcrypto with schema extensions;

create type public.order_status as enum (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled'
);

create type public.order_type as enum ('delivery', 'pickup');

create type public.payment_method as enum ('cash', 'transfer');

create type public.member_role as enum ('owner', 'staff');
