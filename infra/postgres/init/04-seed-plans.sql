-- =============================================================================
-- AIYOU ASSIST - Seed Planos Iniciais
-- =============================================================================

-- Plano Starter
INSERT INTO plans (id, name, slug, description, price_monthly, price_yearly, currency, is_active, features)
VALUES (
    uuid_generate_v4(),
    'Starter',
    'starter',
    'Para quem esta comecando a automatizar o atendimento',
    49.90,
    478.80,
    'BRL',
    true,
    '{"whatsapp_sessions": 1, "messages_month": 1000, "team_members": 2, "integrations": false, "webhooks": false, "api_access": false, "audit": false}'
);

INSERT INTO plan_limits (id, plan_id, limit_key, limit_value, description)
SELECT uuid_generate_v4(), p.id, k.key, k.value::int, k.desc
FROM plans p,
(VALUES
    ('max_whatsapp_sessions', '1', 'Sessoes WhatsApp'),
    ('max_messages_month', '1000', 'Mensagens IA por mes'),
    ('max_team_members', '2', 'Membros da equipe'),
    ('max_integrations', '0', 'Integracoes')
) AS k(key, value, desc)
WHERE p.slug = 'starter';

-- Plano Pro
INSERT INTO plans (id, name, slug, description, price_monthly, price_yearly, currency, is_active, features)
VALUES (
    uuid_generate_v4(),
    'Pro',
    'pro',
    'Para empresas em crescimento',
    99.90,
    958.80,
    'BRL',
    true,
    '{"whatsapp_sessions": 3, "messages_month": 5000, "team_members": 10, "integrations": true, "webhooks": true, "api_access": true, "audit": false}'
);

INSERT INTO plan_limits (id, plan_id, limit_key, limit_value, description)
SELECT uuid_generate_v4(), p.id, k.key, k.value::int, k.desc
FROM plans p,
(VALUES
    ('max_whatsapp_sessions', '3', 'Sessoes WhatsApp'),
    ('max_messages_month', '5000', 'Mensagens IA por mes'),
    ('max_team_members', '10', 'Membros da equipe'),
    ('max_integrations', '5', 'Integracoes')
) AS k(key, value, desc)
WHERE p.slug = 'pro';

-- Plano Enterprise
INSERT INTO plans (id, name, slug, description, price_monthly, price_yearly, currency, is_active, features)
VALUES (
    uuid_generate_v4(),
    'Enterprise',
    'enterprise',
    'Para grandes operacoes com suporte dedicado',
    249.90,
    2398.80,
    'BRL',
    true,
    '{"whatsapp_sessions": 10, "messages_month": 50000, "team_members": -1, "integrations": true, "webhooks": true, "api_access": true, "audit": true}'
);

INSERT INTO plan_limits (id, plan_id, limit_key, limit_value, description)
SELECT uuid_generate_v4(), p.id, k.key, k.value::int, k.desc
FROM plans p,
(VALUES
    ('max_whatsapp_sessions', '10', 'Sessoes WhatsApp'),
    ('max_messages_month', '50000', 'Mensagens IA por mes'),
    ('max_team_members', '-1', 'Membros da equipe (ilimitado)'),
    ('max_integrations', '-1', 'Integracoes (ilimitado)')
) AS k(key, value, desc)
WHERE p.slug = 'enterprise';
