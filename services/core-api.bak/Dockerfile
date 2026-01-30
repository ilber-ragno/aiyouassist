# =============================================================================
# AIYOU ASSIST - Core API (Laravel)
# =============================================================================
FROM php:8.3-fpm-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    postgresql-dev \
    icu-dev \
    linux-headers \
    $PHPIZE_DEPS

# Install PHP extensions
RUN docker-php-ext-install \
    pdo \
    pdo_pgsql \
    pgsql \
    bcmath \
    intl \
    opcache

# Install Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Configure PHP
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY docker/php.ini "$PHP_INI_DIR/conf.d/custom.ini"

WORKDIR /app

# =============================================================================
# Development stage
# =============================================================================
FROM base AS development

RUN apk add --no-cache nodejs npm

COPY . .
RUN composer install --no-interaction --prefer-dist

EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]

# =============================================================================
# Production stage
# =============================================================================
FROM base AS production

# Copy application
COPY --chown=www-data:www-data . .

# Install dependencies (no dev)
RUN composer install --no-interaction --prefer-dist --no-dev --optimize-autoloader

# Cache configuration
RUN php artisan config:cache && \
    php artisan route:cache && \
    php artisan view:cache

# Set permissions
RUN chown -R www-data:www-data /app/storage /app/bootstrap/cache

USER www-data

EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
