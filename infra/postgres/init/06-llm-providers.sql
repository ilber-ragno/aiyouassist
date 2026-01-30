-- =============================================================================
-- LLM Providers - Multi-provider AI management per tenant
-- =============================================================================

-- Table: llm_providers
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL
        CHECK (provider_type IN ('anthropic','openai','groq','mistral','cohere','google')),
    api_key_encrypted TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    budget_limit_usd DECIMAL(10,2) DEFAULT NULL,
    alert_threshold_pct INTEGER DEFAULT 80
        CHECK (alert_threshold_pct BETWEEN 1 AND 100),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_llm_providers_tenant ON llm_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_llm_providers_default ON llm_providers(tenant_id, is_default) WHERE is_default = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_llm_providers_active ON llm_providers(tenant_id, is_active) WHERE is_active = true AND deleted_at IS NULL;

-- RLS
ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_llm_providers ON llm_providers
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- Add llm_provider_id to ai_decisions
ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS llm_provider_id UUID REFERENCES llm_providers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_decisions_provider ON ai_decisions(llm_provider_id);
