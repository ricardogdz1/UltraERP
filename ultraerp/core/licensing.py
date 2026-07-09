"""Status da assinatura SaaS.

REQUISITO NÃO NEGOCIÁVEL (especificação, seções 7.3 e 13):
- A fonte de verdade do status é SEMPRE o servidor.
- Nunca gravar flag local do tipo `licenciado=true`.
- O relógio de referência é o do servidor, nunca o da máquina local.
- Modo offline futuro: token de graça curto, assinado PELO SERVIDOR,
  emitido no último contato bem-sucedido — jamais gerado pelo cliente.

Nesta fase do esqueleto, a consulta chama um endpoint RPC no Supabase
(`subscription_status`) que ainda precisa ser criado no backend. Toda
operação de valor (ex.: emitir nota) deverá revalidar no servidor,
independente do que o app local acredita.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from ultraerp.config import settings

# Status possíveis: ativo | trial | tolerancia | bloqueado_parcial | bloqueado


@dataclass
class LicenseStatus:
    status: str
    plan: str
    message: str = ""


def check_subscription(access_token: str) -> LicenseStatus:
    """Consulta o status da assinatura no servidor. Nunca decide localmente."""
    if settings.demo_mode:
        return LicenseStatus(
            status="trial",
            plan="demo",
            message="Modo demonstração — sem conexão com o servidor.",
        )

    try:
        resp = httpx.post(
            f"{settings.supabase_url}/rest/v1/rpc/subscription_status",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {access_token}",
            },
            json={},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return LicenseStatus(
            status=data.get("status", "bloqueado"),
            plan=data.get("plan", ""),
            message=data.get("message", ""),
        )
    except httpx.HTTPError:
        # Falha de rede NÃO libera o uso: sem confirmação do servidor,
        # o app opera restrito até revalidar (grace token assinado virá depois).
        return LicenseStatus(
            status="bloqueado_parcial",
            plan="",
            message=(
                "Não foi possível confirmar sua assinatura. "
                "Algumas funções ficam limitadas até a conexão voltar."
            ),
        )
