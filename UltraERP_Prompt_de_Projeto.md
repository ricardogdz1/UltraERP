# UltraERP — Prompt Mestre de Especificação do Projeto

> **Como usar este documento:** este arquivo foi escrito para ser colado, na íntegra ou por seções, em uma ferramenta de IA de desenvolvimento (Claude Code, Cursor, etc.) ou entregue a uma equipe de desenvolvimento como briefing inicial. Ele consolida os requisitos que você passou, mais adições baseadas em ERPs de varejo consolidados no mercado brasileiro (Bling, Tiny, Omie, Varejo Fácil, Consinco, Linx), e uma seção específica de segurança para o modelo de assinatura, conforme solicitado.

---

## 1. Visão geral do produto

**Nome:** UltraERP
**Segmento:** ERP para lojistas de varejo (loja física, com potencial de expansão para omnichannel)
**Modelo de negócio:** SaaS por assinatura mensal, multi-usuário por loja, multi-loja por conta
**Plataformas:** Windows, Linux e macOS — aplicativo desktop único (não três builds separados)
**Diferenciais pretendidos:** interface simples para usuário leigo, validação de campos com correção guiada, conformidade fiscal nacional completa, leveza e velocidade, ajuda em vídeo embutida em cada tela

### Princípio de design central
> "Um lojista sem conhecimento contábil ou fiscal deve conseguir emitir uma nota, dar entrada em mercadoria e fechar o caixa sem precisar chamar suporte."

Todo requisito abaixo deve ser lido com esse princípio como critério de aceite.

---

## 2. Stack tecnológica recomendada

| Camada | Escolha recomendada | Justificativa |
|---|---|---|
| Linguagem principal | Python 3.12+ | Já definido pelo requisito |
| Interface desktop | **PyWebView** (usa o WebView nativo do SO — WebView2 no Windows, WebKitGTK no Linux, WKWebView no macOS) | Evita empacotar um Chromium inteiro (como Electron), resultando em app leve, atendendo ao requisito de performance |
| Front-end (dentro do WebView) | HTML/CSS/JS puro ou Vue 3 (build leve) + Tailwind CSS | SPA simples, moderna, com pouco overhead |
| Backend/API interna | FastAPI rodando localmente (loopback) dentro do próprio processo, ou chamadas diretas via `pywebview.api` | Organiza a lógica de negócio, facilita testes automatizados |
| ORM | SQLAlchemy 2.0 + Alembic (migrações) | Padrão robusto em Python |
| Banco de dados em nuvem | **PostgreSQL gerenciado** (Supabase, Neon ou AWS RDS) | Suporta Row Level Security (RLS) nativo — essencial para multi-tenant (multi-loja) seguro, além de JSON, full-text search e extensões fiscais |
| Armazenamento de arquivos (imagens, XML, certificados) | Object storage compatível S3 (Supabase Storage, Cloudflare R2 ou AWS S3) com criptografia em repouso | Mantém tudo fora da máquina local, conforme requisito 9 |
| Cache local leve | SQLite como cache/offline-buffer (nunca como fonte de verdade) | Permite abrir telas rapidamente e operar picos de latência de rede sem perder dados — sincroniza depois com a nuvem |
| Empacotamento multiplataforma | PyInstaller ou Briefcase, com auto-update (ex.: usando um serviço tipo Sparkle/electron-updater adaptado, ou checagem de versão via API própria) | Um único código-fonte, três instaladores |
| Emissão fiscal (NFe/NFCe/CTe/MDFe/NFSe) | API especializada terceirizada (ver seção 6) combinada com lógica própria de regras de negócio | Construir o comunicador direto com todas as SEFAZ estaduais do zero é inviável para o MVP — ver justificativa na seção 6 |
| Gateway de pagamento/assinatura | Asaas, Iugu ou Stripe (recorrência + PIX + boleto + cartão) | Cobrança recorrente nativa, webhooks de confirmação |

---

## 3. Módulos funcionais

Além dos módulos que você listou, incluí os que praticamente todo ERP de varejo consolidado no Brasil oferece — sem eles, o produto fica incompleto frente à concorrência.

