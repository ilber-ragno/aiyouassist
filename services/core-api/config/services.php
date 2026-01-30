<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    /*
    |--------------------------------------------------------------------------
    | ClaudBot / Moltbot (WhatsApp Gateway)
    |--------------------------------------------------------------------------
    */

    'claudbot' => [
        'url' => env('CLAUDBOT_URL', 'http://localhost:19000'),
        'token' => env('CLAUDBOT_TOKEN'),
        'webhook_secret' => env('CLAUDBOT_WEBHOOK_SECRET'),
        'internal_key' => env('CLAUDBOT_INTERNAL_KEY', ''),
    ],

    /*
    |--------------------------------------------------------------------------
    | Telegram Service
    |--------------------------------------------------------------------------
    */

    'telegram' => [
        'url' => env('TELEGRAM_SERVICE_URL', 'http://telegram-service:8005'),
        'internal_key' => env('TELEGRAM_INTERNAL_KEY', env('CLAUDBOT_INTERNAL_KEY', '')),
    ],

    /*
    |--------------------------------------------------------------------------
    | Webchat Service
    |--------------------------------------------------------------------------
    */

    'webchat' => [
        'url' => env('WEBCHAT_SERVICE_URL', 'http://webchat-service:8006'),
        'internal_key' => env('WEBCHAT_INTERNAL_KEY', env('CLAUDBOT_INTERNAL_KEY', '')),
        'public_url' => env('WEBCHAT_PUBLIC_URL', 'https://chat.meuaiyou.cloud'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Stripe
    |--------------------------------------------------------------------------
    */

    'stripe' => [
        'key' => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Asaas (Brazilian Payment Gateway)
    |--------------------------------------------------------------------------
    */

    'asaas' => [
        'api_key' => env('ASAAS_API_KEY'),
        'webhook_secret' => env('ASAAS_WEBHOOK_SECRET'),
        'sandbox' => env('ASAAS_SANDBOX', false),
        'base_url' => env('ASAAS_SANDBOX', false)
            ? 'https://sandbox.asaas.com/api/v3'
            : 'https://api.asaas.com/v3',
    ],

    /*
    |--------------------------------------------------------------------------
    | AI Orchestrator
    |--------------------------------------------------------------------------
    */

    'ai_orchestrator' => [
        'url' => env('AI_ORCHESTRATOR_URL', 'http://ai-orchestrator:8003'),
        'token' => env('AI_ORCHESTRATOR_TOKEN'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Customer API Service
    |--------------------------------------------------------------------------
    */

    'customer_api' => [
        'url' => env('CUSTOMER_API_URL', 'http://customer-api-service:8004'),
        'token' => env('CUSTOMER_API_TOKEN'),
    ],

];
