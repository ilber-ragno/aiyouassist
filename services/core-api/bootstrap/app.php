<?php

use App\Http\Middleware\CheckRole;
use App\Http\Middleware\CheckTenantBilling;
use App\Http\Middleware\EnsureTenantIsActive;
use App\Http\Middleware\TenantContext;
use App\Http\Middleware\TenantGuard;
use App\Http\Middleware\TenantRateLimiter;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'tenant.context' => TenantContext::class,
            'tenant.active' => EnsureTenantIsActive::class,
            'tenant.billing' => CheckTenantBilling::class,
            'tenant.guard' => TenantGuard::class,
            'tenant.rate' => TenantRateLimiter::class,
            'role' => CheckRole::class,
        ]);

        // Exclude all API routes from CSRF (uses Bearer token auth)
        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
