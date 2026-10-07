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
import logging
import datetime as dt
import requests
from wa_utils import normalizar_tel, enviar_whatsapp as send_whatsapp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

SB_URL       = os.environ["SUPABASE_URL"]
SB_KEY       = os.environ["SUPABASE_SERVICE_KEY"]
CHEFE_TEL    = os.environ.get("CHEFE_TEL", "5551998042607")
ASAAS_KEY    = os.environ.get("ASAAS_API_KEY", "")
ASAAS_BASE   = "https://api.asaas.com/v3"

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


def registrar_log(action: str, status: str = "sucesso", level: str = "info", details: dict | None = None) -> None:
    """Grava no Controle de Logs (system_logs) — visível na tela /logs do CMMF."""
    sb_post("system_logs", {
        "user_nome": "GitHub Actions",
        "action": action,
        "entity": "automacoes",
        "details": details,
        "level": level,
        "status": status,
        "origem": "automacoes",
    })



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
    """Sempre — detectar faltas e enviar alertas aprovados. Liga/desliga e
    mensagem-padrão da detecção em lote (faltas consecutivas/no mês) são
    controlados pelo card 'Alerta de Faltas Consecutivas' em Disparos
    Programados (a mensagem avulsa em tempo real tem seu próprio card
    'Alerta de Falta Avulsa', lido direto pelo trigger no banco)."""
    cfg = buscar_config_disparo("alerta_falta_consecutiva")
    if cfg and not cfg.get("ativo"):
        log.info("Alerta de faltas consecutivas: desativado em Disparos Programados, pulando detecção")
    else:
        rpc("detectar_alertas_faltas")
    alertas = sb_get(
        "alertas_faltas_fila",
        {"status": "eq.aprovado", "limit": "50"},
    )
    log.info(f"Alertas faltas aprovados: {len(alertas)}")
    enviados = 0
    for a in alertas:
        tel = normalizar_tel(a.get("telefone", ""))
        if not tel:
            continue
        if send_whatsapp(tel, a.get("mensagem_sugerida", "")):
            sb_patch("alertas_faltas_fila", {"id": f"eq.{a['id']}"}, {"status": "enviado"})
            enviados += 1
            log.info(f"Alerta falta → {tel}")
    if enviados and cfg:
        rpc("marcar_disparo_processado", {"p_disparo_id": cfg["id"], "p_total_enviados": enviados})


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

    # Tipos disparados por trigger no banco (matrícula/primeira aula), nunca por lista.
    TIPOS_EVENTO_TRIGGER = {"boas_vindas", "personalizado", "avaliacao_google"}

    # Vencimento e cobrança são processados por função dedicada (dados reais por
    # aluno via tabela mensalidades) — nunca pelo motor genérico abaixo.
    # Alertas de falta são gerados numa fila que exige aprovação manual
    # (alertas_faltas_fila) e enviados só pela função alertas_faltas() —
    # nunca pelo motor genérico, que não respeita aprovação e mandaria pra
    # todo mundo do grupo_alvo de uma vez.
    # jornada_satisfacao (V85): tem RPC dedicada (buscar_alunos_para_pesquisa_satisfacao)
    # com controle de marco (30/90/180 dias) em pesquisas_satisfacao_marcos — o motor
    # genérico só sabe deduplicar "já mandou hoje", então mandaria pra TODOS os alunos
    # ativos TODO dia pra sempre se não fosse excluído aqui. Ainda não tem função Python
    # que processe esse tipo (pendente), então por enquanto fica só bloqueado.
    TIPOS_GERENCIADOS_SEPARADAMENTE = {
        "vencimento", "cobranca_atraso", "cobranca_regua",
        "alerta_falta_consecutiva", "alerta_falta_avulsa",
        "jornada_satisfacao",
    }

    for d in disparos:
        if d.get("tipo") in TIPOS_GERENCIADOS_SEPARADAMENTE:
            continue

        recorrencia = (d.get("recorrencia") or "mensal").lower()
        disparar_agora = d.get("disparar_agora") is True
        deve = False

        # Trava de segurança: recorrencia='unico' sem data_unica é convenção
        # para "disparo por evento" (ex.: boas-vindas/manual do aluno/avaliação
        # google, feito por trigger no banco). NUNCA deve virar blast pra todo
        # o grupo de uma vez, mesmo que disparar_agora tenha sido setado por
        # engano. Campanhas ad-hoc (promoção/comunicado) usam a mesma
        # combinação só que são disparadas manualmente pelo botão "Disparar
        # agora" — para essas, disparar_agora=true é o comportamento esperado.
        if recorrencia == "unico" and not d.get("data_unica") and d.get("tipo") in TIPOS_EVENTO_TRIGGER:
            if disparar_agora:
                log.warning(
                    f'Disparo "{d["nome"]}" é gatilho por evento (unico sem data) '
                    f'mas veio com disparar_agora=true — ignorando para evitar envio em massa.'
                )
                rpc("marcar_disparo_processado", {"p_disparo_id": d["id"], "p_total_enviados": 0})
            continue

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
            # Sem checagem de minuto: o cron roda 1x/hora mas com atraso
            # variável do GitHub Actions (às vezes 10-20min) — exigir minuto
            # próximo de "m" fazia o disparo nunca cair na janela e pular pra
            # sempre. Duplicidade já é evitada pelo log em get_destinatarios_disparo
            # (só retorna quem ainda não recebeu neste dia/semana/mês).

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
                if not data_unica:
                    # Sem data_unica: é disparo por trigger (boas-vindas) → não processar aqui
                    continue
                if str(data_unica)[:10] != br_date:
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


