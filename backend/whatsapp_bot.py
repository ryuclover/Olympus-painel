"""
whatsapp_bot.py — Serviço de conexão e automação contínua com WhatsApp.
Permite pareamento por QR Code oficial, leitura de mensagens com buffer de debounce,
geração de resposta via NVIDIA Nemotron 3.5 Super e disparo de alerta de reuniões marcadas.
"""
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

import db
import ia
import reunioes_service
from telefone_util import limpar_digitos
import whatsapp_playwright

logger = logging.getLogger(__name__)


def obter_estado() -> dict:
    return whatsapp_playwright.obter_estado()


def get_whatsapp_data_dir() -> Path:
    return whatsapp_playwright.get_whatsapp_data_dir()


# ---------------------------------------------------------------------------
# Gerenciador Modular de Buffer de Debounce
# ---------------------------------------------------------------------------

class DebounceManager:
    """Agrupa mensagens rápidas recebidas em sequência antes de chamar o modelo de IA."""

    def __init__(self, delay_segundos: int = 15):
        self.delay_segundos = delay_segundos
        self._buffers: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def adicionar(self, chave: str, item: str, callback: Callable[[List[str]], None]):
        with self._lock:
            if chave not in self._buffers:
                self._buffers[chave] = {
                    "itens": [],
                    "timer": None
                }
            self._buffers[chave]["itens"].append(item)

            # Cancela timer anterior se o lead ainda estiver digitando
            existente = self._buffers[chave].get("timer")
            if existente and existente.is_alive():
                existente.cancel()

            def _disparar():
                with self._lock:
                    dados = self._buffers.pop(chave, None)
                if dados and dados.get("itens"):
                    callback(dados["itens"])

            t = threading.Timer(self.delay_segundos, _disparar)
            self._buffers[chave]["timer"] = t
            t.daemon = True
            t.start()

    def cancelar(self, chave: Optional[str] = None):
        with self._lock:
            if chave:
                dados = self._buffers.pop(chave, None)
                if dados and dados.get("timer"):
                    dados["timer"].cancel()
            else:
                for dados in self._buffers.values():
                    if dados.get("timer"):
                        dados["timer"].cancel()
                self._buffers.clear()


_debounce_mensagens = DebounceManager(delay_segundos=12)


# ---------------------------------------------------------------------------
# Envio e Notificação
# ---------------------------------------------------------------------------

def enfileirar_mensagem(telefone: str, texto: str) -> bool:
    """Enfileira mensagem na tabela fila_whatsapp para envio seguro."""
    conn = db.conectar()
    try:
        conn.execute(
            """
            INSERT INTO fila_whatsapp (lead_id, nome, telefone, mensagem, status, agendado_para, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 'pendente', datetime('now'), datetime('now'), datetime('now'))
            """,
            ("alerta_sistema", "Alerta Sistema", telefone, texto)
        )
        conn.commit()
        return True
    except Exception as e:
        logger.exception("Erro ao enfileirar mensagem de WhatsApp: %s", e)
        return False
    finally:
        conn.close()


def notificar_admin_reuniao(
    lead_nome: str,
    data_reuniao: str,
    horario_reuniao: str,
    telefone_cliente: str,
    categoria: str = "",
    cidade: str = ""
) -> bool:
    """Envia um alerta instantâneo para o WhatsApp pessoal do dono quando uma reunião é fechada."""
    admin_phone = db.obter_config("whatsapp_admin_notificacao")
    if not admin_phone:
        logger.info("Nenhum telefone de admin configurado para alertas de reunião.")
        return False

    msg = reunioes_service.formatar_alerta_reuniao_admin(
        lead_nome=lead_nome,
        data_reuniao=data_reuniao,
        horario_reuniao=horario_reuniao,
        telefone_cliente=telefone_cliente,
        categoria=categoria,
        cidade=cidade
    )
    logger.info("Enviando alerta de reunião para admin %s", admin_phone)
    return enfileirar_mensagem(admin_phone, msg)


