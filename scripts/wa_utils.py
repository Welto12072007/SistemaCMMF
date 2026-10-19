"""Helpers compartilhados por automacoes.py e disparos_pendentes.py.

Envio de WhatsApp passa pela Edge Function `whatsapp-send` (API oficial da Meta),
que registra tudo em wa_mensagens e respeita a janela de 24h / modelos aprovados.
"""
import os
import re
import logging
import requests

log = logging.getLogger(__name__)

SB_URL = os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def normalizar_tel(tel: str) -> str | None:
    """Normaliza telefone BR pro formato DDI(55)+DDD+9+número = 13 dígitos."""
    clean = re.sub(r"\D", "", str(tel or ""))
    if not clean.startswith("55") and len(clean) >= 10:
        clean = "55" + clean
    if len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    return clean if len(clean) == 13 else None


def enviar(number: str, text: str, origem: str | None = None,
           template: dict | None = None, vars: dict | None = None,
           uso: str | None = None) -> tuple[bool, str | None]:
    """Retorna (ok, motivo_da_falha).

    Fora da janela de 24h a Meta só aceita modelo aprovado: passe `vars` (mesmas variáveis do texto)
    e o modelo é escolhido pelo tipo (`uso`, por padrão o que vem depois de ':' na origem).
    """
    body: dict = {"to": number, "texto": text, "origem": origem}
    if template:
        body["template"] = template
    if vars is not None:
        body["modelo"] = {"uso": uso or (origem or "").split(":")[-1], "vars": vars}
    try:
        r = requests.post(
            f"{SB_URL}/functions/v1/whatsapp-send",
            json=body,
            headers={"Authorization": f"Bearer {SB_KEY}", "apikey": SB_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
        if r.status_code < 300:
            return True, None
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        motivo = data.get("codigo") or f"HTTP {r.status_code}"
        log.error(f"whatsapp-send {r.status_code} ({origem}): {data.get('erro') or r.text[:200]}")
        return False, f"{motivo}: {data.get('erro') or ''}".strip(": ")
    except Exception as e:
        log.error(f"Erro whatsapp-send: {e}")
        return False, str(e)


def enviar_whatsapp(number: str, text: str, origem: str | None = None,
                    vars: dict | None = None, uso: str | None = None) -> bool:
    return enviar(number, text, origem, vars=vars, uso=uso)[0]
