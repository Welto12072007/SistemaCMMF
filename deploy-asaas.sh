#!/usr/bin/env bash
# =============================================================
# Deploy integração Asaas — CMMF
# Executar: bash deploy-asaas.sh
# =============================================================
set -e

SUPABASE_PROJECT="oykrtlkksqekvjiiqafy"
DB_URL="postgresql://postgres:CMMF2019CMM%21@db.oykrtlkksqekvjiiqafy.supabase.co:5432/postgres"

# ----- 1. Aplicar migration V52 -----
echo ""
echo "==> Aplicando migration V53 (colunas Asaas)..."
psql "$DB_URL" -f ../agenteCMMF1/supabase/migration-v53-asaas.sql > /tmp/v53.log 2>&1
tail -5 /tmp/v53.log
echo "Migration OK"

# ----- 2. Verificar Supabase CLI -----
echo ""
echo "==> Verificando Supabase CLI..."
if ! command -v supabase &>/dev/null; then
  echo "Instalando Supabase CLI via npm..."
  npm install -g supabase
fi
supabase --version

# ----- 3. Login + link -----
echo ""
echo "==> Fazendo login no Supabase (abrirá browser)..."
supabase login

echo ""
echo "==> Linkando projeto $SUPABASE_PROJECT..."
supabase link --project-ref "$SUPABASE_PROJECT"

# ----- 4. Configurar secrets -----
echo ""
echo "==> Configure os secrets abaixo. Você precisará da API Key do Asaas."
echo ""
echo "Obtenha sua API Key em: https://www.asaas.com/home (Minha Conta → Integrações → Chave de API)"
echo ""
read -rp "ASAAS_API_KEY (começa com $aas_): " ASAAS_API_KEY
read -rp "Usar sandbox? (s/n, enter=n): " USE_SANDBOX
ASAAS_SANDBOX="false"
[[ "$USE_SANDBOX" == "s" ]] && ASAAS_SANDBOX="true"

# Token opcional para segurança do webhook
ASAAS_WEBHOOK_TOKEN=$(openssl rand -hex 16)
echo ""
echo "Token do webhook gerado: $ASAAS_WEBHOOK_TOKEN"
echo "(Salve esse valor — será necessário no painel Asaas)"
echo ""

supabase secrets set \
  ASAAS_API_KEY="$ASAAS_API_KEY" \
  ASAAS_SANDBOX="$ASAAS_SANDBOX" \
  ASAAS_WEBHOOK_TOKEN="$ASAAS_WEBHOOK_TOKEN"

echo "Secrets configurados"

# ----- 5. Deploy Edge Functions -----
echo ""
echo "==> Deploy asaas-create-charge..."
supabase functions deploy asaas-create-charge --no-verify-jwt

echo ""
echo "==> Deploy asaas-webhook (sem JWT — chamado pelo Asaas)..."
supabase functions deploy asaas-webhook --no-verify-jwt

# ----- 6. URLs finais -----
WEBHOOK_URL="https://${SUPABASE_PROJECT}.supabase.co/functions/v1/asaas-webhook"

echo ""
echo "============================================================"
echo " DEPLOY CONCLUÍDO!"
echo "============================================================"
echo ""
echo "URL do webhook Asaas:"
echo "  $WEBHOOK_URL"
echo ""
echo "Token do webhook: $ASAAS_WEBHOOK_TOKEN"
echo ""
echo "Próximos passos no painel Asaas:"
echo "  1. Acesse https://www.asaas.com/config/webhooks"
echo "  2. Adicione novo webhook com a URL acima"
echo "  3. Marque os eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_REFUNDED"
echo "  4. No campo 'Token de acesso', cole: $ASAAS_WEBHOOK_TOKEN"
echo ""
echo "Tudo pronto! Abra o sistema e teste em Mensalidades → botão 'Cobrar'."
