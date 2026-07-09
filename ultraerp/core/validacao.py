"""Validações de campo com mensagens amigáveis para lojista leigo (seção 9).

Cada validador retorna None quando válido, ou a mensagem de erro pronta
para exibir junto ao campo. A validação definitiva acontece no servidor
(constraints e RLS); aqui evitamos round-trips e explicamos o erro.
"""

from __future__ import annotations

import re

# 27 unidades federativas (para validar a UF do cadastro da loja)
UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}


def cnpj_valido(cnpj: str) -> bool:
    """Valida CNPJ pelos dígitos verificadores (espelha a função do servidor)."""
    cnpj = re.sub(r"\D", "", cnpj or "")
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False

    def dv(nums: str, pesos: list[int]) -> int:
        soma = sum(int(n) * p for n, p in zip(nums, pesos))
        resto = 11 - (soma % 11)
        return 0 if resto >= 10 else resto

    d1 = dv(cnpj[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = dv(cnpj[:13], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return cnpj[12] == str(d1) and cnpj[13] == str(d2)


def validar_cadastro(p: dict) -> dict[str, str]:
    """Valida o payload do cadastro (conta + loja). Retorna {campo: mensagem}."""
    erros: dict[str, str] = {}

    email = (p.get("email") or "").strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        erros["email"] = "Digite um e-mail válido — ex.: nome@empresa.com.br"

    senha = p.get("senha") or ""
    if len(senha) < 6:
        erros["senha"] = "A senha precisa de pelo menos 6 caracteres."
    if (p.get("senha2") or "") != senha:
        erros["senha2"] = "As duas senhas não são iguais."

    if not cnpj_valido(p.get("cnpj", "")):
        erros["cnpj"] = "CNPJ inválido — confira os números da etiqueta/contrato."

    if len((p.get("razao_social") or "").strip()) < 2:
        erros["razao_social"] = "Informe a razão social da loja."

    if (p.get("uf") or "").upper() not in UFS:
        erros["uf"] = "Selecione o estado (UF) da loja."

    if len((p.get("nome_usuario") or "").strip()) < 2:
        erros["nome_usuario"] = "Informe o seu nome."

    return erros


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
