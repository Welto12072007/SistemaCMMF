"""
disparos_pendentes.py
Processa APENAS a tabela disparos_pendentes (mensagens individuais agendadas por trigger).
NÃO processa disparos_programados — isso é feito exclusivamente pelo automacoes.py
que loga corretamente no disparos_programados_log para deduplicação.

Roda via GitHub Actions (baixo custo de execuções, ao contrário do n8n Cloud).

Por segurança, só processa os tipos em TIPOS_PERMITIDOS — há registros antigos de
outros tipos (cobranca_atraso, lembrete_mensalidade, pos_experimental etc.) na fila
que não devem ser reenviados sem revisão manual antes.
"""
import os
import re
import logging
import datetime as dt
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

SB_URL       = os.environ["SUPABASE_URL"]
SB_KEY       = os.environ["SUPABASE_SERVICE_KEY"]
EVO_URL      = os.environ.get("EVOLUTION_API_URL", "https://api.centrodemusicamurilofinger.com")
EVO_KEY      = os.environ.get("EVOLUTION_API_KEY", "CentroMusica2026ApiKey")
EVO_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "CentroMusica")

TIPOS_PERMITIDOS = [
    "boas_vindas",
    "manual_do_aluno",
    "lembrete_experimental_1d",
    "lembrete_experimental_3h",
    "juridico_advogada",
]

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


# ─── Utilitários ─────────────────────────────────────────────────────────────

def normalizar_tel(tel: str) -> str | None:
    clean = re.sub(r"\D", "", str(tel or ""))
    if not clean.startswith("55") and len(clean) >= 10:
        clean = "55" + clean
    # Brasil: DDI(2) + DDD(2) + 9(1) + número(8) = 13 dígitos
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


# ─── disparos_pendentes ───────────────────────────────────────────────────────

def buscar_pendentes() -> list:
    # Janela de 7 dias — permite manual_do_aluno (+3 dias) com folga
    # mas evita enviar mensagens muito antigas acumuladas
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).isoformat()
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/disparos_pendentes",
            params={
                "select": "id,aluno_id,tipo,canal,mensagem,telefone_destinatario,agendado_para",
                "status": "eq.pendente",
                "tipo": f"in.({','.join(TIPOS_PERMITIDOS)})",
                "criado_em": f"gte.{cutoff}",
                "order": "criado_em.asc",
                "limit": "100",
            },
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        rows = r.json() or []
    except Exception as e:
        log.error(f"buscar_pendentes erro: {e}")
        return []

    now_utc = dt.datetime.now(dt.timezone.utc).isoformat()
    return [
        row for row in rows
        if not row.get("agendado_para") or row["agendado_para"] <= now_utc
    ]


def buscar_tel_aluno(aluno_id: str) -> str | None:
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/alunos",
            params={"select": "telefone,contato_invalido", "id": f"eq.{aluno_id}"},
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
        return row.get("telefone")
    except Exception as e:
        log.error(f"buscar_tel_aluno erro: {e}")
        return None


def marcar_pendente(disparo_id: str, status: str, motivo: str | None = None) -> None:
    body: dict = {"status": status, "processado_em": dt.datetime.now(dt.timezone.utc).isoformat()}
    if motivo:
        body["erro"] = motivo[:200]
    try:
        requests.patch(
            f"{SB_URL}/rest/v1/disparos_pendentes",
            params={"id": f"eq.{disparo_id}"},
            json=body,
            headers=SB_HEADERS,
            timeout=10,
        )
    except Exception as e:
        log.error(f"marcar_pendente {disparo_id} erro: {e}")


def processar_pendentes() -> tuple[int, int]:
    pendentes = buscar_pendentes()
    log.info(f"[pendentes] {len(pendentes)} disparo(s)")
    enviados = erros = 0

    for item in pendentes:
        tel = item.get("telefone_destinatario")
        if not tel and item.get("aluno_id"):
            tel = buscar_tel_aluno(item["aluno_id"])

        tel_norm = normalizar_tel(tel) if tel else None

        if not tel_norm:
            marcar_pendente(item["id"], "erro", "Telefone inválido ou não encontrado")
            log.warning(f'[pendentes] sem telefone: {item["id"]}')
            erros += 1
            continue

        ok = enviar_whatsapp(tel_norm, item.get("mensagem") or "")
        if ok:
            marcar_pendente(item["id"], "enviado")
            log.info(f'[pendentes] enviado {item["id"]} → {tel_norm}')
            enviados += 1
        else:
            marcar_pendente(item["id"], "erro", "Falha na Evolution API")
            log.error(f'[pendentes] falha {item["id"]} → {tel_norm}')
            erros += 1

    return enviados, erros


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    agora = dt.datetime.now(dt.timezone.utc)
    log.info(f"=== Iniciando disparos_pendentes {agora.strftime('%d/%m/%Y %H:%M')} UTC ===")

    env, err = processar_pendentes()

    log.info(f"=== Concluído: {env} enviados, {err} erros ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Erro fatal: {e}")
        raise
