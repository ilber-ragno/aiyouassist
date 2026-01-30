<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Make tenant_id nullable to allow global (admin-managed) providers
        DB::statement('ALTER TABLE llm_providers ALTER COLUMN tenant_id DROP NOT NULL');
    }

    public function down(): void
    {
        // Delete global providers first, then restore NOT NULL
        DB::table('llm_providers')->whereNull('tenant_id')->delete();
        DB::statement('ALTER TABLE llm_providers ALTER COLUMN tenant_id SET NOT NULL');
    }
};
