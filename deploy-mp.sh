#!/bin/bash
# deploy-mp.sh — Deploy integração Mercado Pago
# Executa: migration V52 + secrets + Edge Functions

set -e

DB_URL="postgresql://postgres:CMMF2019CMM%21@db.oykrtlkksqekvjiiqafy.supabase.co:5432/postgres"
PROJECT_REF="oykrtlkksqekvjiiqafy"
MP_TOKEN="APP_USR-4965417377466214-032413-9f1e8009f28a875419501956c357a249-246774919"
WEBHOOK_SECRET=$(openssl rand -hex 16)

echo "====================================="
echo " Deploy: Integração Mercado Pago"
echo "====================================="

# 1. Aplicar migration V52
echo ""
echo "[1/4] Aplicando migration V52 (colunas payment_)..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="${SCRIPT_DIR}/../agenteCMMF1/supabase/migration-v52-mercadopago.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "ERRO: Arquivo de migration não encontrado em $MIGRATION_FILE"
  exit 1
fi

psql "$DB_URL" -f "$MIGRATION_FILE" > /tmp/v52-log.txt 2>&1
tail -5 /tmp/v52-log.txt
echo "✓ Migration V52 aplicada"

# 2. Verificar Supabase CLI
echo ""
echo "[2/4] Verificando Supabase CLI..."
SUPA_CMD="npx --yes supabase"
$SUPA_CMD --version 2>/dev/null || (echo "ERRO: não foi possível usar npx supabase"; exit 1)
echo "✓ Supabase CLI OK"

# 3. Configurar secrets
echo ""
echo "[3/4] Configurando secrets no Supabase..."
cd "$(dirname "${BASH_SOURCE[0]}")"

# Link projeto (requer 'npx supabase login' ter sido executado antes)
$SUPA_CMD link --project-ref "$PROJECT_REF" 2>/dev/null || true

# Definir secrets
$SUPA_CMD secrets set MP_ACCESS_TOKEN="$MP_TOKEN" MP_WEBHOOK_SECRET="$WEBHOOK_SECRET"
echo "✓ Secrets configurados"
echo ""
echo "  MP_ACCESS_TOKEN: ${MP_TOKEN:0:20}..."
echo "  MP_WEBHOOK_SECRET: $WEBHOOK_SECRET"
echo ""
echo "  ⚠️  ANOTE o WEBHOOK_SECRET acima — configure no painel MP se quiser validação!"

# 4. Deploy Edge Functions
echo ""
echo "[4/4] Deploying Edge Functions..."
$SUPA_CMD functions deploy mp-create-charge --no-verify-jwt
echo "✓ mp-create-charge deployada"

$SUPA_CMD functions deploy mp-webhook --no-verify-jwt
echo "✓ mp-webhook deployada"

# Resultado
echo ""
echo "====================================="
echo " ✅ Deploy concluído!"
echo "====================================="
echo ""
echo "Webhook URL (para configurar no Mercado Pago):"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/mp-webhook"
echo ""
echo "Se quiser validação por token:"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/mp-webhook?token=${WEBHOOK_SECRET}"
echo ""
echo "Configure no painel MP em:"
echo "  https://www.mercadopago.com.br/developers/panel/app"
echo "  → Notificações IPN → eventos: Pagamentos"
echo ""