# ---------------------------------------------------------------------------
# Processamento com IA
# ---------------------------------------------------------------------------

def processar_resposta_lead_com_ia(
    telefone: str,
    mensagens_recentes: List[str] = None,
    historico_completo: List[dict] = None,
    enfileirar: bool = False,
    salvar_reuniao_real: bool = False
):
    """Processa a conversa de um lead com o Nemotron 3.5 Super de forma segura."""
    tel_norm = limpar_digitos(telefone)
    conn = db.conectar()
    lead = None
    try:
        linhas = conn.execute("SELECT * FROM leads WHERE telefone LIKE ?", (f"%{tel_norm}%",)).fetchall()
        if linhas:
            lead = dict(linhas[0])
    finally:
        conn.close()

    if not lead:
        lead = {"nome": "Cliente", "categoria": "Negócio Local", "telefone": telefone, "site_status": "desconhecido"}

    if historico_completo:
        historico = historico_completo
    else:
        # Reconstrói histórico real: o que já enviamos para ele + o que ele mandou agora
        conn = db.conectar()
        historico = []
        try:
            anteriores = conn.execute(
                """
                SELECT mensagem, criado_em FROM fila_whatsapp 
                WHERE telefone LIKE ? AND status = 'enviado' 
                  AND mensagem NOT LIKE '%Olympus Alerta%'
                ORDER BY id ASC
                """,
                (f"%{tel_norm}%",)
            ).fetchall()
            for row in anteriores:
                historico.append({
                    "autor": "vendedor",
                    "texto": row["mensagem"],
                    "enviada_em": row["criado_em"]
                })
        except Exception as e_hist:
            logger.warning("Erro ao carregar histórico anterior da fila_whatsapp: %s", e_hist)
        finally:
            conn.close()

        mensagens = mensagens_recentes or []
        for m in mensagens:
            historico.append({
                "autor": "lead",
                "texto": m,
                "enviada_em": datetime.now().isoformat()
            })

    try:
        analise, provedor, _ = ia.analisar_conversa_com_fallback(lead, historico)
        resposta_sugerida = analise.get("resposta_sugerida", "")
        reuniao = analise.get("reuniao_detectada") or {}
        logger.info("[IA CONVERSA] Lead %s analisado. Estagio: '%s'. Resposta sugerida (%d chars): '%s'", 
                    telefone, analise.get('estagio'), len(resposta_sugerida), resposta_sugerida[:80])

        if reuniao.get("detectada") and salvar_reuniao_real:
            data_sug = reuniao.get("data_sugerida") or datetime.now().strftime("%Y-%m-%d")
            hora_sug = reuniao.get("horario_sugerido") or "14:00"
            lead_id = lead.get("place_id") or ""
            lead_nome = lead.get("nome") or "Cliente"

            reunioes_service.salvar_reuniao(
                lead_id=lead_id,
                lead_nome=lead_nome,
                telefone=telefone,
                canal="whatsapp",
                titulo=f"Reunião com {lead_nome}",
                data_reuniao=data_sug,
                horario_reuniao=hora_sug,
                notas="Agendado via IA autônoma",
            )

            if enfileirar:
                notificar_admin_reuniao(
                    lead_nome=lead_nome,
                    data_reuniao=data_sug,
                    horario_reuniao=hora_sug,
                    telefone_cliente=telefone,
                    categoria=lead.get("categoria", ""),
                    cidade=lead.get("cidade", "")
                )

        # Se o lead recusou ou desinteressou, desiste e cancela mensagens futuras
        estagio = analise.get("estagio", "")
        if estagio in ("desistencia", "esfriou"):
            logger.info("Lead %s classificado como %s. Encerrando prospecção sem insistir.", telefone, estagio)
            conn = db.conectar()
            try:
                if lead.get("place_id"):
                    conn.execute(
                        "UPDATE leads SET status = 'ignorado', observacoes = COALESCE(observacoes, '') || ' [Lead recusou/desistência]' WHERE place_id = ?",
                        (lead["place_id"],)
                    )
                conn.execute(
                    "UPDATE fila_whatsapp SET status = 'cancelado', erro = 'Cancelado: lead recusou contato' WHERE telefone LIKE ? AND status = 'pendente'",
                    (f"%{tel_norm}%",)
                )
                conn.commit()
            except Exception as e_bd:
                logger.warning("Erro ao atualizar status de desistência no banco: %s", e_bd)
            finally:
                conn.close()

            # Se o lead foi ríspido ou pediu parada expressa, nem sequer envia despedida
            ultima_msg = (mensagens_recentes[-1] if mensagens_recentes else "").lower()
            parar_total = any(termo in ultima_msg for termo in [
                "nao mande mais", "não mande mais", "tire meu numero", "tire meu número",
                "pare", "para de mandar", "bloquear", "vou denunciar", "remover meu contato"
            ])
            if parar_total:
                resposta_sugerida = ""
                logger.info("Lead %s pediu exclusão expressa. Nenhuma mensagem será disparada.", telefone)

        logger.info("[IA CONVERSA] Pronto para despacho: resposta_sugerida=%s (len=%d), enfileirar=%s", 
                    bool(resposta_sugerida), len(resposta_sugerida), enfileirar)
        if resposta_sugerida and enfileirar:
            # Tenta despacho direto se o WhatsApp estiver conectado
            status_wa = whatsapp_playwright.obter_estado()
            if status_wa.get("conectado"):
                sucesso_envio, msg_envio = whatsapp_playwright.despachar_mensagem_direta(telefone, resposta_sugerida)
                if sucesso_envio:
                    conn = db.conectar()
                    try:
                        conn.execute(
                            """
                            INSERT INTO fila_whatsapp (lead_id, nome, telefone, mensagem, status, enviado_em, agendado_para, criado_em, atualizado_em)
                            VALUES (?, ?, ?, ?, 'enviado', datetime('now'), datetime('now'), datetime('now'), datetime('now'))
                            """,
                            (lead.get("place_id") or "lead_chat", lead.get("nome") or "Cliente", telefone, resposta_sugerida)
                        )
                        conn.commit()
                    finally:
                        conn.close()
                    logger.info("Resposta direta enviada com sucesso no WhatsApp para %s: '%s'", telefone, resposta_sugerida[:60])
                else:
                    enfileirar_mensagem(telefone, resposta_sugerida)
                    logger.warning("Despacho direto falhou (%s), enfileirando resposta para %s", msg_envio, telefone)
            else:
                enfileirar_mensagem(telefone, resposta_sugerida)
                logger.info("Resposta do Nemotron enfileirada para %s: '%s'", telefone, resposta_sugerida[:60])

        return {
            "ok": True,
            "analise": analise,
            "resposta_sugerida": resposta_sugerida,
            "reuniao_detectada": reuniao,
            "provedor": provedor,
        }

    except Exception as e:
        logger.exception("Erro ao processar mensagem do lead com Nemotron: %s", e)
        # Se a chamada à IA falhou, limpa o cache de mensagens processadas para reprocessar o lead
        try:
            whatsapp_playwright.limpar_memoria_mensagens()
        except Exception:
            pass
        return {"ok": False, "erro": str(e)}


