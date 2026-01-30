#!/bin/bash
# =============================================================================
# AIYOU ASSIST - SSL Certificate Setup with Let's Encrypt
# =============================================================================
set -e

DOMAIN=${1:-"meuaiyou.cloud"}
EMAIL=${2:-"admin@${DOMAIN}"}

echo "🔐 AiYou Assist - SSL Setup"
echo "==========================="
echo "Domain: ${DOMAIN}"
echo "Email: ${EMAIL}"
echo ""

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing Certbot..."
    apt-get update
    apt-get install -y certbot
fi

# Create webroot directory
mkdir -p /var/www/certbot

# Stop nginx if running
docker compose stop nginx 2>/dev/null || true

# Generate certificates
echo "🔐 Generating SSL certificates..."
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}" \
    -d "app.${DOMAIN}" \
    -d "metrics.${DOMAIN}"

# Copy certificates to nginx volume
echo "📋 Copying certificates..."
mkdir -p ./certs
cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ./certs/
cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ./certs/

# Update docker-compose to mount certs
echo ""
echo "✅ SSL certificates generated!"
echo ""
echo "Certificates location:"
echo "  - ./certs/fullchain.pem"
echo "  - ./certs/privkey.pem"
echo ""
echo "The certificates will be automatically mounted to nginx container."
echo ""
echo "To renew certificates, run:"
echo "  certbot renew --pre-hook 'docker compose stop nginx' --post-hook 'docker compose start nginx'"
echo ""
echo "Add this to crontab for auto-renewal:"
echo "  0 0 1 * * cd /root/aiyou-assist && certbot renew --quiet"
echo ""