MESES_PT_LONGO = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
]


def reconciliar_assinaturas_asaas() -> None:
    """Liga a cobrança que o Asaas já gerou sozinho (assinatura recorrente) à
    mensalidade do mês, sem depender só do webhook (que pode chegar antes da
    mensalidade existir e nunca mais ser reprocessado). Roda todo dia — não
    cria cobrança nenhuma, só liga o que já existe no Asaas à linha certa."""
    if not ASAAS_KEY:
        log.info("Reconciliação assinaturas: ASAAS_API_KEY não configurada, pulando")
        return
    hoje = now_brt()
    referencia = hoje.strftime("%Y-%m-01")
    mes_prefixo = hoje.strftime("%Y-%m")

    sem_charge = sb_get("mensalidades", {
        "referencia": f"eq.{referencia}",
        "status": "in.(pendente,atrasado)",
        "asaas_charge_id": "is.null",
        "select": "id,aluno_id",
    })
    if not sem_charge:
        return
    aluno_ids = list({m["aluno_id"] for m in sem_charge if m.get("aluno_id")})
    if not aluno_ids:
        return
    alunos = sb_get("alunos", {
        "id": f"in.({','.join(aluno_ids)})",
        "asaas_subscription_id": "not.is.null",
        "select": "id,asaas_subscription_id",
    })
    sub_por_aluno = {a["id"]: a["asaas_subscription_id"] for a in alunos}
    linkados = 0
    for m in sem_charge:
        sub_id = sub_por_aluno.get(m["aluno_id"])
        if not sub_id:
            continue
        try:
            r = requests.get(f"{ASAAS_BASE}/payments", params={"subscription": sub_id, "limit": 10},
                              headers={"access_token": ASAAS_KEY}, timeout=15)
            pays = r.json().get("data", [])
        except Exception as e:
            log.error(f"Reconciliação assinatura {sub_id}: {e}")
            continue
        pay = next((p for p in pays if p.get("dueDate", "").startswith(mes_prefixo)), None)
        if not pay:
            continue
        sb_patch("mensalidades", {"id": f"eq.{m['id']}"}, {
            "asaas_charge_id": pay["id"],
            "asaas_payment_url": pay.get("invoiceUrl"),
            "asaas_billing_type": pay.get("billingType"),
        })
        linkados += 1
    if linkados:
        log.info(f"Reconciliação assinaturas: {linkados} mensalidade(s) ligada(s) à cobrança da assinatura")