def receber_mensagem_webhook(telefone: str, texto: str):
    """Recebe mensagem externa ou do leitor e coloca no buffer de debounce de 35s."""
    tel_norm = limpar_digitos(telefone)
    _debounce_mensagens.adicionar(
        chave=tel_norm,
        item=texto,
        callback=lambda msgs: processar_resposta_lead_com_ia(
            telefone=telefone,
            mensagens_recentes=msgs,
            enfileirar=True,
            salvar_reuniao_real=True
        )
    )


def simular_ou_iniciar_bot() -> bool:
    """Ativa o serviço autônomo do WhatsApp com Playwright e detecção de QR Code."""
    logger.info("Iniciando serviço WhatsApp Autônomo com Playwright...")
    return whatsapp_playwright.iniciar_sessao_whatsapp(
        ao_receber_mensagem=receber_mensagem_webhook
    )


def parar_bot() -> bool:
    """Para o serviço do bot, desconecta o navegador e cancela buffers pendentes."""
    _debounce_mensagens.cancelar()
    ok = whatsapp_playwright.parar_sessao_whatsapp()
    logger.info("Serviço WhatsApp Autônomo desativado.")
    return ok


def gerar_abordagem_inicial(telefone: str, nome: str = "", categoria: str = "") -> dict:
    """Gera uma mensagem de primeiro contato altamente personalizada usando o Guia de Vendas e o Nemotron."""
    nome_lead = (nome or "Olá").strip()
    categoria_lead = (categoria or "Negócio Local").strip()
    lead_fake = {
        "nome": nome_lead,
        "categoria": categoria_lead,
        "telefone": telefone,
        "site_status": "desconhecido"
    }

    empresa_nome = "TimeSaver Tecnologia em Saúde"
    try:
        g = json.loads(db.obter_config("guia_vendas_ia") or "{}")
        if g.get("empresa_nome"):
            empresa_nome = g["empresa_nome"]
    except Exception:
        pass

    try:
        analise, provedor, _ = ia.analisar_conversa_com_fallback(lead_fake, [])
        resposta = analise.get("resposta_sugerida") or ""

        # Sanitização de segurança: Primeiro contato NUNCA pode ter proposta de reunião nem menção a agendamento
        termos_proibidos = ["15 minutos", "10 minutos", "reunião", "reuniao", "agendar", "call de", "disponibilidade nesta", "disponibilidade amanhã"]
        if any(t in resposta.lower() for t in termos_proibidos):
            logger.info("Abordagem gerada pela IA continha menção a agendamento de reunião. Ajustando para contato com apresentação de autoridade.")
            resposta = f"Olá, {nome_lead}! Tudo bem?\n\nSou o Gabriel da {empresa_nome}. Ajudamos clínicas médicas a eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático. Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?"

        if not resposta:
            resposta = f"Olá, {nome_lead}! Tudo bem?\n\nSou o Gabriel da {empresa_nome}. Ajudamos clínicas médicas a eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático. Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?"
        return {"ok": True, "mensagem": resposta, "provedor": provedor}
    except Exception as e:
        logger.warning("Falha ao gerar abordagem com IA: %s", e)
        fallback = f"Olá, {nome_lead}! Tudo bem?\n\nSou o Gabriel da {empresa_nome}. Ajudamos clínicas médicas a eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático. Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?"
        return {"ok": True, "mensagem": fallback, "provedor": "fallback"}


