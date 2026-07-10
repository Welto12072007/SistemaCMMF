"""
disparos_pendentes.py
Substitui os workflows de automação do n8n para evitar consumo de execuções.
Roda via GitHub Actions a cada 30 minutos.

Processa duas fontes de disparos:
1. disparos_pendentes — mensagens individuais (lembretes, cobranças, boas-vindas, etc.)
2. disparos_programados — mensagens em grupo agendadas (aniversários, NPS, marketing)
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

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Tipos que verificam condição própria (não dependem de dia_disparo/dia_semana)
TIPOS_DIARIO = {"aniversario", "pesquisa_satisfacao"}


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
    # Janela de 48h — cobre finais de semana sem enviar mensagens muito velhas
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=48)).isoformat()
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/disparos_pendentes",
            params={
                "select": "id,aluno_id,tipo,canal,mensagem,telefone_destinatario,agendado_para",
                "status": "eq.pendente",
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


# ─── disparos_programados ─────────────────────────────────────────────────────

def _parse_utc(s: str | None) -> dt.datetime | None:
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def deve_enviar_hoje(d: dict, agora: dt.datetime) -> bool:
    """Decide se este disparo_programado deve rodar agora."""
    tipo = d.get("tipo", "")
    rec  = d.get("recorrencia") or ""

    # Botão "Disparar Agora" no sistema — prioridade máxima
    if d.get("disparar_agora"):
        return True

    # Checar hora_disparo: só envia após o horário configurado
    hora_str = d.get("hora_disparo")
    if hora_str:
        try:
            h, m = map(int, str(hora_str)[:5].split(":"))
            hora_limite = agora.replace(hour=h, minute=m, second=0, microsecond=0)
            if agora < hora_limite:
                return False
        except Exception:
            pass

    # Evitar reenvio (janela de 20h para não duplicar em execuções próximas)
    ultimo = _parse_utc(d.get("ultimo_disparo"))
    if ultimo and (agora - ultimo).total_seconds() < 72_000:  # 20 horas
        return False

    # Tipos com lógica diária própria (buscarão seus destinatários internamente)
    if tipo in TIPOS_DIARIO:
        return True

    if rec == "diario":
        return True
    elif rec == "semanal":
        # dia_semana: 1=seg … 7=dom (Python: 0=seg … 6=dom)
        return agora.weekday() + 1 == (d.get("dia_semana") or 0)
    elif rec == "mensal":
        return agora.day == (d.get("dia_disparo") or 0)
    elif rec == "unico":
        data_unica = d.get("data_unica")
        return bool(data_unica and data_unica == agora.date().isoformat())

    return False


def get_destinatarios(grupo_alvo: str) -> list:
    """Chama RPC get_destinatarios_disparo e retorna lista de {id,nome,telefone}."""
    try:
        r = requests.post(
            f"{SB_URL}/rest/v1/rpc/get_destinatarios_disparo",
            json={"p_grupo_alvo": grupo_alvo},
            headers={**SB_HEADERS, "Prefer": ""},
            timeout=15,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        log.error(f"get_destinatarios erro ({grupo_alvo}): {e}")
        return []


def buscar_aniversariantes(agora: dt.datetime) -> list:
    """Alunos ativos com aniversário hoje (compara mês-dia de data_nascimento)."""
    mes_dia = agora.strftime("%m-%d")
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/alunos",
            params={
                "select": "id,nome,telefone",
                "status": "eq.ativo",
                "data_nascimento": f"like.%-{mes_dia}",
            },
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        log.error(f"buscar_aniversariantes erro: {e}")
        return []


def buscar_alunos_nps(agora: dt.datetime) -> list:
    """Alunos ativos matriculados há 28-32 dias (janela para NPS de 1 mês)."""
    d_min = (agora - dt.timedelta(days=32)).date().isoformat()
    d_max = (agora - dt.timedelta(days=28)).date().isoformat()
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/alunos",
            params={
                "select": "id,nome,telefone",
                "status": "eq.ativo",
                "data_matricula": f"gte.{d_min}",
                "and": f"(data_matricula.lte.{d_max})",
            },
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        log.error(f"buscar_alunos_nps erro: {e}")
        return []


def atualizar_programado(prog_id: str, agora: dt.datetime, enviados: int) -> None:
    try:
        requests.patch(
            f"{SB_URL}/rest/v1/disparos_programados",
            params={"id": f"eq.{prog_id}"},
            json={
                "ultimo_disparo": agora.isoformat(),
                "disparar_agora": False,
                "total_enviados": enviados,   # sobrescreve — OK para log
                "log_ultimo_envio": f"{enviados} enviado(s) em {agora.strftime('%d/%m/%Y %H:%M')} BRT",
            },
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            timeout=10,
        )
    except Exception as e:
        log.error(f"atualizar_programado {prog_id} erro: {e}")


def processar_programados(agora: dt.datetime) -> tuple[int, int]:
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/disparos_programados",
            params={
                "select": "id,nome,tipo,recorrencia,dia_disparo,dia_semana,data_unica,"
                          "disparar_agora,hora_disparo,ultimo_disparo,grupo_alvo,mensagem",
                "ativo": "eq.true",
            },
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        programados = r.json() or []
    except Exception as e:
        log.error(f"buscar_programados erro: {e}")
        return 0, 0

    total_env = total_err = 0

    for d in programados:
        nome = d.get("nome", d["id"])

        if not deve_enviar_hoje(d, agora):
            log.debug(f"[programados] pular: {nome}")
            continue

        log.info(f"[programados] processando: {nome}")
        tipo        = d.get("tipo", "")
        grupo       = d.get("grupo_alvo") or "alunos_ativos"
        template    = d.get("mensagem") or ""

        # Selecionar destinatários conforme tipo
        if tipo == "aniversario":
            destinatarios = buscar_aniversariantes(agora)
        elif tipo == "pesquisa_satisfacao":
            destinatarios = buscar_alunos_nps(agora)
        else:
            destinatarios = get_destinatarios(grupo)

        if not destinatarios:
            log.info(f"[programados] {nome}: sem destinatários")
            atualizar_programado(d["id"], agora, 0)
            continue

        enviados = erros = 0
        for dest in destinatarios:
            tel = normalizar_tel(dest.get("telefone") or "")
            if not tel:
                erros += 1
                continue

            nome_dest = (dest.get("nome") or "").split()[0]
            msg = template.replace("{nome}", nome_dest)

            if enviar_whatsapp(tel, msg):
                log.info(f"[programados] {nome} → {tel}")
                enviados += 1
            else:
                log.error(f"[programados] falha {nome} → {tel}")
                erros += 1

        atualizar_programado(d["id"], agora, enviados)
        log.info(f"[programados] {nome}: {enviados} enviados, {erros} erros")
        total_env += enviados
        total_err += erros

    return total_env, total_err


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    agora = dt.datetime.now(dt.timezone.utc)
    log.info(f"=== Iniciando disparos {agora.strftime('%d/%m/%Y %H:%M')} UTC ===")

    env1, err1 = processar_pendentes()
    env2, err2 = processar_programados(agora)

    log.info(
        f"=== Concluído: pendentes={env1}env/{err1}err | "
        f"programados={env2}env/{err2}err ==="
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Erro fatal: {e}")
        raise
