<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS view_profiles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                menu_items JSONB NOT NULL DEFAULT '[]',
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        ");

        DB::statement("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS view_profile_id UUID REFERENCES view_profiles(id)");

        // Seed default profiles
        $allItems = json_encode([
            'overview', 'subscription', 'whatsapp', 'integrations', 'customer-api',
            'webhooks', 'logs', 'audit', 'team', 'agent', 'tokens', 'settings',
        ]);

        $basicItems = json_encode([
            'overview', 'subscription', 'whatsapp', 'agent', 'tokens', 'team', 'settings',
        ]);

        DB::statement("
            INSERT INTO view_profiles (name, slug, description, menu_items, is_system, is_active)
            VALUES
                ('Comum', 'comum', 'Visualização simplificada para usuários finais', '{$basicItems}'::jsonb, TRUE, TRUE),
                ('Desenvolvedor', 'desenvolvedor', 'Visualização completa com ferramentas de desenvolvimento', '{$allItems}'::jsonb, TRUE, TRUE)
            ON CONFLICT (slug) DO NOTHING
        ");

        // Set default profile for existing tenants
        DB::statement("
            UPDATE tenants SET view_profile_id = (SELECT id FROM view_profiles WHERE slug = 'comum')
            WHERE view_profile_id IS NULL
        ");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE tenants DROP COLUMN IF EXISTS view_profile_id");
        DB::statement("DROP TABLE IF EXISTS view_profiles");
    }
};