### 3.1 Módulos que você pediu
- **Estoque** — cadastro de produtos, variações (cor/tamanho), código de barras (EAN/GTIN), lotes/validade, inventário, transferência entre lojas, kits/composição de produtos, estoque mínimo com alerta.
- **Fluxo de Caixa** — contas a pagar e a receber, previsão de caixa, conciliação bancária (OFX/Open Finance), múltiplas contas/caixas.
- **Financeiro** — boletos, PIX, cartões, DRE simplificado, centro de custos.
- **Comercial/Fiscal** — NF-e, NFC-e, NFS-e, CT-e, MDF-e (detalhado na seção 6).
- **Contábil** — plano de contas, lançamentos, exportação SPED Contábil/Fiscal para o contador do cliente.

### 3.2 Módulos adicionais recomendados (baseados em ERPs do nicho)
- **PDV (Ponto de Venda)** — é o coração de um ERP de varejo; sem uma tela de venda rápida (leitor de código de barras, múltiplas formas de pagamento, TEF/pinpad, emissão automática de NFC-e/cupom, sangria e suprimento de caixa), o produto não compete no mercado.
- **Compras e Fornecedores** — pedidos de compra, cotação, entrada de mercadoria via importação de XML de NF-e do fornecedor (evita redigitação).
- **CRM/Clientes** — histórico de compras, aniversariantes, segmentação, programa de fidelidade/pontos.
- **Comissão de vendedores** — apuração automática por venda/meta.
- **Trocas, devoluções e garantias** — fluxo próprio vinculado à nota de origem.
- **Multi-loja/Multi-filial** — visão consolidada e transferência de estoque entre unidades, cada loja como um "tenant" lógico.
- **Relatórios e BI** — dashboard inicial com KPIs (vendas do dia, ticket médio, curva ABC de produtos, ruptura de estoque), exportação para Excel/PDF.
- **Integrações e-commerce/marketplace** (fase 2) — Mercado Livre, Shopee, integração com loja virtual, para sincronizar estoque e pedidos.
- **RH leve** (fase 2/3) — cadastro de funcionários, comissões, controle básico de ponto — não é o foco do MVP, mas útil para reter clientes maiores.
- **Auditoria/Log de ações** — quem alterou o quê e quando, essencial para responsabilização e para investigar disputas de assinatura ou fiscais.
- **LGPD/Privacidade** — módulo de gestão de consentimento e exportação/exclusão de dados pessoais de clientes, obrigatório por lei.

---

## 4. UX e usabilidade para usuário leigo

- **Assistente de primeiro acesso (onboarding):** wizard guiado para cadastrar a empresa, importar produtos, configurar certificado digital.
- **Mensagens de erro específicas por campo**, nunca genéricas — ex.: em vez de "erro ao salvar", mostrar "CPF do cliente inválido — verifique o dígito verificador" com o campo destacado (ver seção 9).
- **Busca universal** (tipo "command palette") para o usuário achar qualquer tela digitando o que precisa, sem decorar menus.
- **Tour em vídeo por tela** (ver seção 11).
- **Tooltips contextuais** em campos técnicos (ex.: "CFOP", "CST") explicando em linguagem simples o que aquilo significa.

---

## 5. Interface multi-abas

- Janela principal com barra de abas no topo (como um navegador), cada módulo aberto ocupa uma aba independente.
- Abas podem ser fechadas, reordenadas, e o estado de cada uma é preservado ao trocar de aba (ex.: um formulário de venda em andamento continua ali ao abrir o estoque em outra aba).
- Atalho de teclado para nova aba/fechar aba, limite configurável de abas simultâneas para não pesar a memória.
- Persistir as abas abertas por sessão (opcional) para retomar o trabalho ao reabrir o programa.

---

## 6. Fiscal e conformidade regulatória (ponto crítico)

### 6.1 Abordagem recomendada
Construir a comunicação direta com os web services de todas as 27 SEFAZ estaduais (cada uma com regras, ambientes de contingência e schemas próprios) **do zero é um projeto à parte**, de altíssimo custo de manutenção. A prática de mercado — usada até por ERPs grandes — é:

1. Usar uma **API especializada de emissão fiscal** (ex.: Focus NFe, Tecnospeed/PlugNotas, eNotas, Oobj, Brasil NFe — pesquisar e cotar antes de decidir) que já mantém a integração com todas as SEFAZ, aplica contingência automática (SVC-AN/SVC-RS) quando o estado cai, e atualiza os leiautes quando a Receita publica notas técnicas.
2. UltraERP mantém a **lógica de negócio e as regras de validação prévia** (cálculo de tributos, CFOP, CST/CSOSN, NCM) e envia o payload já validado para a API emissora, tratando o retorno (autorizado, rejeitado, motivo da rejeição) de forma amigável para o lojista.
3. Isso também resolve o problema do **NFS-e**, que historicamente tinha um layout por município (mais de 5.000 padrões diferentes). Atualmente, o **Ambiente Nacional da NFS-e** está em adoção obrigatória por lei, com prazo definido para 2026 — municípios acima de 50 mil habitantes devem operar exclusivamente no padrão nacional já no segundo semestre de 2026, sob pena de perda de repasses federais. A plataforma nacional já responde por parcela relevante do volume de emissões do país. **Recomendação:** priorizar a integração via Ambiente Nacional (`nfse.gov.br`) desde o início, mantendo compatibilidade com o padrão ABRASF para os municípios que ainda não migraram, via o mesmo provedor de API.

### 6.2 Documentos a suportar
| Documento | Modelo | Observação técnica |
|---|---|---|
| NF-e | 55 | Layout vigente 4.00, autorização por SEFAZ do estado do emitente |
| NFC-e | 65 | Layout 4.00, uso obrigatório de CSC (Código de Segurança do Contribuinte) |
| NFS-e | — | Migrando para Ambiente Nacional (obrigatório em 2026); manter fallback ABRASF |
| CT-e | 57/67 | Layout 4.00, para lojas que também façam entregas/fretes próprios ou terceirizados |
| MDF-e | 58 | Layout 3.00, vinculado a CT-e/NF-e de carga |
| DC-e (novo) | — | Declaração de Conteúdo Eletrônica, obrigatória desde abril/2026 para transporte de mercadorias sem exigência de outro documento fiscal — vale mapear se aplicável ao perfil do lojista (ex.: devoluções, amostras) |

### 6.3 Regras conforme MOC (Manual de Orientação do Contribuinte)
- Seguir estritamente os schemas XSD publicados nas Notas Técnicas vigentes para cada documento, validando o XML **antes** de enviar (evita rejeição e economiza tentativas).
- Implementar contingência (offline) para quando a SEFAZ estiver indisponível, com emissão posterior automática assim que o serviço voltar.
- Manter tabela de CFOP, CST/CSOSN, NCM e alíquotas por estado atualizável sem exigir atualização do aplicativo (dados vindos do backend, não hardcoded).
- Armazenar XML autorizado, cancelado e eventos (carta de correção, cancelamento) pelo prazo legal (5 anos), em nuvem — nunca só localmente.
- Validar antes do envio: CPF/CNPJ (dígito verificador), IE (por estado, cada UF tem algoritmo próprio), CEP, chave de acesso.

### 6.4 Certificado digital
- Suportar certificado A1 (arquivo .pfx) armazenado **criptografado no banco em nuvem** (nunca em texto puro), com a senha nunca persistida — solicitada e mantida apenas em memória durante a sessão de emissão, ou usando um cofre de segredos (ex.: AWS Secrets Manager/HashiCorp Vault).
- Suportar A3 (token/cartão) como modo alternativo para quem já possui.
- Alertar o usuário com antecedência (30/15/5 dias) sobre vencimento do certificado.

---

## 7. Modelo de assinatura SaaS (multi-usuário, multi-loja)

### 7.1 Estrutura sugerida
- **Tenant = Loja** (CNPJ). Uma conta pode ter múltiplas lojas (multi-filial), cada uma com sua própria assinatura ou um plano consolidado.
- **Planos por número de usuários simultâneos** e por módulos habilitados (ex.: Básico = Estoque+PDV+Financeiro; Completo = + Fiscal + Contábil + Multi-loja).
- Cobrança recorrente mensal via gateway (Asaas/Iugu/Stripe), com suporte a PIX, boleto e cartão recorrente.
- Cada usuário adicional além do incluso no plano gera cobrança de add-on.

