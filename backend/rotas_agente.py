"""
rotas_agente.py — Endpoints para o Agente Autônomo comercial, Modo Questionamento
(Entrevista do Negócio), Guia de Respostas e Gestão de Reuniões.
"""
import json
import logging
from flask import Blueprint, jsonify, request

import db
import ia
import reunioes_service

logger = logging.getLogger(__name__)
bp = Blueprint("agente", __name__)


# ---------------------------------------------------------------------------
# Configurações do Agente & Guia de Vendas
# ---------------------------------------------------------------------------

DEFAULT_GUIA_VENDAS = {
    "empresa_nome": "Minha Agência / Consultoria",
    "servicos_oferecidos": "Criação de sites de alta conversão, reformulação de sites antigos e posicionamento no Google",
    "faixa_preco": "A partir de R$ 980 à vista ou 12x no cartão",
    "formas_pagamento": "Pix à vista com 10% de desconto ou cartão de crédito parcelado",
    "nicho_alvo": "Pequenas e médias empresas locais (clínicas, escritórios, comércio, oficinas)",
    "dor_principal": "Empresas perdendo clientes diariamente por não terem site profissional ou site que não abre no celular",
    "objetivo_conversao": "reuniao", # "reuniao", "fechamento_direto" ou "hibrido"
    "dias_horarios_reuniao": "Sexta-feira às 14h ou 16h, ou terças e quintas das 14h às 17h",
    "tom_conversa": "profissional", # "profissional" (base), "amigavel" ou "formal"
    "estrategia_preco": "sem_valor", # "sem_valor" (padrão - apenas reunião), "margem" ou "especifico"
    "respostas_prontas": {
        "interesse": "Que excelente notícia que você teve interesse! Para te mostrar um exemplo prático já adaptado para o seu negócio e tirar dúvidas, você teria 15 minutos disponíveis nesta {sugestao_horario}? Fica bom para você?",
        "preco_caro": "Compreendo perfeitamente sua preocupação com o investimento. No entanto, hoje a maioria dos seus clientes busca pelo seu serviço no Google e no celular antes de comprar. Nosso trabalho se paga logo nos primeiros clientes novos que você recebe através do site. Conseguimos facilitar o pagamento em até 12x para caber no fluxo do seu negócio.",
        "ja_tem_site": "Que ótimo que você já tem uma estrutura inicial! Nossa proposta não é substituir o que você já construiu, mas sim otimizar a velocidade, colocar botão direto de WhatsApp e garantir que você apareça melhor nas buscas locais do Google quando alguém procurar pelo seu segmento na sua cidade.",
        "sem_tempo": "Sem problemas! Imagino que sua rotina esteja corrida. Que tal eu te mandar um resumo rápido em PDF de 1 página e retomamos o contato na semana que vem? Qual o melhor dia para você?",
        "fechamento_direto": "Perfeito! Para darmos início ao desenvolvimento do seu projeto hoje mesmo, precisamos apenas da confirmação do nome fantasia e da entrada via Pix com 10% de desconto. Podemos gerar a sua proposta agora?",
        "recusa_desistencia": "Sem problemas! Agradeço de verdade pelo seu retorno e pela atenção. Caso precise no futuro, ficamos à sua total disposição. Um abraço e excelente semana!"
    }
}


@bp.route("/api/agente/config", methods=["GET"])
def obter_config_agente():
    """Retorna todas as configurações da estratégia do agente autônomo."""
    raw_guia = db.obter_config("guia_vendas_ia")
    guia = DEFAULT_GUIA_VENDAS
    if raw_guia:
        try:
            guia = json.loads(raw_guia)
        except Exception:
            pass

    return jsonify({
        "guia_vendas": guia,
        "whatsapp_admin_notificacao": db.obter_config("whatsapp_admin_notificacao") or "",
        "provedor_ia_preferido": db.obter_config("provedor_ia_preferido") or "nvidia",
        "nvidia_model": db.obter_config("nvidia_model") or ia.MODELO_NVIDIA_PADRAO,
        "nvidia_configurada": bool(db.obter_config("nvidia")),
    })


