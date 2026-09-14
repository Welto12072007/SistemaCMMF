import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET"); // opcional, para validar

serve(async (req) => {
  // MP às vezes faz GET para validar o endpoint
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Validação opcional com token na query string
  if (WEBHOOK_SECRET) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const body = await req.json();
    console.log("MP webhook received:", JSON.stringify(body));

    // MP envia: { action: "payment.updated", data: { id: "123456789" } }
    const action = body.action as string | undefined;
    const paymentId = body.data?.id ? String(body.data.id) : null;

    if (!paymentId || !action?.startsWith("payment")) {
      // Outros eventos (subscriptions, etc.) — ignorar
      return new Response("OK", { status: 200 });
    }

    // Buscar detalhes do pagamento no MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error("MP lookup failed for payment", paymentId);
      return new Response("OK", { status: 200 }); // 200 para MP não retentar
    }

    const payment = await mpRes.json();
    const status = payment.status as string; // approved, pending, rejected, refunded, charged_back, cancelled
    const externalRef = payment.external_reference as string | null; // = mensalidade.id

    if (!externalRef) {
      console.log("No external_reference in payment", paymentId);
      return new Response("OK", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (status === "approved") {
      // Marcar mensalidade como paga
      const { error } = await supabase
        .from("mensalidades")
        .update({
          status: "pago",
          data_pagamento: new Date().toISOString().split("T")[0],
          valor_pago: payment.transaction_amount,
          metodo_pagamento: payment.payment_method_id === "pix" ? "pix" : "boleto",
        })
        .eq("id", externalRef)
        .eq("status", "pendente"); // só atualiza se ainda pendente (evitar sobrescrever)

      if (error) console.error("DB update error (approved):", error);
      else console.log("Mensalidade marcada paga:", externalRef);

    } else if (["refunded", "charged_back"].includes(status)) {
      // Estornar: voltar para pendente
      const { error } = await supabase
        .from("mensalidades")
        .update({ status: "pendente", data_pagamento: null, valor_pago: null })
        .eq("id", externalRef)
        .eq("status", "pago");

      if (error) console.error("DB update error (refund):", error);
      else console.log("Mensalidade revertida para pendente:", externalRef);

    } else {
      console.log(`Status ${status} para mensalidade ${externalRef} — sem ação`);
    }

    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("Webhook error:", err);
    // Sempre retornar 200 para MP não retentar indefinidamente
    return new Response("OK", { status: 200 });
  }
});
