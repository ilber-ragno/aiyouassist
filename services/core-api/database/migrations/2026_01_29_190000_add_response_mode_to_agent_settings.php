<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS response_mode VARCHAR(20) DEFAULT 'all'");
        DB::statement("ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS whitelisted_phones JSONB DEFAULT '[]'");
        DB::statement("ALTER TABLE agent_settings DROP CONSTRAINT IF EXISTS agent_settings_response_mode_check");
        DB::statement("ALTER TABLE agent_settings ADD CONSTRAINT agent_settings_response_mode_check CHECK (response_mode IN ('all','owner_only','whitelist'))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE agent_settings DROP CONSTRAINT IF EXISTS agent_settings_response_mode_check");
        DB::statement("ALTER TABLE agent_settings DROP COLUMN IF EXISTS response_mode");
        DB::statement("ALTER TABLE agent_settings DROP COLUMN IF EXISTS whitelisted_phones");
    }
};