def efetivar_cancelamentos_matricula() -> None:
    """1h BRT — efetiva cancelamentos programados cuja data chegou: a RPC já
    inativa a matrícula, cancela aulas futuras e cria a cobrança de encerramento
    (avulsa) no banco. Aqui só falta o que precisa de HTTP externo: cancelar a
    assinatura recorrente no Asaas e emitir a cobrança avulsa de fato."""
    resultado = rpc("efetivar_cancelamentos_pendentes")
    efetivados = (resultado or {}).get("efetivados") or []
    if not efetivados:
        return
    log.info(f"Cancelamentos de matrícula efetivados: {len(efetivados)}")

    for item in efetivados:
        aluno_nome = item.get("aluno_nome", "?")

        # Encerra a recorrência normal do aluno no Asaas (nunca apaga cobranças já existentes)
        sub_id = item.get("asaas_subscription_id")
        if sub_id and ASAAS_KEY:
            try:
                r = requests.delete(f"{ASAAS_BASE}/subscriptions/{sub_id}",
                                     headers={"access_token": ASAAS_KEY}, timeout=15)
                if r.ok:
                    sb_patch("alunos", {"id": f"eq.{item['aluno_id']}"}, {"asaas_subscription_id": None})
                    log.info(f"Assinatura Asaas encerrada (cancelamento programado) — {aluno_nome}")
                else:
                    log.error(f"Erro ao encerrar assinatura Asaas de {aluno_nome}: {r.text}")
            except Exception as e:
                log.error(f"Erro ao encerrar assinatura Asaas de {aluno_nome}: {e}")

        # Cobrança avulsa de encerramento (multa + aviso prévio) — nunca assinatura
        cobranca_id = item.get("cobranca_id")
        valor = item.get("valor") or 0
        if not cobranca_id or valor <= 0 or not ASAAS_KEY:
            continue
        try:
            customer_id = item.get("asaas_customer_id")
            if not customer_id:
                # sem customer no Asaas ainda — busca/cria pelo externalReference do aluno
                r = requests.get(f"{ASAAS_BASE}/customers", params={"externalReference": item["aluno_id"]},
                                  headers={"access_token": ASAAS_KEY}, timeout=15)
                found = (r.json() or {}).get("data") or []
                customer_id = found[0]["id"] if found else None
            if not customer_id:
                sb_patch("cobrancas_encerramento", {"id": f"eq.{cobranca_id}"}, {
                    "status": "erro_asaas", "erro_asaas": "Aluno sem asaas_customer_id",
                })
                continue

            r = requests.post(f"{ASAAS_BASE}/payments", headers={"access_token": ASAAS_KEY, "Content-Type": "application/json"},
                               json={
                                   "customer": customer_id,
                                   "billingType": "UNDEFINED",
                                   "value": float(valor),
                                   "dueDate": item.get("vencimento"),
                                   "description": f"Cobrança de encerramento de matrícula — {aluno_nome}",
                                   "externalReference": f"encerramento_{cobranca_id}",
                                   "notifications": [],
                               }, timeout=20)
            data = r.json()
            if r.ok:
                sb_patch("cobrancas_encerramento", {"id": f"eq.{cobranca_id}"}, {
                    "asaas_payment_id": data.get("id"),
                    "asaas_customer_id": customer_id,
                })
                log.info(f"Cobrança de encerramento criada no Asaas — {aluno_nome} (R$ {valor})")
            else:
                erro = data.get("errors", [{}])[0].get("description", str(data))
                sb_patch("cobrancas_encerramento", {"id": f"eq.{cobranca_id}"}, {
                    "status": "erro_asaas", "erro_asaas": erro,
                })
                log.error(f"Erro ao criar cobrança de encerramento de {aluno_nome}: {erro}")
        except Exception as e:
            log.error(f"Erro ao criar cobrança de encerramento de {aluno_nome}: {e}")
            sb_patch("cobrancas_encerramento", {"id": f"eq.{cobranca_id}"}, {
                "status": "erro_asaas", "erro_asaas": str(e),
            })


def buscar_config_disparo(tipo: str) -> dict | None:
    """Busca mensagem/regra/ativo editáveis na tela Disparos Programados para tipos
    que são processados por função dedicada (vencimento, cobranca_atraso) em vez
    do motor genérico. Usa dia_disparo como campo de regra (dias de antecedência
    ou dias mínimos de atraso, conforme o tipo)."""
    rows = sb_get("disparos_programados", {
        "tipo": f"eq.{tipo}",
        "select": "id,ativo,mensagem,dia_disparo",
        "limit": "1",
    })
    return rows[0] if rows else None


