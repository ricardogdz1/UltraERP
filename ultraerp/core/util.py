"""Utilidades pequenas e sem dependências de domínio."""

from __future__ import annotations


def to_number(valor) -> float:
    """Converte texto monetário em número, entendendo o formato brasileiro.

    Regra: se houver vírgula, ela é o separador decimal e os pontos são de
    milhar ('1.500,50' -> 1500.50). Sem vírgula, o ponto é decimal, no estilo
    US ('39.90' -> 39.90). Vazio/none -> 0.0.
    """
    if valor is None:
        return 0.0
    s = str(valor).strip()
    if s == "":
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)
