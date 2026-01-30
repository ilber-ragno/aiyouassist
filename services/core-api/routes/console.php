<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// =========================================================================
// Scheduled Tasks
// =========================================================================

// Send invoice payment reminders daily at 09:00 (10, 5, 2, 0 days before due)
Schedule::command('invoices:send-reminders')->dailyAt('09:00');

// Replenish plan credits for renewed subscriptions daily at 00:30
Schedule::command('credits:replenish-plans')->dailyAt('00:30');
