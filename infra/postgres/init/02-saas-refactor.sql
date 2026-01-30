-- =============================================================================
-- AiYou Assist - SaaS Portal Refactoring
-- New tables for portal modules
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. clawdbot_workspaces - Vinculo tenant <-> workspace do clawd.bot
-- =============================================================================
CREATE TABLE IF NOT EXISTS clawdbot_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workspace_name VARCHAR(255) NOT NULL,
    gateway_url VARCHAR(500) NOT NULL DEFAULT 'ws://127.0.0.1:18789',
    auth_token_encrypted TEXT,
    agent_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    health_status VARCHAR(50) NOT NULL DEFAULT 'unknown',
    last_health_check_at TIMESTAMPTZ,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clawdbot_workspaces_tenant ON clawdbot_workspaces(tenant_id);
CREATE INDEX idx_clawdbot_workspaces_status ON clawdbot_workspaces(status);

-- RLS
ALTER TABLE clawdbot_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY clawdbot_workspaces_tenant_isolation ON clawdbot_workspaces
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY clawdbot_workspaces_tenant_insert ON clawdbot_workspaces
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- =============================================================================
-- 2. webhook_endpoints - Configs de webhook do tenant
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    description VARCHAR(500),
    events TEXT[] NOT NULL DEFAULT '{}',
    secret_encrypted TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    retry_policy JSONB NOT NULL DEFAULT '{"max_retries": 3, "retry_delay_seconds": 60}',
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(tenant_id, is_active);

-- Webhook delivery log (sub-table)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    response_status INTEGER,
    response_body TEXT,
    duration_ms INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

-- RLS
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_tenant_isolation ON webhook_endpoints
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhook_endpoints_tenant_insert ON webhook_endpoints
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY webhook_deliveries_tenant_insert ON webhook_deliveries
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- =============================================================================
-- 3. integration_configs - Integracoes habilitadas
-- =============================================================================
CREATE TABLE IF NOT EXISTS integration_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    credentials_encrypted TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, integration_type)
);

CREATE INDEX idx_integration_configs_tenant ON integration_configs(tenant_id);
CREATE INDEX idx_integration_configs_type ON integration_configs(integration_type);
CREATE INDEX idx_integration_configs_enabled ON integration_configs(tenant_id, is_enabled);

-- RLS
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_configs_tenant_isolation ON integration_configs
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY integration_configs_tenant_insert ON integration_configs
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- =============================================================================
-- 4. execution_logs - Log unificado
-- =============================================================================
CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    log_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    source VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    correlation_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_execution_logs_tenant ON execution_logs(tenant_id);
CREATE INDEX idx_execution_logs_type ON execution_logs(log_type);
CREATE INDEX idx_execution_logs_severity ON execution_logs(severity);
CREATE INDEX idx_execution_logs_source ON execution_logs(source);
CREATE INDEX idx_execution_logs_created ON execution_logs(created_at DESC);
CREATE INDEX idx_execution_logs_correlation ON execution_logs(correlation_id);
CREATE INDEX idx_execution_logs_tenant_created ON execution_logs(tenant_id, created_at DESC);

-- RLS
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_logs_tenant_isolation ON execution_logs
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY execution_logs_tenant_insert ON execution_logs
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- =============================================================================
-- Seed additional permissions for new modules
-- =============================================================================
INSERT INTO permissions (id, name, description) VALUES
    (gen_random_uuid(), 'integrations.read', 'View integrations'),
    (gen_random_uuid(), 'integrations.write', 'Manage integrations'),
    (gen_random_uuid(), 'webhooks.read', 'View webhooks'),
    (gen_random_uuid(), 'webhooks.write', 'Manage webhooks'),
    (gen_random_uuid(), 'logs.read', 'View execution logs'),
    (gen_random_uuid(), 'audit.read', 'View audit trail'),
    (gen_random_uuid(), 'audit.export', 'Export audit data'),
    (gen_random_uuid(), 'team.read', 'View team members'),
    (gen_random_uuid(), 'team.write', 'Manage team members'),
    (gen_random_uuid(), 'settings.read', 'View settings'),
    (gen_random_uuid(), 'settings.write', 'Manage settings'),
    (gen_random_uuid(), 'subscription.read', 'View subscription'),
    (gen_random_uuid(), 'subscription.write', 'Manage subscription'),
    (gen_random_uuid(), 'customer_api.read', 'View customer API'),
    (gen_random_uuid(), 'customer_api.write', 'Manage customer API')
ON CONFLICT DO NOTHING;

COMMIT;