### 7.2 Ciclo de vida da assinatura
1. Cadastro → trial gratuito (ex.: 7–14 dias) com módulos limitados.
2. Conversão para pagante → liberação total conforme plano contratado.
3. Inadimplência → período de tolerância (ex.: 3–5 dias) com aviso no app → bloqueio progressivo (primeiro bloqueia emissão fiscal e módulos avançados, mantendo consulta de dados; depois bloqueia login, nunca apaga dados).
4. Cancelamento → dados mantidos por um período contratual antes de expurgo, permitindo exportação pelo cliente.

### 7.3 Onde validar a assinatura
A validação **deve ser feita no servidor**, nunca só no cliente (ver seção 9 sobre segurança). O aplicativo local consulta o status via API autenticada a cada login e periodicamente durante o uso, com cache curto assinado para permitir uso breve offline sem abrir brecha permanente.

---

## 8. Controle de permissões

- **RBAC (controle por papel)** com papéis padrão (Administrador, Gerente, Caixa, Estoquista, Financeiro, Contador externo) e **papéis customizados** por loja.
- Permissão granular por módulo e por ação: visualizar / criar / editar / excluir / aprovar / exportar.
- Permissões podem ser ajustadas por usuário individualmente, sobrepondo o papel padrão quando necessário (conforme pedido no requisito 14).
- Ações sensíveis (cancelar nota fiscal, excluir lançamento financeiro, alterar permissões de outro usuário) exigem confirmação e ficam registradas em log de auditoria com usuário, IP e timestamp.
- Sessões por usuário com expiração e possibilidade de o administrador encerrar sessões remotamente (útil em caso de funcionário desligado).

---

## 9. Regras de negócio e validação de campos

- Máscaras e validação em tempo real (client-side) para CPF/CNPJ, CEP (com autopreenchimento via API de CEP), telefone, valores monetários, IE por estado.
- Validação também no servidor antes de persistir (nunca confiar só no front-end).
- **Ao falhar uma regra, o sistema deve:**
  - Destacar visualmente o campo problemático;
  - Explicar em linguagem simples o que está errado e como corrigir (ex.: "CNPJ inválido — confira os dois últimos dígitos" em vez de "erro 422");
  - Impedir o avanço apenas do necessário, preservando os demais dados já preenchidos (nunca fazer o usuário perder o que já digitou).
- Regras fiscais (CFOP compatível com a operação, NCM obrigatório por tipo de produto, etc.) validadas antes de permitir emissão, reduzindo rejeições na SEFAZ.

---

## 10. Ajuda contextual em vídeo

- Ícone do YouTube fixo (ex.: canto superior direito de cada tela/aba).
- Cada tela tem um `video_id` associado, mantido em uma tabela no backend (não hardcoded no app), permitindo trocar ou atualizar vídeos sem nova versão do instalador.
- Se não houver vídeo específico ainda, cair em um vídeo geral do módulo, nunca em link quebrado.
- Abrir em navegador externo (não embutir player pesado dentro do app, para manter leveza).

---

## 11. Design (moderno, dark/light mode, cross-platform)

- Design system próprio com tokens de cor, tipografia e espaçamento reutilizáveis (evita telas com "cara de admin genérico").
- Alternância clara/escuro instantânea, respeitando preferência do SO por padrão, com opção manual.
- Componentes consistentes entre telas (botões, tabelas, formulários) — construir uma pequena biblioteca de componentes interna em vez de reinventar em cada módulo.
- Ícones consistentes (ex.: biblioteca Lucide) e iconografia clara para leigos (evitar jargão visual).
- Dashboard inicial como "página de boas-vindas" com KPIs do dia — dá sensação imediata de controle ao lojista.

---

## 12. Performance e leveza

- PyWebView evita embutir um navegador completo (diferença central frente a soluções Electron), reduzindo consumo de RAM e tamanho do instalador.
- Paginação e carregamento sob demanda em todas as listagens (nunca carregar 10 mil produtos de uma vez).
- Índices adequados no PostgreSQL para as consultas mais usadas (busca de produto, histórico de vendas).
- Abas carregadas de forma preguiçosa (lazy load) — só processa o módulo quando o usuário efetivamente abre a aba.
- Cache local (SQLite) para dados de leitura frequente (ex.: tabela de produtos) com sincronização incremental, reduzindo round-trips à nuvem.
- Build compilado/otimizado (PyInstaller com `--onefile` avaliado com cuidado, pois pode aumentar tempo de abertura — testar `--onedir` para inicialização mais rápida).

---

