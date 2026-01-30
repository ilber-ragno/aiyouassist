<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE llm_providers DROP CONSTRAINT IF EXISTS llm_providers_provider_type_check');
        DB::statement("ALTER TABLE llm_providers ADD CONSTRAINT llm_providers_provider_type_check CHECK (provider_type::text = ANY (ARRAY['anthropic','openai','groq','mistral','cohere','google','openrouter']::text[]))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE llm_providers DROP CONSTRAINT IF EXISTS llm_providers_provider_type_check');
        DB::statement("ALTER TABLE llm_providers ADD CONSTRAINT llm_providers_provider_type_check CHECK (provider_type::text = ANY (ARRAY['anthropic','openai','groq','mistral','cohere','google']::text[]))");
    }
};
