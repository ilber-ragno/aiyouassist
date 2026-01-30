<?php

namespace App\Providers;

use App\Services\ClaudBotService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

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
        // Strict mode in development
        Model::shouldBeStrict(!$this->app->isProduction());

        // Prevent lazy loading in development
        Model::preventLazyLoading(!$this->app->isProduction());

        // Prevent silently discarding attributes
        Model::preventSilentlyDiscardingAttributes(!$this->app->isProduction());
    }
}