def iniciar_conversa_alvo(telefone: str, mensagem: str, nome: str = "", categoria: str = "") -> dict:
    """Registra o lead e dispara a primeira mensagem pelo WhatsApp Web do Playwright."""
    tel_norm = limpar_digitos(telefone)
    if not tel_norm:
        return {"ok": False, "erro": "Telefone inválido ou não informado."}

    nome_lead = (nome or "Contato Direto").strip()
    categoria_lead = (categoria or "Negócio").strip()
    place_id_custom = f"alvo_{tel_norm}"

    # Salva ou atualiza no CRM
    conn = db.conectar()
    try:
        conn.execute(
            """
            INSERT INTO leads (place_id, nome, categoria, telefone, status, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 'abordado', datetime('now'), datetime('now'))
            ON CONFLICT(place_id) DO UPDATE SET
                nome = excluded.nome,
                categoria = excluded.categoria,
                telefone = excluded.telefone,
                status = 'abordado',
                atualizado_em = datetime('now')
            """,
            (place_id_custom, nome_lead, categoria_lead, telefone)
        )
        conn.commit()
    finally:
        conn.close()

    # Tenta despachar diretamente pelo WhatsApp Web ativo
    status_wa = whatsapp_playwright.obter_estado()
    if status_wa.get("conectado"):
        sucesso, msg_status = whatsapp_playwright.despachar_mensagem_direta(telefone, mensagem)
        if sucesso:
            # Registra no histórico da fila como enviado
            enfileirar_mensagem(telefone, mensagem)
            conn = db.conectar()
            try:
                conn.execute(
                    "UPDATE fila_whatsapp SET status = 'enviado', enviado_em = datetime('now') WHERE telefone LIKE ? AND status = 'pendente'",
                    (f"%{tel_norm}%",)
                )
                conn.commit()
            finally:
                conn.close()

            return {
                "ok": True,
                "canal": "whatsapp_direto",
                "mensagem_enviada": mensagem,
                "telefone": telefone,
                "status": "Disparado com sucesso pelo WhatsApp Web!"
            }
        else:
            return {"ok": False, "erro": f"Erro no envio pelo navegador: {msg_status}"}

    # Se não estiver conectado, enfileira
    enfileirar_mensagem(telefone, mensagem)
    return {
        "ok": True,
        "canal": "fila_pendente",
        "mensagem_enviada": mensagem,
        "telefone": telefone,
        "status": "WhatsApp Web offline no momento. Mensagem adicionada à fila para envio assim que conectar."
    }


