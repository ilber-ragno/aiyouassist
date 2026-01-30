#!/bin/bash
# =============================================================================
# AIYOU ASSIST - Setup Script
# =============================================================================
set -e

echo "🚀 AiYou Assist - Setup"
echo "========================"

# Check if .env exists
if [ -f ".env" ]; then
    echo "⚠️  .env already exists. Skipping generation."
    echo "   Delete it manually if you want to regenerate."
else
    echo "📝 Generating .env from .env.example..."
    cp .env.example .env

    # Generate secure keys
    echo "🔐 Generating secure keys..."

    # Laravel APP_KEY
    APP_KEY=$(openssl rand -base64 32)
    sed -i "s|APP_KEY=base64:GENERATE_WITH_php_artisan_key:generate|APP_KEY=base64:${APP_KEY}|g" .env

    # Database password
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    sed -i "s|DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD_HERE|DB_PASSWORD=${DB_PASSWORD}|g" .env

    # Redis password
    REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    sed -i "s|REDIS_PASSWORD=CHANGE_ME_STRONG_PASSWORD_HERE|REDIS_PASSWORD=${REDIS_PASSWORD}|g" .env

    # RabbitMQ password
    RABBITMQ_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    sed -i "s|RABBITMQ_PASSWORD=CHANGE_ME_STRONG_PASSWORD_HERE|RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD}|g" .env

    # JWT Secret
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    sed -i "s|JWT_SECRET=CHANGE_ME_GENERATE_SECURE_KEY|JWT_SECRET=${JWT_SECRET}|g" .env

    # Session encryption key
    SESSION_KEY=$(openssl rand -base64 32)
    sed -i "s|SESSION_ENCRYPTION_KEY=CHANGE_ME_GENERATE_SECURE_KEY|SESSION_ENCRYPTION_KEY=${SESSION_KEY}|g" .env

    # Credential encryption key
    CREDENTIAL_KEY=$(openssl rand -base64 32)
    sed -i "s|CREDENTIAL_ENCRYPTION_KEY=CHANGE_ME_GENERATE_SECURE_KEY|CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_KEY}|g" .env

    # Grafana password
    GRAFANA_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-16)
    sed -i "s|GRAFANA_PASSWORD=CHANGE_ME_STRONG_PASSWORD_HERE|GRAFANA_PASSWORD=${GRAFANA_PASSWORD}|g" .env

    echo "✅ .env generated with secure random keys"
    echo ""
    echo "⚠️  IMPORTANT: You still need to configure:"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
    echo "   - ASAAS_API_KEY / ASAAS_WEBHOOK_SECRET"
    echo ""
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p infra/grafana/provisioning/datasources
mkdir -p infra/grafana/provisioning/dashboards

# Create Grafana datasources
cat > infra/grafana/provisioning/datasources/datasources.yaml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
EOF

echo "✅ Grafana datasources configured"

# Check Docker
echo "🐳 Checking Docker..."
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo "✅ Docker and Docker Compose are installed"
else
    echo "❌ Docker or Docker Compose not found"
    exit 1
fi

echo ""
echo "========================"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your API keys (ANTHROPIC_API_KEY, STRIPE, ASAAS)"
echo "2. Generate SSL certificates (see scripts/ssl-setup.sh)"
echo "3. Run: docker compose up -d"
echo ""
