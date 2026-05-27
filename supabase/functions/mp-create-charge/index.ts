import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/mp-webhook`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensalidade_id, billing_type } = await req.json();
    // billing_type: "pix" | "boleto"

    if (!mensalidade_id) {
      return new Response(JSON.stringify({ error: "mensalidade_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Buscar mensalidade + aluno
    const { data: mens, error: mensErr } = await supabase
      .from("mensalidades")
      .select(`
        id, valor, mes_referencia, status,
        payment_ext_id, payment_url, payment_pix_copia_cola, payment_method, payment_provider,
        alunos ( id, nome, email, cpf )
      `)
      .eq("id", mensalidade_id)
      .single();

    if (mensErr || !mens) {
      return new Response(JSON.stringify({ error: "Mensalidade não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se já tem pagamento ativo, retornar dados existentes
    if (mens.payment_ext_id) {
      return new Response(JSON.stringify({
        ok: true,
        payment_ext_id: mens.payment_ext_id,
        payment_url: mens.payment_url,
        payment_pix_copia_cola: mens.payment_pix_copia_cola,
        payment_method: mens.payment_method,
        already_exists: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aluno = mens.alunos as { id: string; nome: string; email: string | null; cpf: string | null };
    const method = billing_type || "pix";

    if (method === "boleto" && !aluno.cpf) {
      return new Response(JSON.stringify({ error: "CPF do aluno é obrigatório para gerar boleto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Data de expiração: 3 dias para PIX, 3 dias para boleto
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 3);

    // Montar payload MP
    const payerEmail = aluno.email || `aluno-${aluno.id}@cmmf.com.br`;
    const cleanCpf = aluno.cpf?.replace(/\D/g, "") || null;

    const payload: Record<string, unknown> = {
      transaction_amount: Number(mens.valor),
      description: `Mensalidade CMMF — ${mens.mes_referencia} — ${aluno.nome}`,
      payment_method_id: method === "boleto" ? "bolbradesco" : "pix",
      external_reference: mens.id,
      notification_url: WEBHOOK_URL,
      payer: {
        email: payerEmail,
        first_name: aluno.nome.split(" ")[0],
        last_name: aluno.nome.split(" ").slice(1).join(" ") || aluno.nome.split(" ")[0],
        ...(method === "boleto" && cleanCpf
          ? { identification: { type: "CPF", number: cleanCpf } }
          : {}),
      },
    };

    if (method === "pix") {
      payload.date_of_expiration = expiration.toISOString();
    }

    // Criar pagamento no MP
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": mens.id,
      },
      body: JSON.stringify(payload),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Erro ao criar pagamento no Mercado Pago", detail: mpData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extrair campos relevantes
    const paymentExtId = String(mpData.id);
    const paymentPix = mpData.point_of_interaction?.transaction_data?.qr_code ?? null;
    const paymentUrl =
      mpData.point_of_interaction?.transaction_data?.ticket_url ||
      mpData.transaction_details?.external_resource_url ||
      null;

    // Salvar no banco
    const { error: updateErr } = await supabase
      .from("mensalidades")
      .update({
        payment_ext_id: paymentExtId,
        payment_url: paymentUrl,
        payment_pix_copia_cola: paymentPix,
        payment_method: method,
        payment_provider: "mp",
        payment_created_at: new Date().toISOString(),
      })
      .eq("id", mens.id);

    if (updateErr) {
      console.error("DB update error:", updateErr);
      // Não falhar — pagamento criado, só não salvou
    }

    return new Response(JSON.stringify({
      ok: true,
      payment_ext_id: paymentExtId,
      payment_url: paymentUrl,
      payment_pix_copia_cola: paymentPix,
      payment_method: method,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
