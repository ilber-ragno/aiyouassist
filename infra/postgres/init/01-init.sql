-- =============================================================================
-- AIYOU ASSIST - PostgreSQL Initialization
-- MULTI-TENANT ISOLATION: Cada cliente = 1 tenant completamente isolado
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TENANTS (Base table - all other tables reference this)
-- =============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    email_verified_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- ROLES & PERMISSIONS
-- =============================================================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50)
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- =============================================================================
-- PLANS & SUBSCRIPTIONS
-- =============================================================================
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10, 2) NOT NULL,
    price_yearly DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'BRL',
    is_active BOOLEAN DEFAULT true,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE plan_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    limit_key VARCHAR(100) NOT NULL,
    limit_value INTEGER NOT NULL,
    description TEXT,
    UNIQUE(plan_id, limit_key)
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trial', 'paused')),
    payment_provider VARCHAR(50) NOT NULL CHECK (payment_provider IN ('stripe', 'asaas')),
    external_id VARCHAR(255),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- =============================================================================
-- INVOICES & BILLING EVENTS
-- =============================================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    external_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BRL',
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    invoice_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);

CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    external_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_billing_events_tenant ON billing_events(tenant_id);
CREATE INDEX idx_billing_events_idempotency ON billing_events(idempotency_key);

-- =============================================================================
-- WHATSAPP SESSIONS
-- =============================================================================
CREATE TABLE whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20),
    session_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'waiting_qr', 'connected', 'reconnecting', 'error', 'banned')),
    qr_code TEXT,
    qr_expires_at TIMESTAMP WITH TIME ZONE,
    session_data_encrypted BYTEA,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, session_name)
);

CREATE INDEX idx_whatsapp_sessions_tenant ON whatsapp_sessions(tenant_id);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(status);

-- =============================================================================
-- CONVERSATIONS & MESSAGES
-- =============================================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    whatsapp_session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    contact_profile_pic VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting_human', 'with_human', 'resolved', 'archived')),
    assigned_user_id UUID REFERENCES users(id),
    priority INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_contact ON conversations(contact_phone);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('contact', 'ai', 'human')),
    sender_id UUID,
    content_type VARCHAR(50) NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')),
    content TEXT,
    media_url VARCHAR(500),
    whatsapp_message_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- =============================================================================
-- AI AGENT SETTINGS
-- =============================================================================
CREATE TABLE agent_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT 'Default Agent',
    persona TEXT,
    tone VARCHAR(50) DEFAULT 'professional',
    language VARCHAR(10) DEFAULT 'pt-BR',
    operating_hours JSONB DEFAULT '{}',
    forbidden_topics TEXT[],
    escalation_rules JSONB DEFAULT '{}',
    cost_mode VARCHAR(20) DEFAULT 'normal' CHECK (cost_mode IN ('normal', 'restricted', 'unlimited')),
    allowed_tools TEXT[],
    max_response_tokens INTEGER DEFAULT 1024,
    confidence_threshold DECIMAL(3, 2) DEFAULT 0.7,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_agent_settings_tenant ON agent_settings(tenant_id);

-- =============================================================================
-- AI DECISIONS (Audit Trail)
-- =============================================================================
CREATE TABLE ai_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id),
    decision_type VARCHAR(50) NOT NULL,
    input_context JSONB NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost_usd DECIMAL(10, 6),
    confidence_score DECIMAL(3, 2),
    tools_used TEXT[],
    output_action VARCHAR(100),
    output_content TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_decisions_tenant ON ai_decisions(tenant_id);
CREATE INDEX idx_ai_decisions_conversation ON ai_decisions(conversation_id);
CREATE INDEX idx_ai_decisions_created ON ai_decisions(created_at DESC);

-- =============================================================================
-- CUSTOMER API CONNECTIONS
-- =============================================================================
CREATE TABLE customer_api_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic', 'oauth2')),
    credentials_encrypted BYTEA,
    headers JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    dry_run_mode BOOLEAN DEFAULT false,
    circuit_breaker_state VARCHAR(20) DEFAULT 'closed' CHECK (circuit_breaker_state IN ('closed', 'open', 'half_open')),
    failure_count INTEGER DEFAULT 0,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_customer_api_connections_tenant ON customer_api_connections(tenant_id);

CREATE TABLE customer_api_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID NOT NULL REFERENCES customer_api_connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    path VARCHAR(500) NOT NULL,
    description TEXT,
    parameters_schema JSONB,
    response_schema JSONB,
    is_allowed BOOLEAN DEFAULT true,
    requires_confirmation BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customer_api_endpoints_tenant ON customer_api_endpoints(tenant_id);

CREATE TABLE customer_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES customer_api_endpoints(id),
    ai_decision_id UUID REFERENCES ai_decisions(id),
    request_method VARCHAR(10) NOT NULL,
    request_url TEXT NOT NULL,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customer_api_logs_tenant ON customer_api_logs(tenant_id);