@bp.route("/api/agente/config", methods=["POST"])
def salvar_config_agente():
    """Salva a estratégia do agente e parâmetros de operação."""
    dados = request.json or {}
    
    if "guia_vendas" in dados:
        db.salvar_config("guia_vendas_ia", json.dumps(dados["guia_vendas"], ensure_ascii=False, indent=2))
    
    if "whatsapp_admin_notificacao" in dados:
        db.salvar_config("whatsapp_admin_notificacao", str(dados["whatsapp_admin_notificacao"]).strip())

    if "provedor_ia_preferido" in dados:
        db.salvar_config("provedor_ia_preferido", str(dados["provedor_ia_preferido"]).strip())

    if "nvidia_model" in dados:
        db.salvar_config("nvidia_model", str(dados["nvidia_model"]).strip())

    return jsonify({"ok": True, "mensagem": "Configurações do Agente salvas com sucesso!"})


# ---------------------------------------------------------------------------
# Modo Questionamento (Entrevista com IA para Onboarding)
# ---------------------------------------------------------------------------

SYSTEM_ENTREVISTADOR = """Você é o Consultor Comercial Chefe do Olympus Painel.
Seu objetivo é conduzir uma entrevista rápida, amigável e estratégica com o usuário para descobrir o modelo de negócio dele e estruturar o Agente Autônomo de Vendas (AI SDR).

Regras da Entrevista:
1. Faça UMA pergunta de cada vez para não sobrecarregar o usuário.
2. Seja direto, profissional e encorajador.
3. As etapas que você precisa cobrir são:
   - 1. O que ele vende / principais serviços;
   - 2. Faixa de investimento (preços) e facilidades de pagamento;
   - 3. Público-alvo ideal e dores que ele resolve;
   - 4. Objetivo prioritário da abordagem (fechar direto no Pix/link ou agendar reunião rápida de 15 min);
   - 5. Dias e horários preferenciais para reuniões.
4. Quando tiver coletado as informações necessárias (após 4 a 6 trocas de mensagens), encerre a entrevista informando que o perfil foi traçado com sucesso e devolva um resumo estruturado."""

@bp.route("/api/agente/entrevista", methods=["POST"])
def conversar_entrevista():
    """Conduz a entrevista interativa entre o usuário e o Nemotron."""
    dados = request.json or {}
    historico = dados.get("historico", [])
    mensagem_usuario = dados.get("mensagem", "").strip()

    if not mensagem_usuario and not historico:
        # Mensagem de abertura
        abertura = (
            "Olá! Sou o seu Consultor Comercial do Olympus. Estou aqui para calibrar o seu Agente Autônomo de Vendas.\n\n"
            "Para começarmos: **Qual é o seu negócio ou agência e o que exatamente você oferece para seus clientes?**"
        )
        return jsonify({"resposta": abertura, "concluida": False})

    # Monta o prompt com histórico
    linhas = []
    for h in historico:
        papel = "USUÁRIO" if h.get("autor") == "usuario" else "CONSULTOR"
        linhas.append(f"{papel}: {h.get('texto', '')}")
    if mensagem_usuario:
        linhas.append(f"USUÁRIO: {mensagem_usuario}")

    prompt_user = (
        "Histórico da entrevista até agora:\n"
        + "\n".join(linhas)
        + "\n\nResponda como o Consultor Comercial, avaliando a resposta do usuário e fazendo a próxima pergunta estratégica ou concluindo se já tiver informações suficientes."
    )

    try:
        resposta, provedor, avisos = ia.executar_com_fallback(
            system=SYSTEM_ENTREVISTADOR,
            user=prompt_user,
            descricao_log="entrevista agente",
            temperatura=0.7
        )
        concluida = "perfil foi traçado" in resposta.lower() or "estratégia pronta" in resposta.lower() or len(historico) >= 8
        return jsonify({
            "resposta": resposta,
            "provedor": provedor,
            "concluida": concluida,
            "avisos": avisos
        })
    except Exception as e:
        logger.exception("Erro na entrevista com IA")
        return jsonify({"erro": f"Erro ao consultar o motor de IA: {e}"}), 500


