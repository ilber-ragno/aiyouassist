<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Credit packages (admin-defined)
        DB::statement("
            CREATE TABLE IF NOT EXISTS credit_packages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price_brl DECIMAL(10,2) NOT NULL,
                credit_amount_brl DECIMAL(10,2) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        ");

        // Tenant credit balance
        DB::statement("
            CREATE TABLE IF NOT EXISTS tenant_credits (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id),
                balance_brl DECIMAL(12,4) NOT NULL DEFAULT 0,
                total_purchased_brl DECIMAL(12,4) NOT NULL DEFAULT 0,
                total_consumed_brl DECIMAL(12,4) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        ");

        // Credit transactions history
        DB::statement("
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id),
                type VARCHAR(50) NOT NULL,
                amount_brl DECIMAL(12,4) NOT NULL,
                balance_after_brl DECIMAL(12,4) NOT NULL,
                description TEXT,
                reference_type VARCHAR(100),
                reference_id VARCHAR(255),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        ");

        DB::statement("CREATE INDEX IF NOT EXISTS idx_credit_transactions_tenant ON credit_transactions(tenant_id, created_at DESC)");
        DB::statement("CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(tenant_id, type)");

        // Credit settings (global admin configuration)
        DB::statement("
            CREATE TABLE IF NOT EXISTS credit_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                markup_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
                markup_value DECIMAL(10,4) NOT NULL DEFAULT 50,
                usd_to_brl_rate DECIMAL(10,4) NOT NULL DEFAULT 5.50,
                min_balance_warning_brl DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                block_on_zero_balance BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        ");

        // Seed default credit settings
        DB::statement("
            INSERT INTO credit_settings (markup_type, markup_value, usd_to_brl_rate, min_balance_warning_brl, block_on_zero_balance)
            SELECT 'percentage', 50, 5.50, 1.00, TRUE
            WHERE NOT EXISTS (SELECT 1 FROM credit_settings)
        ");

        // Add CHECK constraints
        DB::statement("
            DO $$ BEGIN
                ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
                    CHECK (type IN ('purchase', 'deduction', 'manual_credit', 'refund'));
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        ");

        DB::statement("
            DO $$ BEGIN
                ALTER TABLE credit_settings ADD CONSTRAINT credit_settings_markup_type_check
                    CHECK (markup_type IN ('percentage', 'fixed_per_1k'));
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        ");
    }

    public function down(): void
    {
        DB::statement("DROP TABLE IF EXISTS credit_transactions");
        DB::statement("DROP TABLE IF EXISTS tenant_credits");
        DB::statement("DROP TABLE IF EXISTS credit_packages");
        DB::statement("DROP TABLE IF EXISTS credit_settings");
    }
};