CREATE INDEX idx_customer_api_logs_created ON customer_api_logs(created_at DESC);

-- =============================================================================
-- HANDOFF EVENTS
-- =============================================================================
CREATE TABLE handoff_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('escalated', 'assigned', 'returned_to_ai', 'resolved')),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_handoff_events_tenant ON handoff_events(tenant_id);
CREATE INDEX idx_handoff_events_conversation ON handoff_events(conversation_id);

-- =============================================================================
-- AUDIT LOGS
-- =============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    correlation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- =============================================================================
-- WEBHOOK EVENTS
-- =============================================================================
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    external_id VARCHAR(255),
    payload JSONB NOT NULL,
    signature VARCHAR(255),
    signature_valid BOOLEAN,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_idempotency ON webhook_events(idempotency_key);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - CRITICAL FOR TENANT ISOLATION
-- =============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_api_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (application sets current_tenant_id before queries)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Policy template for tenant isolation
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'users', 'roles', 'subscriptions', 'invoices', 'billing_events',
        'whatsapp_sessions', 'conversations', 'messages', 'agent_settings',
        'ai_decisions', 'customer_api_connections', 'customer_api_endpoints',
        'customer_api_logs', 'handoff_events', 'audit_logs'
    ])
    LOOP
        EXECUTE format('
            CREATE POLICY tenant_isolation_%I ON %I
            FOR ALL
            USING (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id())
        ', tbl, tbl);
    END LOOP;
END $$;

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Insert default permissions
INSERT INTO permissions (name, description, category) VALUES
    ('tenants.read', 'View tenant information', 'tenants'),
    ('tenants.update', 'Update tenant settings', 'tenants'),
    ('users.read', 'View users', 'users'),
    ('users.create', 'Create users', 'users'),
    ('users.update', 'Update users', 'users'),
    ('users.delete', 'Delete users', 'users'),
    ('conversations.read', 'View conversations', 'conversations'),
    ('conversations.manage', 'Manage conversations', 'conversations'),
    ('messages.send', 'Send messages', 'messages'),
    ('whatsapp.manage', 'Manage WhatsApp connections', 'whatsapp'),
    ('agent.configure', 'Configure AI agent', 'agent'),
    ('integrations.manage', 'Manage API integrations', 'integrations'),
    ('billing.read', 'View billing information', 'billing'),
    ('billing.manage', 'Manage billing', 'billing'),
    ('audit.read', 'View audit logs', 'audit'),
    ('reports.read', 'View reports', 'reports');

-- Insert default plans
INSERT INTO plans (name, slug, description, price_monthly, price_yearly, features) VALUES
    ('Starter', 'starter', 'Para pequenos negócios começando com automação', 97.00, 970.00, '{"whatsapp_connections": 1, "users": 2, "ai_enabled": true}'),
    ('Professional', 'professional', 'Para empresas em crescimento', 297.00, 2970.00, '{"whatsapp_connections": 3, "users": 10, "ai_enabled": true, "api_integrations": true}'),
    ('Enterprise', 'enterprise', 'Para grandes operações', 997.00, 9970.00, '{"whatsapp_connections": 10, "users": -1, "ai_enabled": true, "api_integrations": true, "dedicated_support": true}');

-- Insert plan limits
INSERT INTO plan_limits (plan_id, limit_key, limit_value, description)
SELECT p.id, l.key, l.value, l.description
FROM plans p
CROSS JOIN (VALUES
    ('starter', 'messages_monthly', 1000, 'Monthly message limit'),
    ('starter', 'ai_tokens_monthly', 100000, 'Monthly AI token limit'),
    ('starter', 'whatsapp_connections', 1, 'WhatsApp connections'),
    ('starter', 'users', 2, 'Team members'),
    ('professional', 'messages_monthly', 10000, 'Monthly message limit'),
    ('professional', 'ai_tokens_monthly', 500000, 'Monthly AI token limit'),
    ('professional', 'whatsapp_connections', 3, 'WhatsApp connections'),
    ('professional', 'users', 10, 'Team members'),
    ('professional', 'api_connections', 5, 'External API integrations'),
    ('enterprise', 'messages_monthly', -1, 'Unlimited messages'),
    ('enterprise', 'ai_tokens_monthly', 2000000, 'Monthly AI token limit'),
    ('enterprise', 'whatsapp_connections', 10, 'WhatsApp connections'),
    ('enterprise', 'users', -1, 'Unlimited team members'),
    ('enterprise', 'api_connections', -1, 'Unlimited API integrations')
) AS l(plan_slug, key, value, description)
WHERE p.slug = l.plan_slug;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'tenants', 'users', 'subscriptions', 'invoices', 'whatsapp_sessions',
        'conversations', 'agent_settings', 'customer_api_connections'
    ])
    LOOP
        EXECUTE format('
            CREATE TRIGGER update_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at()
        ', tbl, tbl);
    END LOOP;
END $$;

-- =============================================================================
-- DONE
-- =============================================================================