@bp.route("/api/agente/gerar-guia-automatico", methods=["POST"])
def gerar_guia_automatico():
    """Gera um Guia de Vendas e Respostas Prontas completo com IA a partir das informações do negócio."""
    dados = request.json or {}
    servico = dados.get("servico", "Criação de Sites Profissionais")
    preco = dados.get("preco", "R$ 1.500")
    nicho = dados.get("nicho", "Comércio e Clínicas Locais")
    objetivo = dados.get("objetivo", "reuniao")
    horarios = dados.get("horarios", "Sexta-feira às 14h ou 16h")

    system = """Você é um especialista em Copywriting e Vendas B2B para WhatsApp.
Gere um Guia de Respostas e Objeções para um Agente Autônomo de Vendas no Brasil.
Responda EXATAMENTE um JSON válido com esta estrutura:
{
  "empresa_nome": "Nome da agência ou consultoria",
  "servicos_oferecidos": "descrição clara",
  "faixa_preco": "faixa informada",
  "formas_pagamento": "opções de pagamento",
  "nicho_alvo": "nicho informado",
  "dor_principal": "principal dor resolvida",
  "objetivo_conversao": "reuniao ou fechamento_direto",
  "dias_horarios_reuniao": "dias informados",
  "respostas_prontas": {
    "interesse": "mensagem acolhendo o interesse e propondo a reunião ou fechamento",
    "preco_caro": "contorno focado no retorno sobre investimento",
    "ja_tem_site": "contorno valorizando o que tem mas mostrando o diferencial",
    "sem_tempo": "follow-up leve dando saída fácil",
    "fechamento_direto": "mensagem de fechamento com condições"
  }
}"""

    user = f"""Dados do negócio:
- Serviço: {servico}
- Preço médio: {preco}
- Nicho alvo: {nicho}
- Objetivo: {objetivo}
- Janela de Reuniões: {horarios}

Gere o JSON estruturado para o guia do Agente Autônomo."""

    try:
        resposta, provedor, avisos = ia.executar_com_fallback(
            system=system,
            user=user,
            formato_json=True,
            descricao_log="gerar guia vendas automatico",
            temperatura=0.3
        )
        limpa = resposta.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        guia_gerado = json.loads(limpa)
        db.salvar_config("guia_vendas_ia", json.dumps(guia_gerado, ensure_ascii=False, indent=2))
        return jsonify({"ok": True, "guia": guia_gerado, "provedor": provedor})
    except Exception as e:
        logger.exception("Falha ao gerar guia com IA")
        return jsonify({"erro": str(e)}), 500


# ---------------------------------------------------------------------------
# Gestão de Reuniões Agendadas
# ---------------------------------------------------------------------------

@bp.route("/api/reunioes", methods=["GET"])
def listar_reunioes():
    """Retorna todas as reuniões agendadas ou finalizadas."""
    return jsonify(reunioes_service.listar_reunioes())