def reiniciar_chat_lead(telefone: str, reenviar_abordagem: bool = True, nome: str = "Gabriel", categoria: str = "Clínica Médica") -> dict:
    """Limpa todo o histórico de conversa com o lead no banco de dados e reseta a memória do robô."""
    tel_norm = limpar_digitos(telefone)
    _debounce_mensagens.cancelar()
    whatsapp_playwright.limpar_memoria_mensagens()

    # 1. Limpa do banco de dados (fila_whatsapp, reunioes e leads)
    conn = db.conectar()
    try:
        conn.execute("DELETE FROM fila_whatsapp WHERE telefone LIKE ?", (f"%{tel_norm}%",))
        conn.execute("DELETE FROM reunioes WHERE telefone LIKE ?", (f"%{tel_norm}%",))
        conn.execute("UPDATE leads SET status = 'novo', observacoes = NULL WHERE telefone LIKE ?", (f"%{tel_norm}%",))
        conn.commit()
    finally:
        conn.close()

    # 2. Tenta limpar visualmente o chat no WhatsApp Web se estiver aberto
    try:
        whatsapp_playwright.executar_no_navegador(whatsapp_playwright._limpar_chat_ativo_no_navegador, timeout=8)
    except Exception as e:
        logger.debug("Tentativa de limpar chat no navegador: %s", e)

    # 3. Dispara nova abordagem inicial com o novo tom profissional (máximo 2 bolhas)
    if reenviar_abordagem:
        gerado = gerar_abordagem_inicial(telefone, nome=nome, categoria=categoria)
        msg_nova = gerado.get("mensagem")
        if not msg_nova:
            msg_nova = f"Olá, {nome}! Tudo bem?\n\nSou o Gabriel da TimeSaver Tecnologia em Saúde. Ajudamos clínicas médicas a eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático. Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?"

        partes = [p.strip() for p in msg_nova.split("\n\n") if p.strip()]
        if len(partes) > 2:
            partes = [partes[0], " ".join(partes[1:])]
            msg_nova = "\n\n".join(partes)

        disp = iniciar_conversa_alvo(telefone, msg_nova, nome=nome, categoria=categoria)
        return {
            "ok": True,
            "mensagem": "Chat resetado e nova abordagem profissional enviada!",
            "abordagem_enviada": msg_nova,
            "status_disparo": disp
        }

    return {"ok": True, "mensagem": "Histórico do chat apagado com sucesso."}


