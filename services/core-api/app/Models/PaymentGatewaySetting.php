<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PaymentGatewaySetting extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'provider',
        'is_active',
        'api_key_encrypted',
        'webhook_secret_encrypted',
        'sandbox',
        'metadata',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'sandbox' => 'boolean',
        'metadata' => 'array',
    ];

    protected $hidden = ['api_key_encrypted', 'webhook_secret_encrypted'];

    public function getDecryptedApiKey(): ?string
    {
        if (!$this->api_key_encrypted) {
            return null;
        }
        try {
            return decrypt($this->api_key_encrypted);
        } catch (\Exception $e) {
            return null;
        }
    }

    public function getMaskedApiKey(): ?string
    {
        $key = $this->getDecryptedApiKey();
        if (!$key) {
            return null;
        }
        if (strlen($key) <= 12) {
            return '****';
        }
        return substr($key, 0, 8) . '...' . substr($key, -4);
    }

    public function getDecryptedWebhookSecret(): ?string
    {
        if (!$this->webhook_secret_encrypted) {
            return null;
        }
        try {
            return decrypt($this->webhook_secret_encrypted);
        } catch (\Exception $e) {
            return null;
        }
    }

    public function getMaskedWebhookSecret(): ?string
    {
        $secret = $this->getDecryptedWebhookSecret();
        if (!$secret) {
            return null;
        }
        return substr($secret, 0, 6) . '...' . substr($secret, -4);
    }
}