@bp.route("/api/reunioes", methods=["POST"])
def criar_reuniao():
    """Cria uma reunião, atualiza o lead para status 'reuniao' e pode disparar alerta no WhatsApp do dono."""
    dados = request.json or {}
    data_reuniao = str(dados.get("data_reuniao", "")).strip()
    horario_reuniao = str(dados.get("horario_reuniao", "")).strip()

    if not data_reuniao or not horario_reuniao:
        return jsonify({"erro": "Informe data e horário da reunião"}), 400

    lead_id = str(dados.get("lead_id", "")).strip()
    lead_nome = str(dados.get("lead_nome", "Lead")).strip()
    telefone = str(dados.get("telefone", "")).strip()
    canal = str(dados.get("canal", "maps")).strip()
    titulo = str(dados.get("titulo", f"Reunião com {lead_nome}")).strip()
    link_reuniao = str(dados.get("link_reuniao", "")).strip()
    notas = str(dados.get("notas", "")).strip()

    resultado = reunioes_service.salvar_reuniao(
        lead_id=lead_id,
        lead_nome=lead_nome,
        telefone=telefone,
        canal=canal,
        titulo=titulo,
        data_reuniao=data_reuniao,
        horario_reuniao=horario_reuniao,
        link_reuniao=link_reuniao,
        notas=notas,
    )

    admin_phone = db.obter_config("whatsapp_admin_notificacao")
    return jsonify({
        "ok": True,
        "id": resultado["id"],
        "mensagem": f"Reunião com {lead_nome} agendada para {data_reuniao} às {horario_reuniao}!",
        "notificacao_admin": bool(admin_phone)
    })


@bp.route("/api/reunioes/<int:reuniao_id>", methods=["PATCH"])
def atualizar_status_reuniao(reuniao_id):
    """Atualiza o status (agendada, concluida, cancelada) ou notas da reunião."""
    dados = request.json or {}
    status = dados.get("status")
    notas = dados.get("notas")

    if status is None and notas is None:
        return jsonify({"erro": "Nenhum campo para atualizar"}), 400

    sucesso = reunioes_service.atualizar_reuniao(reuniao_id, status=status, notas=notas)
    if not sucesso:
        return jsonify({"erro": "Reunião não encontrada ou nenhum dado alterado"}), 404

    return jsonify({"ok": True})


@bp.route("/api/reunioes/<int:reuniao_id>", methods=["DELETE"])
def deletar_reuniao(reuniao_id):
    """Exclui um agendamento de reunião."""
    sucesso = reunioes_service.excluir_reuniao(reuniao_id)
    if not sucesso:
        return jsonify({"erro": "Reunião não encontrada"}), 404
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Motor de Busca Autônoma na Web com IA (AI Web Hunter)
# ---------------------------------------------------------------------------

@bp.route("/api/ia-hunter/iniciar", methods=["POST"])
def iniciar_hunter():
    """Inicia a varredura autônoma na web com IA procurando novos leads."""
    import ia_hunter
    dados = request.json or {}
    nicho = (dados.get("nicho") or "").strip()
    localizacao = (dados.get("localizacao") or "").strip()
    criterio = (dados.get("criterio") or "").strip()
    max_leads = int(dados.get("max_leads") or 10)
    salvar_banco = bool(dados.get("salvar_banco", True))

    if not nicho:
        return jsonify({"ok": False, "erro": "Informe o nicho ou segmento comercial para a IA buscar."}), 400
    if not localizacao:
        return jsonify({"ok": False, "erro": "Informe a cidade ou região alvo da busca."}), 400

    resp = ia_hunter.iniciar_busca_hunter(
        nicho=nicho,
        localizacao=localizacao,
        criterio=criterio,
        max_leads=max_leads,
        salvar_banco=salvar_banco
    )
    status_code = 200 if resp.get("ok") else 409
    return jsonify(resp), status_code


@bp.route("/api/ia-hunter/status", methods=["GET"])
def status_hunter():
    """Retorna o status atual, progresso e leads capturados pelo AI Web Hunter."""
    import ia_hunter
    return jsonify(ia_hunter.obter_status_hunter())


@bp.route("/api/ia-hunter/parar", methods=["POST"])
def parar_hunter():
    """Envia sinal de parada para a busca autônoma do AI Web Hunter."""
    import ia_hunter
    ia_hunter.parar_busca_hunter()
    return jsonify({"ok": True, "mensagem": "Sinal de parada enviado com sucesso."})

