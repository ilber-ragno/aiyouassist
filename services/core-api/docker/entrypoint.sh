#!/bin/sh
set -e

# Cache config at runtime so env vars are resolved correctly
php artisan config:cache 2>/dev/null || true

exec "$@"
