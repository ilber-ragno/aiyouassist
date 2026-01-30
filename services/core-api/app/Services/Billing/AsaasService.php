<?php

namespace App\Services\Billing;

use App\Models\Tenant;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AsaasService
{
    private PendingRequest $http;

    public function __construct()
    {
        $this->http = Http::baseUrl(config('services.asaas.base_url'))
            ->withHeaders([
                'access_token' => config('services.asaas.api_key'),
                'Content-Type' => 'application/json',
            ])
            ->timeout(30);
    }

    /**
     * Create a customer in Asaas
     */
    public function createCustomer(Tenant $tenant): array
    {
        $response = $this->http->post('/customers', [
            'name' => $tenant->name,
            'cpfCnpj' => $tenant->getSetting('cpf_cnpj'),
            'email' => $tenant->users()->first()?->email,
            'externalReference' => $tenant->id,
        ]);

        if ($response->failed()) {
            Log::error('Asaas: Failed to create customer', [
                'tenant_id' => $tenant->id,
                'response' => $response->json(),
            ]);
            $response->throw();
        }

        return $response->json();
    }

    /**
     * Get customer by ID
     */
    public function getCustomer(string $externalId): array
    {
        $response = $this->http->get("/customers/{$externalId}");
        $response->throw();
        return $response->json();
    }

    /**
     * Create a recurring subscription
     */
    public function createSubscription(string $customerId, array $planData, string $billingType = 'UNDEFINED'): array
    {
        $response = $this->http->post('/subscriptions', [
            'customer' => $customerId,
            'billingType' => $billingType,
            'value' => $planData['value'],
            'cycle' => $planData['cycle'] ?? 'MONTHLY',
            'description' => $planData['description'] ?? 'Assinatura AiYou Assist',
            'externalReference' => $planData['external_reference'] ?? null,
        ]);

        if ($response->failed()) {
            Log::error('Asaas: Failed to create subscription', [
                'customer_id' => $customerId,
                'response' => $response->json(),
            ]);
            $response->throw();
        }

        return $response->json();
    }

    /**
     * Get subscription details
     */
    public function getSubscription(string $externalId): array
    {
        $response = $this->http->get("/subscriptions/{$externalId}");
        $response->throw();
        return $response->json();
    }

    /**
     * Create a one-time payment (for credit packages, etc.)
     */
    public function createPayment(string $customerId, float $value, string $description, string $externalReference, string $billingType = 'UNDEFINED'): array
    {
        $response = $this->http->post('/payments', [
            'customer' => $customerId,
            'billingType' => $billingType,
            'value' => $value,
            'description' => $description,
            'externalReference' => $externalReference,
            'dueDate' => now()->addDays(3)->format('Y-m-d'),
        ]);

        if ($response->failed()) {
            Log::error('Asaas: Failed to create payment', [
                'customer_id' => $customerId,
                'value' => $value,
                'response' => $response->json(),
            ]);
            $response->throw();
        }

        return $response->json();
    }

    /**
     * Cancel a subscription
     */
    public function cancelSubscription(string $externalId): array
    {
        $response = $this->http->delete("/subscriptions/{$externalId}");
        $response->throw();
        return $response->json();
    }

    /**
     * Suspend a subscription (set to INACTIVE)
     */
    public function suspendSubscription(string $externalId): array
    {
        $response = $this->http->post("/subscriptions/{$externalId}", [
            'status' => 'INACTIVE',
        ]);
        $response->throw();
        return $response->json();
    }

    /**
     * Resume a subscription (set to ACTIVE)
     */
    public function resumeSubscription(string $externalId, ?string $nextDueDate = null): array
    {
        $data = ['status' => 'ACTIVE'];
        if ($nextDueDate) {
            $data['nextDueDate'] = $nextDueDate;
        }

        $response = $this->http->post("/subscriptions/{$externalId}", $data);
        $response->throw();
        return $response->json();
    }

    /**
     * List payments for a subscription
     */
    public function listPayments(string $subscriptionId): array
    {
        $response = $this->http->get("/subscriptions/{$subscriptionId}/payments");
        $response->throw();
        return $response->json();
    }

    /**
     * Get payment details
     */
    public function getPayment(string $paymentId): array
    {
        $response = $this->http->get("/payments/{$paymentId}");
        $response->throw();
        return $response->json();
    }

    /**
     * Get payment status
     */
    public function getPaymentStatus(string $paymentId): array
    {
        $response = $this->http->get("/payments/{$paymentId}/status");
        $response->throw();
        return $response->json();
    }

    /**
     * Get PIX QR Code for a payment
     */
    public function getPixQrCode(string $paymentId): array
    {
        $response = $this->http->get("/payments/{$paymentId}/pixQrCode");
        $response->throw();
        return $response->json();
    }

    /**
     * Get boleto/invoice identification field (URL)
     */
    public function getInvoiceUrl(string $paymentId): array
    {
        $response = $this->http->get("/payments/{$paymentId}/identificationField");
        $response->throw();
        return $response->json();
    }
}
