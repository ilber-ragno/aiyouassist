<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Notifications\InvoiceReminderNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SendInvoiceReminders extends Command
{
    protected $signature = 'invoices:send-reminders';
    protected $description = 'Send invoice payment reminders at 10, 5, 2 days before and on due date';

    private const THRESHOLDS = [
        '10_days' => 10,
        '5_days' => 5,
        '2_days' => 2,
        'due_today' => 0,
    ];

    public function handle(): int
    {
        $this->info('Checking pending invoices for reminders...');

        $invoices = Invoice::withoutGlobalScope('tenant')
            ->where('status', 'pending')
            ->whereNotNull('due_date')
            ->with(['subscription.tenant.users'])
            ->get();

        $sent = 0;

        foreach ($invoices as $invoice) {
            $daysUntilDue = $invoice->daysUntilDue();

            if ($daysUntilDue === null) {
                continue;
            }

            foreach (self::THRESHOLDS as $key => $threshold) {
                if ($daysUntilDue <= $threshold && !$invoice->hasReminderBeenSent($key)) {
                    $tenant = $invoice->subscription?->tenant;
                    if (!$tenant) {
                        continue;
                    }

                    // Find the tenant owner (first user)
                    $owner = $tenant->users()->first();
                    if (!$owner) {
                        continue;
                    }

                    try {
                        $owner->notify(new InvoiceReminderNotification($invoice, $key));
                        $invoice->markReminderSent($key);
                        $sent++;

                        $this->info("  Sent {$key} reminder to {$owner->email} for invoice {$invoice->id}");
                    } catch (\Exception $e) {
                        Log::error("Failed to send invoice reminder", [
                            'invoice_id' => $invoice->id,
                            'type' => $key,
                            'error' => $e->getMessage(),
                        ]);
                        $this->error("  Failed: {$invoice->id} ({$key}) - {$e->getMessage()}");
                    }

                    // Only send the most urgent reminder (don't stack)
                    break;
                }
            }
        }

        $this->info("Done. Sent {$sent} reminders.");
        return Command::SUCCESS;
    }
}