def lembretes_vencimento_mensalidade() -> None:
    """8h BRT — envia lembrete de vencimento. Mensagem, dias de antecedência e
    liga/desliga são controlados pelo card 'Lembrete Vencimento' em Disparos
    Programados (dia_disparo = dias de antecedência)."""
    cfg = buscar_config_disparo("vencimento")
    if not cfg or not cfg.get("ativo"):
        log.info("Lembrete vencimento: desativado em Disparos Programados, pulando")
        return
    dias_antes = cfg.get("dia_disparo") or 5
    template = cfg.get("mensagem") or ""

    registros = rpc("buscar_mensalidades_para_lembrete", {"p_dias_antes": dias_antes})
    if not isinstance(registros, list):
        return
    log.info(f"Lembretes vencimento mensalidade: {len(registros)}")
    enviados = 0
    for r in registros:
        tel = normalizar_tel(r.get("aluno_telefone", ""))
        if not tel:
            continue
        nome   = (r.get("aluno_nome") or "").split()[0] or "Aluno"
        instr  = r.get("instrumento") or "música"
        valor  = float(r.get("valor_liquido") or 0)
        venc   = r.get("data_vencimento", "")
        try:
            d, m_, y = venc.split("-")[2], venc.split("-")[1], venc.split("-")[0]
            venc_fmt = f"{d}/{m_}/{y}"
        except Exception:
            venc_fmt = venc

        link = r.get("asaas_payment_url")
        link_txt = f"📲 *Pagar agora (PIX ou cartão):*\n{link}" if link else "🏦 *PIX CNPJ:* 29.247.149/0001-51"

        msg = (
            template
            .replace("{nome}", nome)
            .replace("{instrumento}", instr)
            .replace("{valor}", f"{valor:,.2f}")
            .replace("{data_vencimento}", venc_fmt)
            .replace("{link_pagamento}", link_txt)
        )
        if send_whatsapp(tel, msg):
            rpc("marcar_notificacao_mensalidade", {
                "p_mensalidade_id": r["mensalidade_id"],
                "p_tipo": "vencimento",
            })
            sb_post("disparos_programados_log", {
                "disparo_id": cfg["id"],
                "disparo_nome": "Lembrete Vencimento",
                "destinatario_id": r.get("aluno_id"),
                "destinatario_nome": r.get("aluno_nome"),
                "destinatario_telefone": tel,
                "status": "enviado",
            })
            enviados += 1
            log.info(f"Lembrete vencimento mensalidade → {tel}")
    if enviados:
        rpc("marcar_disparo_processado", {"p_disparo_id": cfg["id"], "p_total_enviados": enviados})


