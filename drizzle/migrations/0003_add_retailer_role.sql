-- Retail / billing counter role. Added in its own migration because a new enum
-- value cannot be referenced by other statements in the same transaction.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'retailer';