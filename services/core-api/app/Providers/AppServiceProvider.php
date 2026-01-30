<?php

namespace App\Providers;

use App\Models\PersonalAccessToken;
use App\Services\ClaudBotService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Register ClaudBot service as singleton
        $this->app->singleton(ClaudBotService::class, function ($app) {
            return new ClaudBotService();
        });

        // Initialize tenant context
        $this->app->singleton('current_tenant_id', function () {
            return null;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Use custom PersonalAccessToken with tenant binding
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        // Strict mode in development
        Model::shouldBeStrict(!$this->app->isProduction());

        // Prevent lazy loading in development
        Model::preventLazyLoading(!$this->app->isProduction());

        // Prevent silently discarding attributes
        Model::preventSilentlyDiscardingAttributes(!$this->app->isProduction());
    }
}