def cobrar_inadimplentes_mensalidade() -> None:
    """8h BRT — cobra alunos com mensalidade atrasada. Mensagem, dias mínimos de
    atraso e liga/desliga são controlados pelo card 'Cobrança Mensalidade Atrasada'
    em Disparos Programados (dia_disparo = dias mínimos de atraso)."""
    cfg = buscar_config_disparo("cobranca_atraso")
    if not cfg or not cfg.get("ativo"):
        log.info("Cobrança atraso: desativado em Disparos Programados, pulando")
        return
    dias_min = cfg.get("dia_disparo") or 3
    template = cfg.get("mensagem") or ""

    registros = rpc("buscar_mensalidades_para_cobrar", {"p_dias_min": dias_min})
    if not isinstance(registros, list):
        return
    log.info(f"Cobranças inadimplentes: {len(registros)}")
    enviados = 0
    for r in registros:
        tel = normalizar_tel(r.get("aluno_telefone", ""))
        if not tel:
            continue
        nome       = (r.get("aluno_nome") or "").split()[0] or "Aluno"
        instr      = r.get("instrumento") or "música"
        valor      = float(r.get("valor_liquido") or 0)
        venc       = r.get("data_vencimento", "")
        dias       = int(r.get("dias_atraso") or 0)
        ref        = r.get("referencia", "")
        try:
            ref_mes = MESES_PT_LONGO[int(ref.split("-")[1]) - 1] + " de " + ref.split("-")[0]
        except Exception:
            ref_mes = ref
        try:
            d, m_, y = venc.split("-")[2], venc.split("-")[1], venc.split("-")[0]
            venc_fmt = f"{d}/{m_}/{y}"
        except Exception:
            venc_fmt = venc

        link = r.get("asaas_payment_url")
        link_txt = f"📲 *Regularizar agora (PIX ou cartão):*\n{link}" if link else "🏦 *PIX CNPJ:* 29.247.149/0001-51"

        msg = (
            template
            .replace("{nome}", nome)
            .replace("{instrumento}", instr)
            .replace("{referencia_mes}", ref_mes)
            .replace("{valor}", f"{valor:,.2f}")
            .replace("{data_vencimento}", venc_fmt)
            .replace("{dias_atraso}", f"{dias} dia{'s' if dias != 1 else ''}")
            .replace("{link_pagamento}", link_txt)
        )
        if send_whatsapp(tel, msg):
            rpc("marcar_notificacao_mensalidade", {
                "p_mensalidade_id": r["mensalidade_id"],
                "p_tipo": "cobranca",
            })
            sb_post("disparos_programados_log", {
                "disparo_id": cfg["id"],
                "disparo_nome": "Cobrança Mensalidade Atrasada",
                "destinatario_id": r.get("aluno_id"),
                "destinatario_nome": r.get("aluno_nome"),
                "destinatario_telefone": tel,
                "status": "enviado",
            })
            enviados += 1
            log.info(f"Cobrança inadimplente → {tel}")
    if enviados:
        rpc("marcar_disparo_processado", {"p_disparo_id": cfg["id"], "p_total_enviados": enviados})


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    br = now_brt()
    log.info(f'Hora BRT: {br.strftime("%H:%M")} | Dia: {br.day} | DoW: {br.weekday()}')
    erros: list[str] = []

    # 2h BRT — gera agendamentos reais (6 semanas) a partir da grade de horarios
    # + cancela agendamentos futuros orfaos (aluno removido do horario na grade)
    if br.hour == 2:
        try:
            r = rpc("gerar_agendamentos_recorrentes", {"p_dias_futuros": 42})
            log.info(f"gerar_agendamentos_recorrentes: {r}")
        except Exception as e:
            log.error(f"gerar_agendamentos_recorrentes: {e}")
            erros.append(f"gerar_agendamentos_recorrentes: {e}")
        try:
            r = rpc("limpar_agendamentos_orfaos")
            log.info(f"limpar_agendamentos_orfaos: {r}")
        except Exception as e:
            log.error(f"limpar_agendamentos_orfaos: {e}")
        try:
            r = rpc("cancelar_agendamentos_feriado")
            log.info(f"cancelar_agendamentos_feriado: {r}")
        except Exception as e:
            log.error(f"cancelar_agendamentos_feriado: {e}")
            erros.append(f"limpar_agendamentos_orfaos: {e}")

    # Dia 1, 1h BRT — expirar reposições
    if br.day == 1 and br.hour == 1:
        try:
            expirar_reposicoes()
        except Exception as e:
            log.error(f"expirar_reposicoes: {e}")
            erros.append(f"expirar_reposicoes: {e}")

    # 1h BRT — efetivar cancelamentos de matrícula programados p/ hoje ou antes
    if br.hour == 1:
        try:
            efetivar_cancelamentos_matricula()
        except Exception as e:
            log.error(f"efetivar_cancelamentos_matricula: {e}")
            erros.append(f"efetivar_cancelamentos_matricula: {e}")

    # Sempre — alertas de faltas
    try:
        alertas_faltas()
    except Exception as e:
        log.error(f"alertas_faltas: {e}")
        erros.append(f"alertas_faltas: {e}")

    # 18h — lembretes amanhã
    if br.hour == 18:
        try:
            lembretes_amanha()
        except Exception as e:
            log.error(f"lembretes_amanha: {e}")
            erros.append(f"lembretes_amanha: {e}")

    # 5h–18h — confirmação 3h
    if 5 <= br.hour <= 18:
        try:
            confirmacao_3h()
        except Exception as e:
            log.error(f"confirmacao_3h: {e}")
            erros.append(f"confirmacao_3h: {e}")

    # 9h — follow-up experimental
    if br.hour == 9:
        try:
            followup_experimental()
        except Exception as e:
            log.error(f"followup_experimental: {e}")
            erros.append(f"followup_experimental: {e}")

    # 10h — fechamento
    if br.hour == 10:
        try:
            fechamento()
        except Exception as e:
            log.error(f"fechamento: {e}")
            erros.append(f"fechamento: {e}")

    # 8h — marcar mensalidades atrasadas + lembretes vencimento + cobrança inadimplentes
    if br.hour == 8:
        try:
            rpc("marcar_mensalidades_atrasadas")
            log.info("marcar_mensalidades_atrasadas executado")
        except Exception as e:
            log.error(f"marcar_mensalidades_atrasadas: {e}")
            erros.append(f"marcar_mensalidades_atrasadas: {e}")
        try:
            reconciliar_assinaturas_asaas()
        except Exception as e:
            log.error(f"reconciliar_assinaturas_asaas: {e}")
            erros.append(f"reconciliar_assinaturas_asaas: {e}")
        try:
            lembretes_vencimento_mensalidade()
        except Exception as e:
            log.error(f"lembretes_vencimento_mensalidade: {e}")
            erros.append(f"lembretes_vencimento_mensalidade: {e}")
        try:
            cobrar_inadimplentes_mensalidade()
        except Exception as e:
            log.error(f"cobrar_inadimplentes_mensalidade: {e}")
            erros.append(f"cobrar_inadimplentes_mensalidade: {e}")

    # Sempre — disparos programados
    try:
        processar_disparos_programados(br)
    except Exception as e:
        log.error(f"processar_disparos_programados: {e}")
        erros.append(f"processar_disparos_programados: {e}")

    if erros:
        registrar_log("execucao_automacoes", status="erro", level="error", details={"erros": erros})
    else:
        registrar_log("execucao_automacoes", status="sucesso", level="info", details={"hora_brt": br.strftime("%H:%M")})

    log.info("Automações concluídas")


if __name__ == "__main__":
    main()
