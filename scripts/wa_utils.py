"""Helpers compartilhados por automacoes.py e disparos_pendentes.py."""
import os
import re
import logging
import requests

log = logging.getLogger(__name__)

EVO_URL = os.environ.get("EVOLUTION_API_URL", "https://api.centrodemusicamurilofinger.com")
EVO_KEY = os.environ.get("EVOLUTION_API_KEY", "")
EVO_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "CentroMusica")


def normalizar_tel(tel: str) -> str | None:
    """Normaliza telefone BR pro formato DDI(55)+DDD+9+número = 13 dígitos."""
    clean = re.sub(r"\D", "", str(tel or ""))
    if not clean.startswith("55") and len(clean) >= 10:
        clean = "55" + clean
    if len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    return clean if len(clean) == 13 else None


def enviar_whatsapp(number: str, text: str) -> bool:
    try:
        r = requests.post(
            f"{EVO_URL}/message/sendText/{EVO_INSTANCE}",
            json={"number": number, "text": text},
            headers={"apikey": EVO_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code >= 300:
            log.error(f"Evolution API {r.status_code}: {r.text[:200]}")
        return r.status_code < 300
    except Exception as e:
        log.error(f"Erro Evolution API: {e}")
        return False