## 13. Segurança geral e plano de testes para a assinatura mensal

Como pedido, esta seção trata especificamente da robustez do controle de assinatura paga, listando as ameaças mais comuns nesse tipo de sistema SaaS e os testes recomendados para mitigá-las. Isso deve ser tratado como um checklist de QA/segurança a ser executado antes de cada release que toque nessa área.

### 13.1 Princípios de arquitetura para evitar fraude de assinatura
- **Fonte de verdade sempre no servidor.** O status "ativo/inadimplente/cancelado" nunca deve ser decidido só pelo aplicativo local.
- **Token de sessão assinado (JWT) de curta duração**, renovado periodicamente contra o servidor; não usar um "flag" local permanente do tipo `licenciado = true` gravado em arquivo ou registro.
- **Modo offline limitado por tempo e assinado**: se permitir uso sem internet, gerar um token de graça (ex.: 48–72h) assinado digitalmente pelo servidor no último contato bem-sucedido, com expiração automática — nunca gerado localmente pelo próprio cliente.
- **Nunca armazenar dados de cartão** no UltraERP: usar sempre checkout hospedado/tokenização do gateway (Asaas/Iugu/Stripe), atendendo PCI-DSS por delegação.
- **Webhook do gateway de pagamento** como gatilho oficial de mudança de status (pago, falhou, estornado), nunca confiar apenas em polling do cliente.
- **Relógio do servidor como referência de tempo**, nunca o relógio local da máquina do usuário (evita burlar expiração atrasando o relógio do PC).

### 13.2 Ameaças a testar (threat model)

| # | Ameaça | Teste recomendado |
|---|---|---|
| 1 | Adiantar/atrasar o relógio do sistema operacional para burlar expiração de trial ou de graça offline | Alterar a hora do SO e confirmar que o app rejeita e usa apenas o timestamp assinado pelo servidor |
| 2 | Editar arquivo local de configuração/registro para forçar `licenciado=true` | Remover toda dependência de flags locais não assinadas; teste de "adulteração de arquivo" tentando forjar o status |
| 3 | Reutilizar/compartilhar token de sessão entre máquinas além do limite de usuários do plano | Testar login simultâneo além do limite contratado e verificar bloqueio/expulsão da sessão mais antiga |
| 4 | Interceptar e repetir (replay) uma resposta antiga de "assinatura válida" | Usar nonce/timestamp no payload de validação e testar reenvio de resposta capturada |
| 5 | Engenharia reversa do instalador para remover a checagem de licença | Ofuscar checagens críticas, mas assumir que o cliente pode ser violado — garantir que toda operação de valor (emitir nota fiscal, por ex.) *também* seja validada no servidor/API fiscal, não só no app |
| 6 | Downgrade de versão para explorar bug já corrigido no controle de licença | Testar se versões antigas têm o acesso à API bloqueado quando desatualizadas além de X versões |
| 7 | Man-in-the-middle na comunicação de validação de licença | Forçar TLS com certificate pinning e testar interceptação com proxy (ex.: Burp/mitmproxy) esperando falha |
| 8 | Estorno/chargeback após uso prolongado | Sincronizar evento de estorno do gateway via webhook para suspensão automática e reconciliação diária |
| 9 | Conta gratuita "eterna" por falha de expiração de trial | Job periódico no servidor (não no cliente) que expira trials vencidos, independente do app estar aberto |
| 10 | Escalonamento de módulo — usuário de plano básico acessando endpoints de módulos pagos diretamente pela API | Testar chamando os endpoints protegidos diretamente (sem passar pela UI) com um usuário de plano inferior — a autorização precisa estar no backend, não só escondida na interface |
| 11 | Vazamento de certificado digital/senha armazenados | Testar se é possível extrair o .pfx ou a senha do banco por acesso direto — devem estar cifrados com chave que não fica no mesmo lugar dos dados |

### 13.3 Recomendações de processo
- Incluir testes de licenciamento no pipeline de CI antes de cada deploy que toque autenticação, billing ou permissões.
- Contratar (ou simular internamente) um pentest focado especificamente no fluxo de assinatura antes do lançamento comercial.
- Monitorar métricas de uso anômalo (ex.: mesma licença logando de muitos IPs/dispositivos diferentes em curto período) como sinal de compartilhamento indevido.

---

