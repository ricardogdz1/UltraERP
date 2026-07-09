// UltraERP — Edge Function: webhook do Asaas
// Único caminho que muda o status de `assinaturas` (especificação, seções
// 7.3 e 13.1): o gateway confirma o pagamento e esta função, rodando com
// service_role (ignora RLS), atualiza a fonte de verdade. O cliente nunca
// escreve nessa tabela.
//
// Configuração necessária (uma vez, no dashboard):
//   1. Secret ASAAS_WEBHOOK_TOKEN (Edge Functions -> Secrets) com o mesmo
//      valor configurado no campo "Token de autenticação" do webhook no
//      painel do Asaas.
//   2. No Asaas, apontar o webhook de cobranças para:
//      https://ofgmniqzqrmetxlbznfe.supabase.co/functions/v1/asaas-webhook
//   3. Ao criar a assinatura/cobrança no Asaas, preencher externalReference
//      com o UUID da loja (lojas.id) — é assim que o evento volta para cá.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Um mês de acesso a partir do vencimento pago (ciclo mensal, Fase 1).
function umMesApos(dataBase: Date): Date {
  const d = new Date(dataBase);
  d.setMonth(d.getMonth() + 1);
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Autenticação do webhook: o Asaas envia o token configurado no painel
  // no header `asaas-access-token`. Sem match exato, rejeita.
  const tokenEsperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const tokenRecebido = req.headers.get("asaas-access-token");
  if (!tokenEsperado || !tokenRecebido || tokenRecebido !== tokenEsperado) {
    return new Response("unauthorized", { status: 401 });
  }

  let evento: { event?: string; payment?: Record<string, unknown> };
  try {
    evento = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const tipo = evento.event ?? "";
  const payment = evento.payment ?? {};
  const lojaId = payment.externalReference as string | undefined;

  // Eventos sem loja vinculada não têm o que atualizar; responde 200 para o
  // Asaas não reenviar eternamente.
  if (!lojaId) {
    return Response.json({ ok: true, ignored: "sem externalReference" });
  }

  let campos: Record<string, unknown> | null = null;

  switch (tipo) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      // Acesso liberado por um mês a partir do vencimento da cobrança paga
      // (ou de agora, se o webhook chegar depois do vencimento).
      const dueDate = payment.dueDate
        ? new Date(payment.dueDate as string)
        : new Date();
      const base = dueDate > new Date() ? dueDate : new Date();
      campos = {
        status: "ativa",
        pago_ate: umMesApos(base).toISOString(),
      };
      break;
    }
    case "PAYMENT_OVERDUE":
      // Informativo: quem decide bloqueio/tolerância é subscription_status()
      // com base em pago_ate — aqui só refletimos o estado do gateway.
      campos = { status: "inadimplente" };
      break;
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      // Estorno/chargeback (ameaça #8 do threat model): revoga o período
      // pago imediatamente; o bloqueio progressivo cuida do resto.
      campos = { status: "inadimplente", pago_ate: new Date().toISOString() };
      break;
    default:
      return Response.json({ ok: true, ignored: tipo });
  }

  const { error } = await supabase
    .from("assinaturas")
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq("loja_id", lojaId);

  if (error) {
    console.error("asaas-webhook: falha ao atualizar assinatura", error);
    return new Response("db error", { status: 500 });
  }

  return Response.json({ ok: true, event: tipo, loja_id: lojaId });
});
