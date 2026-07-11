// UltraERP — Edge Function: webhook da Focus NFe
// A Focus processa a NFC-e de forma assíncrona e chama esta URL quando o
// status muda (autorizado/erro/cancelado). Atualizamos a nota pela `ref`.
//
// Configuração: no painel da Focus, aponte o webhook para
//   https://ofgmniqzqrmetxlbznfe.supabase.co/functions/v1/fiscal-webhook?segredo=SEU_SEGREDO
// e defina o secret FISCAL_WEBHOOK_SECRET com o mesmo valor.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Autenticação simples do webhook por segredo compartilhado.
  const esperado = Deno.env.get("FISCAL_WEBHOOK_SECRET");
  const recebido = new URL(req.url).searchParams.get("segredo");
  if (!esperado || recebido !== esperado) {
    return new Response("unauthorized", { status: 401 });
  }

  let evento: Record<string, unknown>;
  try { evento = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  const ref = String(evento.ref ?? "");
  if (!ref) return Response.json({ ok: true, ignored: "sem ref" });

  const st = String(evento.status ?? "");
  let status = "processando";
  if (st === "autorizado") status = "autorizada";
  else if (st === "cancelado") status = "cancelada";
  else if (st.startsWith("erro") || st === "denegado") status = "rejeitada";

  const { error } = await admin.from("notas_fiscais").update({
    status,
    numero: evento.numero ?? null,
    chave_acesso: evento.chave_nfe ?? evento.chave ?? null,
    protocolo: evento.protocolo ?? null,
    caminho_xml: evento.caminho_xml_nota_fiscal ?? null,
    caminho_danfe: evento.caminho_danfe ?? null,
    motivo: (evento.mensagem_sefaz as string) ?? (evento.mensagem as string) ?? "",
    atualizado_em: new Date().toISOString(),
  }).eq("ref", ref);

  if (error) {
    console.error("fiscal-webhook: falha ao atualizar nota", error);
    return new Response("db error", { status: 500 });
  }
  return Response.json({ ok: true, ref, status });
});
