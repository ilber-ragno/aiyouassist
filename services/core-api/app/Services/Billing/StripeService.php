<?php

namespace App\Services\Billing;

use App\Models\Tenant;
use Illuminate\Support\Facades\Log;

class StripeService
{
    public function __construct()
    {
        \Stripe\Stripe::setApiKey(config('services.stripe.secret'));
    }

    /**
     * Create a Stripe customer
     */
    public function createCustomer(Tenant $tenant): \Stripe\Customer
    {
        try {
            return \Stripe\Customer::create([
                'name' => $tenant->name,
                'email' => $tenant->users()->first()?->email,
                'metadata' => [
                    'tenant_id' => $tenant->id,
                ],
            ]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            Log::error('Stripe: Failed to create customer', [
                'tenant_id' => $tenant->id,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Create a subscription
     */
    public function createSubscription(string $customerId, string $priceId): \Stripe\Subscription
    {
        try {
            return \Stripe\Subscription::create([
                'customer' => $customerId,
                'items' => [['price' => $priceId]],
                'payment_behavior' => 'default_incomplete',
                'expand' => ['latest_invoice.payment_intent'],
            ]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            Log::error('Stripe: Failed to create subscription', [
                'customer_id' => $customerId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Cancel a subscription
     */
    public function cancelSubscription(string $externalId): \Stripe\Subscription
    {
        try {
            $subscription = \Stripe\Subscription::retrieve($externalId);
            return $subscription->cancel();
        } catch (\Stripe\Exception\ApiErrorException $e) {
            Log::error('Stripe: Failed to cancel subscription', [
                'external_id' => $externalId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Get subscription details
     */
    public function getSubscription(string $externalId): \Stripe\Subscription
    {
        return \Stripe\Subscription::retrieve($externalId);
    }

    /**
     * List invoices for a customer
     */
    public function listInvoices(string $customerId, int $limit = 20): \Stripe\Collection
    {
        return \Stripe\Invoice::all([
            'customer' => $customerId,
            'limit' => $limit,
        ]);
    }

    /**
     * Get invoice details
     */
    public function getInvoice(string $invoiceId): \Stripe\Invoice
    {
        return \Stripe\Invoice::retrieve($invoiceId);
    }
}