## 14. Armazenamento em nuvem de imagens, certificados e dados

- Todo dado do lojista (produtos, imagens, XML fiscal, certificado digital, backups) fica na nuvem por padrão — nada crítico deve depender só da máquina local, conforme requisito 9.
- Imagens de produtos: bucket de object storage com CDN para carregamento rápido nas telas.
- Certificados digitais: criptografados em repouso, com controle de acesso restrito por loja/tenant (RLS no banco + política de bucket).
- Backups automáticos diários com retenção configurável, e possibilidade de exportação pelo próprio lojista (dado é do cliente, ele deve poder levá-lo embora).

---

## 15. Roadmap sugerido por fases

**Fase 1 — MVP:** Cadastro de empresa/usuários, Estoque básico, PDV, Fluxo de Caixa, Financeiro simples, NF-e/NFC-e via API fiscal terceirizada, permissões básicas, modo claro/escuro, multi-abas, assinatura com 1 plano único.

**Fase 2:** NFS-e (Ambiente Nacional + fallback ABRASF), CT-e/MDF-e, Contábil com exportação SPED, Compras/Fornecedores com importação de XML, CRM, múltiplos planos de assinatura, permissões customizadas por usuário, vídeos de ajuda.

**Fase 3:** Multi-loja/filiais, BI/relatórios avançados, integrações e-commerce/marketplace, programa de fidelidade, RH leve, auditoria completa, app complementar mobile (fora do escopo original, mas natural evolução).

---

## 16. Prompt consolidado para colar em uma ferramenta de IA de desenvolvimento

```
Construa o UltraERP, um sistema ERP desktop para lojistas de varejo brasileiro,
em Python + PyWebView, com banco de dados PostgreSQL em nuvem (multi-tenant via
Row Level Security) e armazenamento de arquivos (imagens, XML fiscal, certificados
digitais) em object storage S3-compatible — nada crítico deve ficar só na máquina
local do usuário.

Módulos: Estoque, PDV, Fluxo de Caixa, Financeiro, Comercial/Fiscal (NF-e, NFC-e,
NFS-e via Ambiente Nacional com fallback ABRASF, CT-e, MDF-e), Contábil (com
exportação SPED), Compras/Fornecedores, CRM, Multi-loja, Relatórios/BI, Auditoria.

Emissão fiscal: integrar com uma API especializada de terceiro (ex.: Focus NFe,
Tecnospeed/PlugNotas ou similar) em vez de comunicação direta com cada SEFAZ
estadual, mantendo a lógica de regras de negócio e pré-validação (CFOP, NCM,
CST/CSOSN, dígitos verificadores) no próprio UltraERP antes de enviar.

UX: interface multi-abas (como um navegador), modo claro/escuro, design moderno
e consistente, validação de campos com mensagens específicas apontando o que
corrigir, onboarding guiado, ícone de ajuda em vídeo (YouTube) por tela, busca
universal de comandos.

Assinatura: modelo SaaS mensal multi-usuário por loja, validado sempre no
servidor (nunca só no cliente), integrado a gateway de pagamento recorrente
(ex.: Asaas/Iugu/Stripe) via webhook, com modo offline limitado e assinado
digitalmente por tempo curto. Implementar e testar explicitamente contra
adulteração de relógio local, replay de token, edição de arquivo de licença,
compartilhamento de sessão além do limite do plano, e chamadas diretas à API
ignorando a UI — autorização sempre validada no backend.

Permissões: RBAC com papéis padrão e customizáveis por loja, granularidade por
módulo e ação (ver/criar/editar/excluir/aprovar), ajustável por usuário
individual, com log de auditoria completo.

Performance: priorizar leveza (PyWebView em vez de runtime tipo Electron),
paginação e lazy loading em todas as listagens, cache local read-only via
SQLite sincronizado com a nuvem.

Entregue multiplataforma (Windows, Linux, macOS) a partir de uma única base
de código.
```

---

### Observação final
Este documento cobre o escopo completo de um ERP de varejo maduro — é normal e recomendável desenvolvê-lo por fases (seção 15) em vez de tentar entregar tudo de uma vez. Se quiser, posso detalhar qualquer seção (ex.: modelagem de banco de dados, wireframes das telas principais, ou o contrato de API entre o app e o backend) em documentos separados.
