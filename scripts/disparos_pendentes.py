"""
disparos_pendentes.py
Substitui o workflow "Disparos Pendentes - CMMF" do n8n.
Roda via GitHub Actions a cada 30 minutos.

Lê registros pendentes da tabela disparos_pendentes,
envia via Evolution API e marca enviado/erro.
"""
import os
import re
import logging
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

SB_URL  = os.environ["SUPABASE_URL"]
SB_KEY  = os.environ["SUPABASE_SERVICE_KEY"]
EVO_URL = os.environ.get("EVOLUTION_API_URL", "https://api.centrodemusicamurilofinger.com")
EVO_KEY = os.environ.get("EVOLUTION_API_KEY", "CentroMusica2026ApiKey")
EVO_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "CentroMusica")

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def normalizar_tel(tel: str) -> str | None:
    clean = re.sub(r"\D", "", str(tel or ""))
    if not clean.startswith("55") and len(clean) >= 10:
        clean = "55" + clean
    # Brasil: DDI(2) + DDD(2) + 9(1) + número(8) = 13 dígitos
    if len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    return clean if len(clean) == 13 else None


def buscar_pendentes() -> list:
    r = requests.get(
        f"{SB_URL}/rest/v1/disparos_pendentes",
        params={
            "select": "id,aluno_id,tipo,canal,mensagem,telefone_destinatario,agendado_para",
            "status": "eq.pendente",
            "or": "(agendado_para.is.null,agendado_para.lte.now())",
            "order": "criado_em.asc",
            "limit": "30",
        },
        headers=SB_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def buscar_tel_aluno(aluno_id: str) -> str | None:
    r = requests.get(
        f"{SB_URL}/rest/v1/alunos",
        params={
            "select": "telefone,whatsapp,contato_invalido",
            "id": f"eq.{aluno_id}",
        },
        headers=SB_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return None
    row = rows[0]
    if row.get("contato_invalido"):
        return None
    return row.get("whatsapp") or row.get("telefone")


def enviar_whatsapp(number: str, text: str) -> bool:
    try:
        r = requests.post(
            f"{EVO_URL}/message/sendText/{EVO_INSTANCE}",
            json={"number": number, "text": text},
            headers={"apikey": EVO_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        return r.status_code < 300
    except Exception as e:
        log.error(f"Erro Evolution API: {e}")
        return False


def marcar(disparo_id: str, status: str, motivo: str | None = None) -> None:
    body: dict = {"status": status}
    if motivo:
        body["motivo_erro"] = motivo[:200]
    requests.patch(
        f"{SB_URL}/rest/v1/disparos_pendentes",
        params={"id": f"eq.{disparo_id}"},
        json=body,
        headers=SB_HEADERS,
        timeout=10,
    )


def main() -> None:
    pendentes = buscar_pendentes()
    log.info(f"{len(pendentes)} disparo(s) pendente(s)")

    enviados = 0
    erros = 0

    for item in pendentes:
        tel = item.get("telefone_destinatario")
        if not tel and item.get("aluno_id"):
            tel = buscar_tel_aluno(item["aluno_id"])

        tel_norm = normalizar_tel(tel) if tel else None

        if not tel_norm:
            marcar(item["id"], "erro", "Telefone inválido ou não encontrado")
            log.warning(f'Sem telefone válido: disparo {item["id"]}')
            erros += 1
            continue

        ok = enviar_whatsapp(tel_norm, item.get("mensagem") or "")
        if ok:
            marcar(item["id"], "enviado")
            log.info(f'Enviado {item["id"]} → {tel_norm}')
            enviados += 1
        else:
            marcar(item["id"], "erro", "Falha na Evolution API")
            log.error(f'Erro ao enviar {item["id"]} → {tel_norm}')
            erros += 1

    log.info(f"Concluído: {enviados} enviados, {erros} erros")


if __name__ == "__main__":
    main()
