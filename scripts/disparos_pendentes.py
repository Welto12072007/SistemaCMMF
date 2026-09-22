"""
disparos_pendentes.py
Processa APENAS a tabela disparos_pendentes (mensagens individuais agendadas por trigger).
NÃO processa disparos_programados — isso é feito exclusivamente pelo automacoes.py
que loga corretamente no disparos_programados_log para deduplicação.

Roda via GitHub Actions (baixo custo de execuções, ao contrário do n8n Cloud).

Por segurança, só processa os tipos em TIPOS_PERMITIDOS — há registros antigos de
outros tipos (pos_experimental etc.) na fila que não devem ser reenviados sem
revisão manual antes.
"""
import os
import logging
import datetime as dt
import requests
from wa_utils import normalizar_tel, enviar_whatsapp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

SB_URL       = os.environ["SUPABASE_URL"]
SB_KEY       = os.environ["SUPABASE_SERVICE_KEY"]

TIPOS_PERMITIDOS = [
    "boas_vindas",
    "manual_do_aluno",
    "lembrete_experimental_1d",
    "lembrete_experimental_3h",
    "juridico_advogada",
    "avaliacao_google",
    "lembrete_mensalidade",
    "cobranca_atraso",
]

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def registrar_log(action: str, status: str = "sucesso", level: str = "info", details: dict | None = None) -> None:
    """Grava no Controle de Logs (system_logs) — visível na tela /logs do CMMF."""
    try:
        requests.post(
            f"{SB_URL}/rest/v1/system_logs",
            json={
                "user_nome": "GitHub Actions",
                "action": action,
                "entity": "disparos_pendentes",
                "details": details,
                "level": level,
                "status": status,
                "origem": "disparos_pendentes",
            },
            headers=SB_HEADERS,
            timeout=10,
        )
    except Exception as e:
        log.error(f"registrar_log erro: {e}")


# ─── Utilitários ─────────────────────────────────────────────────────────────

# ─── disparos_pendentes ───────────────────────────────────────────────────────

def buscar_pendentes() -> list:
    # Janela de 7 dias — permite manual_do_aluno (+3 dias) com folga
    # mas evita enviar mensagens muito antigas acumuladas
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).isoformat()
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/disparos_pendentes",
            params={
                "select": "id,aluno_id,tipo,canal,mensagem,telefone_destinatario,agendado_para,aula_experimental_id",
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


def aula_experimental_ainda_confirmada(aula_id: str) -> bool:
    """Confere o status ATUAL da aula na hora do disparo — evita mandar lembrete
    de uma aula que foi remarcada/cancelada depois de o lembrete ter sido agendado."""
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/aulas_experimentais",
            params={"select": "status", "id": f"eq.{aula_id}"},
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            return False
        return rows[0].get("status") in ("confirmado_professor", "agendada")
    except Exception as e:
        log.error(f"aula_experimental_ainda_confirmada erro: {e}")
        return False


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
        if item.get("tipo") in ("lembrete_experimental_1d", "lembrete_experimental_3h") and item.get("aula_experimental_id"):
            if not aula_experimental_ainda_confirmada(item["aula_experimental_id"]):
                marcar_pendente(item["id"], "cancelado", "Aula não está mais confirmada/agendada")
                log.info(f'[pendentes] cancelado (aula remarcada/cancelada): {item["id"]}')
                continue

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
    registrar_log(
        "execucao_disparos_pendentes",
        status="erro" if err else "sucesso",
        level="warning" if err else "info",
        details={"enviados": env, "erros": err},
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Erro fatal: {e}")
        registrar_log("execucao_disparos_pendentes", status="erro", level="error", details={"erro_fatal": str(e)})
        raise
