"""Bridge JS ↔ Python exposta ao front-end via `pywebview.api`.

Todo método retorna dict serializável em JSON no formato:
  {"ok": True, "data": ...}  ou  {"ok": False, "error": "mensagem amigável"}

As mensagens de erro são escritas para o lojista leigo (especificação, seção 9).
"""

from __future__ import annotations

from typing import Any

import httpx

from ultraerp import __version__
from ultraerp.config import settings
from ultraerp.core import (
    auth, credentials, estoque, financeiro, licensing, onboarding, pdv, prefs, validacao,
)
from ultraerp.core.util import to_number

# Módulos da Fase 1 (roadmap, seção 15). IDs usados pelo front para abrir abas.
MODULES_FASE1 = [
    {"id": "dashboard", "label": "Dashboard", "icon": "layout-dashboard"},
    {"id": "estoque", "label": "Estoque", "icon": "package"},
    {"id": "pdv", "label": "PDV", "icon": "shopping-cart"},
    {"id": "caixa", "label": "Fluxo de Caixa", "icon": "wallet"},
    {"id": "financeiro", "label": "Financeiro", "icon": "banknote"},
    {"id": "fiscal", "label": "Fiscal", "icon": "file-text"},
]


def _ok(data: Any = None) -> dict:
    return {"ok": True, "data": data}


def _err(message: str) -> dict:
    return {"ok": False, "error": message}


