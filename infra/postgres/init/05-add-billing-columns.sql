-- Migration: Add billing columns to tenants table
-- Required for subscription/checkout flow and billing gateway integration

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_provider VARCHAR(50) DEFAULT 'asaas';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_customer_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
