// UltraERP — Edge Function: emissão de NFC-e via Focus NFe
// Roda no servidor (service_role): o token da Focus NUNCA vai para o app.
// Fluxo: identifica a loja do usuário -> carrega config fiscal -> monta o
// payload da NFC-e a partir da venda -> envia à Focus -> registra a nota.
// A Focus processa de forma assíncrona e confirma pela fiscal-webhook.
//
// Enquanto não houver token configurado, responde 'não configurado' — assim
// a estrutura já roda de ponta a ponta, faltando só plugar as credenciais.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function erro(msg: string, status = 200) {
  return Response.json({ ok: false, error: msg }, { status });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return erro("Método não permitido.", 405);

  // 1. Usuário autenticado (JWT no header) -> loja
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return erro("Sessão inválida. Entre novamente.", 401);

  const { data: usuario } = await admin
    .from("usuarios").select("id, loja_id").eq("auth_id", user.id).maybeSingle();
  if (!usuario) return erro("Usuário sem loja vinculada.", 403);
  const lojaId = usuario.loja_id;

  let body: { venda_id?: string };
  try { body = await req.json(); } catch { return erro("Requisição inválida."); }
  if (!body.venda_id) return erro("Venda não informada.");

  // 2. Config fiscal da loja
  const { data: cfg } = await admin
    .from("configuracao_fiscal").select("*").eq("loja_id", lojaId).maybeSingle();

  // 3. Venda (necessária para vincular a nota)
  const { data: venda } = await admin
    .from("vendas").select("*").eq("id", body.venda_id).eq("loja_id", lojaId).maybeSingle();
  if (!venda) return erro("Venda não encontrada.");

  const ref = `venda-${venda.id}`;

  // ── MODO SIMULAÇÃO ────────────────────────────────────────────────────────
  // Gera uma NFC-e "autorizada" fictícia (SEM valor fiscal), sem token/CNPJ/
  // certificado. Serve para testar todo o fluxo antes de ter a empresa.
  if (cfg?.modo_simulacao) {
    const numero = Math.floor(100000 + Math.random() * 899999);
    let chave = "";
    for (let i = 0; i < 44; i++) chave += Math.floor(Math.random() * 10);
    await admin.from("notas_fiscais").upsert({
      loja_id: lojaId, venda_id: venda.id, modelo: "65", ambiente: "homologacao",
      ref, status: "autorizada", serie: cfg.serie_nfce ?? 1, numero,
      chave_acesso: chave, protocolo: "SIMULACAO",
      motivo: "SIMULAÇÃO — sem valor fiscal",
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "ref" });
    return Response.json({ ok: true, status: "autorizada", ref, simulacao: true,
      motivo: "SIMULAÇÃO — sem valor fiscal", numero, chave_acesso: chave });
  }

  if (!cfg || !cfg.focus_token) {
    return erro("Emissão fiscal ainda não configurada. Ative o modo simulação para testar, ou preencha o token da Focus em Configurações.");
  }

  const { data: itens } = await admin
    .from("venda_itens")
    .select("descricao, quantidade, preco_unit, subtotal, produtos(ncm)")
    .eq("venda_id", venda.id);
  if (!itens || itens.length === 0) return erro("Venda sem itens.");

  const { data: loja } = await admin
    .from("lojas").select("cnpj, razao_social, nome_fantasia, uf").eq("id", lojaId).maybeSingle();

  // Validação prévia: NCM obrigatório para emitir (evita rejeição na SEFAZ)
  const semNcm = itens.find((i) => !(i.produtos?.ncm));
  if (semNcm) {
    return erro(`O produto "${semNcm.descricao}" está sem NCM. Preencha o NCM no cadastro do produto antes de emitir a nota.`);
  }

  // 4. Monta o payload da NFC-e (padrão Simples Nacional — CRT=1)
  const formaMap: Record<string, string> = {
    dinheiro: "01", credito: "03", debito: "04", pix: "17",
  };
  const payload = {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    cnpj_emitente: loja?.cnpj,
    // dados fiscais do emitente vêm da config
    regime_tributario: cfg.regime_tributario,
    inscricao_estadual: cfg.inscricao_estadual,
    items: itens.map((i, idx) => ({
      numero_item: idx + 1,
      codigo_produto: String(idx + 1),
      descricao: i.descricao,
      cfop: "5102",
      unidade_comercial: "UN",
      quantidade_comercial: Number(i.quantidade),
      valor_unitario_comercial: Number(i.preco_unit),
      valor_bruto: Number(i.subtotal),
      codigo_ncm: i.produtos!.ncm,
      icms_origem: 0,
      icms_situacao_tributaria: "102", // CSOSN 102 (Simples, sem crédito)
    })),
    formas_pagamento: [
      { forma_pagamento: formaMap[venda.forma_pagamento] ?? "99",
        valor_pagamento: Number(venda.total) },
    ],
  };

  // 5. Envia à Focus (async).
  const base = cfg.ambiente === "producao"
    ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
  const auth = "Basic " + btoa(cfg.focus_token + ":");

  let focusStatus = "processando";
  let motivo = "";
  try {
    const resp = await fetch(`${base}/v2/nfce?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    // Focus: 'processando_autorizacao' | 'autorizado' | 'erro_autorizacao' ...
    const st = String(data.status ?? "");
    if (st === "autorizado") focusStatus = "autorizada";
    else if (st.startsWith("erro") || st === "denegado") { focusStatus = "rejeitada"; motivo = data.mensagem_sefaz || data.mensagem || "Rejeitada pela SEFAZ."; }
    else focusStatus = "processando";
  } catch (_e) {
    focusStatus = "erro";
    motivo = "Não foi possível falar com o emissor fiscal. Tente novamente.";
  }

  // 6. Registra a nota (upsert por ref)
  await admin.from("notas_fiscais").upsert({
    loja_id: lojaId, venda_id: venda.id, modelo: "65",
    ambiente: cfg.ambiente, ref, status: focusStatus, serie: cfg.serie_nfce,
    motivo, atualizado_em: new Date().toISOString(),
  }, { onConflict: "ref" });

  return Response.json({ ok: true, status: focusStatus, ref, motivo });
});
