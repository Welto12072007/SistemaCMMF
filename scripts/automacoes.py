"""
automacoes.py
Substitui o workflow "Automações Agendadas - CMMF" do n8n.
Roda via GitHub Actions a cada 2 horas (UTC 0,2,4,6,8,10,12,14,16,18,20,22).

Lógica:
  - Sempre:      detectar alertas de faltas + enviar aprovados
  - Sempre:      processar disparos_programados (hora/recorrência)
  - 18h BRT:     lembretes de aula amanhã
  - 5h-18h BRT:  confirmação 3h antes da aula
  - 9h BRT:      follow-up pós-aula experimental
  - 10h BRT:     notificar chefe sobre fechamentos pendentes
  - Dia 1, 1h:   expirar reposições do mês anterior
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
CHEFE_TEL    = os.environ.get("CHEFE_TEL", "5551998042607")

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
}

MESES_PT = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
]


# ── helpers ────────────────────────────────────────────────────────────────────

def now_brt() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)


def normalizar_tel(tel: str) -> str | None:
    clean = re.sub(r"\D", "", str(tel or ""))
    if not clean.startswith("55") and len(clean) >= 10:
        clean = "55" + clean
    if len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    return clean if len(clean) == 13 else None


def send_whatsapp(number: str, text: str) -> bool:
    try:
        r = requests.post(
            f"{EVO_URL}/message/sendText/{EVO_INSTANCE}",
            json={"number": number, "text": text},
            headers={"apikey": EVO_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        return r.status_code < 300
    except Exception as e:
        log.error(f"Evolution API erro: {e}")
        return False


def rpc(name: str, params: dict | None = None) -> list | dict | None:
    try:
        r = requests.post(
            f"{SB_URL}/rest/v1/rpc/{name}",
            json=params or {},
            headers=SB_HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"RPC {name} erro: {e}")
        return None


def sb_get(path: str, params: dict | None = None) -> list:
    try:
        r = requests.get(
            f"{SB_URL}/rest/v1/{path}",
            params=params or {},
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        log.error(f"GET {path} erro: {e}")
        return []


def sb_patch(path: str, query: dict, body: dict) -> None:
    try:
        requests.patch(
            f"{SB_URL}/rest/v1/{path}",
            params=query,
            json=body,
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            timeout=10,
        )
    except Exception as e:
        log.error(f"PATCH {path} erro: {e}")


def sb_post(path: str, body: dict) -> None:
    try:
        requests.post(
            f"{SB_URL}/rest/v1/{path}",
            json=body,
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            timeout=10,
        )
    except Exception as e:
        log.error(f"POST {path} erro: {e}")


# ── tarefas ────────────────────────────────────────────────────────────────────

def lembretes_amanha() -> None:
    """18h BRT — lembrete de aula para o dia seguinte."""
    aulas = rpc("buscar_lembretes_amanha")
    if not isinstance(aulas, list):
        return
    log.info(f"Lembretes amanhã: {len(aulas)}")
    for aula in aulas:
        tel = normalizar_tel(aula.get("aluno_telefone", ""))
        if not tel:
            continue
        nome = (aula.get("aluno_nome") or "").split()[0]
        instr = aula.get("instrumento", "")
        horario = aula.get("horario", "")
        prof = aula.get("professor_nome", "")
        if aula.get("tipo") == "aula_experimental":
            msg = (
                f"Oi {nome}! 🎶 Lembrete: amanhã é sua *aula experimental* de "
                f"*{instr}* às *{horario}* com {prof}. Te esperamos! 😊"
            )
        else:
            msg = (
                f"Oi {nome}! 🎶 Lembrete: amanhã é dia de aula de "
                f"*{instr}* às *{horario}*. Te esperamos! 😊"
            )
        if send_whatsapp(tel, msg):
            rpc("marcar_lembrete_enviado", {"p_agendamento_id": aula.get("agendamento_id")})
            log.info(f"Lembrete amanhã → {tel}")


def confirmacao_3h() -> None:
    """5h–18h BRT — confirmação 3h antes da aula."""
    aulas = rpc("buscar_lembretes_3h")
    if not isinstance(aulas, list):
        return
    log.info(f"Confirmações 3h: {len(aulas)}")
    for aula in aulas:
        tel = normalizar_tel(aula.get("aluno_telefone", ""))
        if not tel:
            continue
        nome = (aula.get("aluno_nome") or "").split()[0]
        instr = aula.get("instrumento", "")
        prof = aula.get("professor_nome", "")
        if aula.get("tipo") == "aula_experimental":
            msg = (
                f"Oi {nome}! ⏰ Sua *aula experimental* de *{instr}* começa "
                f"em 3 horas com {prof}. Te esperamos! 🎵"
            )
        else:
            msg = (
                f"Oi {nome}! ⏰ Sua aula de *{instr}* começa em 3 horas. "
                f"Te esperamos! 🎵"
            )
        if send_whatsapp(tel, msg):
            rpc("marcar_confirmacao_3h", {"p_agendamento_id": aula.get("agendamento_id")})
            log.info(f"Confirmação 3h → {tel}")


def followup_experimental() -> None:
    """9h BRT — follow-up pós-aula experimental."""
    leads = rpc("buscar_followup_experimental")
    if not isinstance(leads, list):
        return
    log.info(f"Follow-up experimental: {len(leads)}")
    for lead in leads:
        tel = normalizar_tel(lead.get("telefone", ""))
        if not tel:
            continue
        nome = (lead.get("aluno_nome") or "").split()[0] or "você"
        msg = (
            f"Oi {nome}! 😊 Como foi sua aula experimental ontem? "
            f"Ficou com alguma dúvida sobre o CMMF? Estamos aqui para ajudar! 🎶"
        )
        send_whatsapp(tel, msg)
        log.info(f"Follow-up experimental → {tel}")


def fechamento() -> None:
    """10h BRT — notificar chefe sobre experimentais prontas para fechar."""
    aulas = rpc("buscar_experimentais_para_fechamento")
    if not isinstance(aulas, list):
        return
    log.info(f"Fechamentos pendentes: {len(aulas)}")
    for aula in aulas:
        nome = aula.get("aluno_nome", "")
        instr = aula.get("instrumento", "")
        data = aula.get("data_aula", "")
        msg = (
            f"📋 *Aula experimental concluída - fazer fechamento!*\n\n"
            f"👤 {nome}\n🎸 {instr}\n📅 {data}\n\n"
            f"Entre em contato para converter em aluno!"
        )
        send_whatsapp(CHEFE_TEL, msg)
        rpc("marcar_experimental_concluida", {"p_aula_id": aula.get("aula_id")})
        log.info(f"Fechamento notificado: {nome}")


def alertas_faltas() -> None:
    """Sempre — detectar faltas e enviar alertas aprovados."""
    rpc("detectar_alertas_faltas")
    alertas = sb_get(
        "alertas_faltas_fila",
        {"status": "eq.aprovado", "enviado": "eq.false", "limit": "50"},
    )
    log.info(f"Alertas faltas aprovados: {len(alertas)}")
    for a in alertas:
        tel = normalizar_tel(a.get("telefone", ""))
        if not tel:
            continue
        if send_whatsapp(tel, a.get("mensagem", "")):
            sb_patch("alertas_faltas_fila", {"id": f"eq.{a['id']}"}, {"enviado": True})
            log.info(f"Alerta falta → {tel}")


def processar_disparos_programados(br: dt.datetime) -> None:
    """Sempre — processa disparos_programados conforme hora/recorrência."""
    br_hour = br.hour
    br_minute = br.minute
    br_dom = br.day
    # GitHub Actions / cron usa UTC; convertemos para BRT acima.
    # weekday(): Mon=0..Sun=6  →  JS style: Sun=0..Sat=6
    br_dow_js = (br.weekday() + 1) % 7
    br_date = br.date().isoformat()
    ref_mes = f"{MESES_PT[br.month - 1]} de {br.year}"

    disparos = sb_get("disparos_programados", {"ativo": "eq.true", "order": "created_at.asc"})
    log.info(f"Disparos programados ativos: {len(disparos)}")

    for d in disparos:
        recorrencia = (d.get("recorrencia") or "mensal").lower()
        disparar_agora = d.get("disparar_agora") is True
        deve = False

        if disparar_agora:
            deve = True
        else:
            hora_str = str(d.get("hora_disparo") or "09:00")[:5]
            try:
                h, m = map(int, hora_str.split(":"))
            except ValueError:
                continue
            if h != br_hour:
                continue
            if abs(m - br_minute) > 5:
                continue

            if recorrencia == "diario":
                deve = True
            elif recorrencia == "mensal":
                dia = d.get("dia_disparo")
                if dia and int(dia) != br_dom:
                    continue
                deve = True
            elif recorrencia == "semanal":
                dia_sem = d.get("dia_semana")
                if dia_sem is None:
                    continue
                if int(dia_sem) != br_dow_js:
                    continue
                deve = True
            elif recorrencia == "unico":
                data_unica = d.get("data_unica")
                if data_unica and str(data_unica)[:10] != br_date:
                    continue
                deve = True

        if not deve:
            continue

        # Buscar destinatários via RPC
        destinatarios = rpc("get_destinatarios_disparo", {
            "p_grupo_alvo": d.get("grupo_alvo") or "todos",
            "p_disparo_id": d["id"],
            "p_recorrencia": recorrencia,
        })
        if not isinstance(destinatarios, list):
            continue

        log.info(f'Disparo "{d["nome"]}": {len(destinatarios)} destinatários')
        enviados = 0

        for dest in destinatarios:
            tel = normalizar_tel(dest.get("telefone", "") or "")
            if not tel:
                continue

            nome     = (dest.get("nome") or "").split()[0] or "Aluno"
            instrumento = dest.get("instrumento_interesse") or "música"
            professor   = dest.get("professor_nome") or ""
            data_evento = ""
            if d.get("data_unica"):
                try:
                    data_evento = dt.date.fromisoformat(str(d["data_unica"])[:10]).strftime("%d/%m/%Y")
                except ValueError:
                    pass

            texto = (
                str(d.get("mensagem") or "")
                .replace("{nome}", nome)
                .replace("{instrumento}", instrumento)
                .replace("{telefone}", tel)
                .replace("{professor}", professor)
                .replace("{referencia_mes}", ref_mes)
                .replace("{data_evento}", data_evento)
            )

            if send_whatsapp(tel, texto):
                enviados += 1
                sb_post("disparos_programados_log", {
                    "disparo_id": d["id"],
                    "destinatario_id": dest.get("id"),
                    "destinatario_nome": dest.get("nome"),
                    "destinatario_telefone": tel,
                    "status": "enviado",
                })

        rpc("marcar_disparo_processado", {
            "p_disparo_id": d["id"],
            "p_total_enviados": enviados,
        })
        log.info(f'Disparo "{d["nome"]}": {enviados}/{len(destinatarios)} enviados')


def expirar_reposicoes() -> None:
    """Dia 1 do mês — expirar reposições do mês anterior."""
    rpc("expirar_reposicoes_mes_anterior")
    log.info("Reposições do mês anterior expiradas")


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    br = now_brt()
    log.info(f'Hora BRT: {br.strftime("%H:%M")} | Dia: {br.day} | DoW: {br.weekday()}')

    # Dia 1, 1h BRT — expirar reposições
    if br.day == 1 and br.hour == 1:
        try:
            expirar_reposicoes()
        except Exception as e:
            log.error(f"expirar_reposicoes: {e}")

    # Sempre — alertas de faltas
    try:
        alertas_faltas()
    except Exception as e:
        log.error(f"alertas_faltas: {e}")

    # 18h — lembretes amanhã
    if br.hour == 18:
        try:
            lembretes_amanha()
        except Exception as e:
            log.error(f"lembretes_amanha: {e}")

    # 5h–18h — confirmação 3h
    if 5 <= br.hour <= 18:
        try:
            confirmacao_3h()
        except Exception as e:
            log.error(f"confirmacao_3h: {e}")

    # 9h — follow-up experimental
    if br.hour == 9:
        try:
            followup_experimental()
        except Exception as e:
            log.error(f"followup_experimental: {e}")

    # 10h — fechamento
    if br.hour == 10:
        try:
            fechamento()
        except Exception as e:
            log.error(f"fechamento: {e}")

    # Sempre — disparos programados
    try:
        processar_disparos_programados(br)
    except Exception as e:
        log.error(f"processar_disparos_programados: {e}")

    log.info("Automações concluídas")


if __name__ == "__main__":
    main()