class ApiBridge:
    def __init__(self) -> None:
        self._window = None
        self._session: auth.Session | None = None
        self._license: licensing.LicenseStatus | None = None

    def attach(self, window) -> None:
        self._window = window

    # ---- infra -----------------------------------------------------------

    def ping(self) -> dict:
        return _ok({"version": __version__, "demo_mode": settings.demo_mode})

    # ---- autenticação ----------------------------------------------------

    def login(self, email: str, password: str) -> dict:
        if not email or "@" not in email:
            return _err("Digite um e-mail válido — ex.: nome@empresa.com.br")
        if not password and not settings.demo_mode:
            return _err("Digite sua senha.")
        try:
            self._session = auth.login(email, password)
        except auth.AuthError as exc:
            return _err(str(exc))

        # Assinatura sempre confirmada no servidor após o login (seção 7.3)
        self._license = licensing.check_subscription(self._session.access_token)
        return _ok(
            {
                "email": self._session.email,
                "license": {
                    "status": self._license.status,
                    "plan": self._license.plan,
                    "message": self._license.message,
                },
            }
        )

    def cadastrar(self, dados: dict) -> dict:
        """Cria conta (signup) + loja (onboarding) e entra. Retorna como login.

        Erros por campo seguem o padrão {field_errors} para a UI destacar
        cada campo (especificação, seção 9).
        """
        dados = dados or {}
        erros = validacao.validar_cadastro(dados)
        if erros:
            return {"ok": False, "field_errors": erros,
                    "error": "Alguns campos precisam de atenção — veja as mensagens abaixo deles."}

        email = (dados.get("email") or "").strip()

        # Reaproveita a sessão se o signup já ocorreu numa tentativa anterior
        # (ex.: onboarding falhou por CNPJ duplicado e o usuário corrigiu):
        # evita "e-mail já cadastrado" ao reenviar.
        if not (self._session and self._session.email == email):
            try:
                self._session = auth.signup(email, dados.get("senha") or "")
            except auth.AuthError as exc:
                return {"ok": False, "field_errors": {"email": str(exc)}, "error": str(exc)}

        try:
            res = onboarding.criar_loja(self._session.access_token, dados)
        except httpx.HTTPError:
            return _err("Sua conta foi criada, mas não conseguimos cadastrar a loja agora. "
                        "Verifique sua internet e tente novamente.")

        if not res.get("ok"):
            msg = res.get("error", "Não foi possível cadastrar a loja.")
            # A maioria das rejeições do servidor é sobre o CNPJ.
            return {"ok": False, "field_errors": {"cnpj": msg}, "error": msg}

        self._license = licensing.check_subscription(self._session.access_token)
        return _ok({
            "email": self._session.email,
            "license": {
                "status": self._license.status,
                "plan": self._license.plan,
                "message": self._license.message,
            },
        })

    def logout(self) -> dict:
        self._session = None
        self._license = None
        return _ok()

    def get_session(self) -> dict:
        if self._session is None:
            return _ok(None)
        return _ok({"email": self._session.email})

    # ---- credenciais lembradas (cofre nativo do SO) ------------------------

    def credentials_get(self, email: str) -> dict:
        """Senha lembrada para preencher o formulário. Login segue no servidor."""
        return _ok({"password": credentials.get_password(email)})

    def credentials_save(self, email: str, password: str) -> dict:
        try:
            credentials.save_password(email, password)
            return _ok()
        except credentials.CredentialError as exc:
            return _err(str(exc))

    def credentials_delete(self, email: str) -> dict:
        credentials.delete_password(email)
        return _ok()

    # ---- preferências locais (e-mail lembrado, tema) ----------------------

    def prefs_get(self) -> dict:
        return _ok(prefs.load())

    def prefs_set(self, updates: dict) -> dict:
        prefs.save(updates or {})
        return _ok()

    # ---- módulos ---------------------------------------------------------

    def list_modules(self) -> dict:
        if self._session is None:
            return _err("Faça login para continuar.")
        return _ok(MODULES_FASE1)

    # ---- estoque ---------------------------------------------------------

    def _token(self) -> str | None:
        return self._session.access_token if self._session else None

    def estoque_listar(self, pagina: int = 1, busca: str = "", so_baixo: bool = False) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            return _ok(estoque.listar(self._token(), int(pagina or 1), busca or "", bool(so_baixo)))
        except httpx.HTTPError:
            return _err("Não foi possível carregar os produtos. Verifique sua internet e tente novamente.")

    def estoque_resumo(self) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            return _ok(estoque.resumo(self._token()))
        except httpx.HTTPError:
            return _err("Não foi possível carregar o resumo do estoque. Tente novamente.")

    def estoque_movimentos(self, produto_id: str, pagina: int = 1) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            return _ok(estoque.movimentos(self._token(), produto_id, int(pagina or 1)))
        except httpx.HTTPError:
            return _err("Não foi possível carregar o histórico. Verifique sua internet e tente novamente.")

    def estoque_salvar(self, produto: dict) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        erros = validacao.validar_produto(produto)
        if erros:
            return {"ok": False, "field_errors": erros,
                    "error": "Alguns campos precisam de atenção — veja as mensagens abaixo deles."}
        try:
            return _ok(estoque.salvar(self._token(), produto))
        except LookupError as exc:
            return _err(str(exc))
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 409:
                return {"ok": False,
                        "field_errors": {"ean": "Já existe um produto com este código de barras na sua loja."},
                        "error": "Código de barras repetido."}
            return _err("Não foi possível salvar. Tente novamente; se persistir, fale com o suporte.")
        except httpx.HTTPError:
            return _err("Não foi possível salvar. Verifique sua internet e tente novamente.")

    def estoque_desativar(self, produto_id: str) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            estoque.desativar(self._token(), produto_id)
            return _ok()
        except httpx.HTTPError:
            return _err("Não foi possível excluir o produto. Tente novamente.")

    def estoque_ajustar(self, produto_id: str, quantidade, motivo: str = "") -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            negativo = str(quantidade).strip().startswith("-")
            qtd = to_number(str(quantidade).lstrip("-+"))
            if negativo:
                qtd = -qtd
        except (TypeError, ValueError):
            return _err("Quantidade inválida — use números (ex.: 5 ou -2,5).")
        try:
            resultado = estoque.ajustar(self._token(), produto_id, qtd, motivo)
        except httpx.HTTPError:
            return _err("Não foi possível ajustar o estoque. Verifique sua internet e tente novamente.")
        if not resultado.get("ok"):
            return _err(resultado.get("error", "Não foi possível ajustar o estoque."))
        return _ok({"estoque_atual": resultado["estoque_atual"]})

    # ---- PDV --------------------------------------------------------------

    def pdv_finalizar(self, itens: list, forma: str, valor_recebido=None) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        if not itens:
            return _err("Adicione ao menos um produto para finalizar a venda.")
        valor = None
        if valor_recebido not in (None, ""):
            try:
                valor = to_number(valor_recebido)
            except (TypeError, ValueError):
                return _err("Valor recebido inválido — use números (ex.: 50,00).")
        try:
            resultado = pdv.finalizar(self._token(), itens, forma, valor)
        except httpx.HTTPError:
            return _err("Não foi possível finalizar a venda. Verifique sua internet e tente novamente.")
        if not resultado.get("ok"):
            return _err(resultado.get("error", "Não foi possível finalizar a venda."))
        return _ok(resultado)

    # ---- financeiro / fluxo de caixa --------------------------------------

    def financeiro_resumo(self) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            return _ok(financeiro.resumo(self._token()))
        except httpx.HTTPError:
            return _err("Não foi possível carregar o resumo financeiro. Tente novamente.")

    def financeiro_listar(self, tipo: str = "", situacao: str = "", pagina: int = 1) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            return _ok(financeiro.listar(self._token(), tipo or "", situacao or "", int(pagina or 1)))
        except httpx.HTTPError:
            return _err("Não foi possível carregar os lançamentos. Verifique sua internet e tente novamente.")

    def financeiro_salvar(self, lancamento: dict) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        erros = validacao.validar_lancamento(lancamento or {})
        if erros:
            return {"ok": False, "field_errors": erros,
                    "error": "Alguns campos precisam de atenção — veja as mensagens abaixo deles."}
        try:
            return _ok(financeiro.salvar(self._token(), lancamento))
        except LookupError as exc:
            return _err(str(exc))
        except httpx.HTTPError:
            return _err("Não foi possível salvar o lançamento. Verifique sua internet e tente novamente.")

    def financeiro_baixar(self, lancamento_id: str, pago: bool = True) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            resultado = financeiro.baixar(self._token(), lancamento_id, bool(pago))
        except httpx.HTTPError:
            return _err("Não foi possível atualizar o lançamento. Tente novamente.")
        if not resultado.get("ok"):
            return _err(resultado.get("error", "Não foi possível atualizar o lançamento."))
        return _ok()

    def financeiro_excluir(self, lancamento_id: str) -> dict:
        if not self._token():
            return _err("Faça login para continuar.")
        try:
            financeiro.excluir(self._token(), lancamento_id)
            return _ok()
        except httpx.HTTPError:
            return _err("Não foi possível excluir. Contas geradas por vendas não podem ser excluídas.")
