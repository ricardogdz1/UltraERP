"""Validações de campo com mensagens amigáveis para lojista leigo (seção 9).

Cada validador retorna None quando válido, ou a mensagem de erro pronta
para exibir junto ao campo. A validação definitiva acontece no servidor
(constraints e RLS); aqui evitamos round-trips e explicamos o erro.
"""

from __future__ import annotations


def validar_ean(ean: str) -> str | None:
    """EAN/GTIN 8, 12, 13 ou 14 dígitos com dígito verificador (GS1)."""
    ean = (ean or "").strip()
    if not ean:
        return None  # opcional
    if not ean.isdigit() or len(ean) not in (8, 12, 13, 14):
        return "Código de barras deve ter 8, 12, 13 ou 14 números. Confira a etiqueta do produto."
    soma = 0
    for i, digito in enumerate(reversed(ean[:-1])):
        peso = 3 if i % 2 == 0 else 1
        soma += int(digito) * peso
    dv = (10 - soma % 10) % 10
    if dv != int(ean[-1]):
        return "Código de barras inválido — o último dígito não confere. Confira número por número."
    return None


def validar_ncm(ncm: str) -> str | None:
    ncm = (ncm or "").strip()
    if not ncm:
        return None  # opcional no cadastro; obrigatório na emissão fiscal
    if not ncm.isdigit() or len(ncm) != 8:
        return "NCM deve ter exatamente 8 números (ex.: 61091000). Se não souber, pergunte ao seu contador."
    return None


def validar_produto(p: dict) -> dict[str, str]:
    """Valida o payload do produto. Retorna {campo: mensagem} — vazio se ok."""
    erros: dict[str, str] = {}

    nome = (p.get("nome") or "").strip()
    if len(nome) < 2:
        erros["nome"] = "Digite o nome do produto (pelo menos 2 letras)."

    if msg := validar_ean(p.get("ean", "")):
        erros["ean"] = msg
    if msg := validar_ncm(p.get("ncm", "")):
        erros["ncm"] = msg

    for campo, rotulo in (("preco_venda", "preço de venda"), ("preco_custo", "preço de custo")):
        valor = p.get(campo)
        if valor in (None, ""):
            if campo == "preco_venda":
                erros[campo] = "Informe o preço de venda."
            continue
        try:
            if float(valor) < 0:
                erros[campo] = f"O {rotulo} não pode ser negativo."
        except (TypeError, ValueError):
            erros[campo] = f"O {rotulo} deve ser um número — use vírgula ou ponto para centavos."

    try:
        if float(p.get("estoque_minimo") or 0) < 0:
            erros["estoque_minimo"] = "O estoque mínimo não pode ser negativo."
    except (TypeError, ValueError):
        erros["estoque_minimo"] = "O estoque mínimo deve ser um número."

    return erros
