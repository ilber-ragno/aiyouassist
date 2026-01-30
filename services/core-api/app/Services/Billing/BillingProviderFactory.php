<?php

namespace App\Services\Billing;

use InvalidArgumentException;

class BillingProviderFactory
{
    /**
     * Resolve the billing service for the given provider
     */
    public static function resolve(string $provider): AsaasService|StripeService
    {
        return match ($provider) {
            'asaas' => app(AsaasService::class),
            'stripe' => app(StripeService::class),
            default => throw new InvalidArgumentException("Unknown billing provider: {$provider}"),
        };
    }
}
