<?php

namespace App\Notifications;

use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InvoiceReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        protected Invoice $invoice,
        protected string $reminderType
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $amount = 'R$ ' . number_format((float) $this->invoice->amount, 2, ',', '.');
        $dueDate = $this->invoice->due_date?->format('d/m/Y') ?? 'N/A';
        $tenantName = $this->invoice->subscription?->tenant?->name ?? 'Cliente';

        $subject = match ($this->reminderType) {
            '10_days' => "Lembrete: Fatura {$amount} vence em 10 dias",
            '5_days' => "Lembrete: Fatura {$amount} vence em 5 dias",
            '2_days' => "Urgente: Fatura {$amount} vence em 2 dias",
            'due_today' => "HOJE: Fatura {$amount} vence hoje!",
            default => "Lembrete de fatura: {$amount}",
        };

        $greeting = match ($this->reminderType) {
            'due_today' => 'Sua fatura vence HOJE!',
            '2_days' => 'Sua fatura vence em 2 dias!',
            '5_days' => 'Sua fatura vence em 5 dias.',
            '10_days' => 'Sua fatura vence em 10 dias.',
            default => 'Lembrete de pagamento.',
        };

        $mail = (new MailMessage)
            ->subject($subject)
            ->greeting("Olá, {$tenantName}!")
            ->line($greeting)
            ->line("**Valor:** {$amount}")
            ->line("**Vencimento:** {$dueDate}");

        if ($this->invoice->invoice_url) {
            $mail->action('Pagar Agora', $this->invoice->invoice_url);
        }

        if ($this->reminderType === 'due_today') {
            $mail->line('Evite o bloqueio do seu acesso realizando o pagamento hoje.');
        }

        $mail->line('Caso já tenha realizado o pagamento, desconsidere este email.')
             ->salutation('Equipe AiYou Assist');

        return $mail;
    }
}
