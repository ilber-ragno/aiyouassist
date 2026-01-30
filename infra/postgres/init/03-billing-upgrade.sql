-- =============================================================================
-- AiYou Assist - Billing Upgrade
-- Add billing columns to tenants + seed initial plans
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Add billing columns to tenants
-- =============================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_customer_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_provider VARCHAR(50) DEFAULT 'asaas';

CREATE INDEX IF NOT EXISTS idx_tenants_is_blocked ON tenants(is_blocked);
CREATE INDEX IF NOT EXISTS idx_tenants_billing_provider ON tenants(billing_provider);

-- =============================================================================
-- 2. Add indexes to invoices for better query performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_external ON invoices(external_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);

-- =============================================================================
-- 3. Add indexes to billing_events
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON billing_events(provider);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events(created_at DESC);

-- =============================================================================
-- 4. Add indexes to subscriptions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_external ON subscriptions(external_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(payment_provider);

-- =============================================================================
-- 5. Ensure webhook_events table exists (used by WebhookController)
-- =============================================================================
-- Table already exists from 01-init.sql

-- =============================================================================
-- 6. Seed billing permissions
-- =============================================================================
INSERT INTO permissions (id, name, description, category) VALUES
    (gen_random_uuid(), 'admin.billing.read', 'View admin billing dashboard', 'billing'),
    (gen_random_uuid(), 'admin.billing.manage', 'Manage billing (block/unblock tenants)', 'billing')
ON CONFLICT (name) DO NOTHING;

COMMIT;
