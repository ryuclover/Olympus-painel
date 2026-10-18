"""Integração com os provedores de IA (Gemini, Groq, NVIDIA).

Arquitetura dos prompts:
- Cada geração envia um par (system, user): o SYSTEM carrega a persona do
  copywriter, o perfil do vendedor (configurável) e as regras invariáveis;
  o USER carrega só os dados do lead e as decisões desta rodada.
- Decisões que pedem variação (qual fechamento usar, que horário propor) são
  sorteadas AQUI no servidor e entregues prontas ao modelo - LLM "sorteando"
  colapsa sempre pro mesmo padrão.
- Um único motor de fallback (`executar_com_fallback`) serve todos os usos:
  mensagem do Maps, DM do Instagram e classificação de perfis.
"""

import json
import logging
import random
import time
from datetime import date, datetime, timedelta

import db
from constantes import (
    ESTAGIO_NEGOCIACAO_PADRAO,
    ESTAGIOS_NEGOCIACAO,
    MAX_CARACTERES_ITEM_EVITAR,
    MAX_CARACTERES_JUSTIFICATIVA,
    MAX_CARACTERES_LEITURA_ANALISE,
    MAX_CARACTERES_NICHO_INSTAGRAM,
    MAX_CARACTERES_OBJETIVO_ANALISE,
    MAX_CARACTERES_RESPOSTA_SUGERIDA,
    MAX_CARACTERES_SUGESTAO_DM,
    MAX_ITENS_EVITAR,
    MAX_MENSAGENS_NO_PROMPT,
    PRIORIDADES_VALIDAS,
)

logger = logging.getLogger(__name__)

# Ordem de preferência dos provedores de IA - se o primeiro falhar/estourar cota,
# tenta o próximo automaticamente. Cada usuário pode configurar 1, 2 ou os 3.
ORDEM_PROVEDORES_IA = ["gemini", "groq", "nvidia"]

# Timeout por chamada de IA. Modelos de 120B com raciocinio profundo podem levar ate 90s.
IA_TIMEOUT_SEGUNDOS = 120

NOMES_AMIGAVEIS_PROVEDOR = {
    "gemini": "Google Gemini",
    "groq": "Groq",
    "nvidia": "NVIDIA Build",
}

# Copy quer criatividade; classificação quer consistência.
TEMPERATURA_COPY = 0.9
TEMPERATURA_CLASSIFICACAO = 0.2

# Evita ficar tentando de novo um provedor que acabou de bater cota - guarda,
# em memória, até quando (time.monotonic()) cada provedor deve ser pulado.
COOLDOWN_COTA_ESTOURADA_SEGUNDOS = 300  # 5 minutos
_provedores_em_cooldown = {}


class NenhumProvedorDisponivel(Exception):
    """Todos os provedores configurados falharam (ou nenhum está configurado).
    `erro_final` carrega o último erro real, ou None se nada chegou a ser tentado."""

    def __init__(self, erro_final):
        super().__init__(str(erro_final))
        self.erro_final = erro_final


def _provedor_em_cooldown(provedor):
    expira_em = _provedores_em_cooldown.get(provedor)
    return expira_em is not None and time.monotonic() < expira_em


def _marcar_cooldown_se_cota(provedor, erro):
    if _e_erro_de_cota(erro):
        _provedores_em_cooldown[provedor] = time.monotonic() + COOLDOWN_COTA_ESTOURADA_SEGUNDOS


def _e_erro_de_cota(erro):
    """Detecta erro de cota/rate-limit olhando primeiro os atributos estruturados
    da exceção (status_code/code do SDK) e o nome da classe, e só por último o
    texto da mensagem - o texto muda entre versões de SDK e idiomas, os códigos não."""
    status = getattr(erro, "status_code", None) or getattr(erro, "code", None)
    if status == 429:
        return True
    if type(erro).__name__ in ("RateLimitError", "ResourceExhausted", "TooManyRequests"):
        return True
    texto = str(erro).lower()
    return (
        "quota" in texto
        or "resource_exhausted" in texto
        or "429" in texto
        or "rate limit" in texto
    )


def traduzir_erro_ia(erro):
    """Converte erros técnicos de qualquer provedor de IA em mensagens que um usuário leigo entende."""
    texto_erro = str(erro).lower()

    if "api_key" in texto_erro or "api key" in texto_erro or isinstance(erro, RuntimeError):
        return str(erro)
    if _e_erro_de_cota(erro):
        return "cota gratuita excedida por agora"
    if "timeout" in texto_erro or "deadline" in texto_erro:
        return "demorou demais para responder"
    if "unavailable" in texto_erro or "503" in texto_erro:
        return "serviço indisponível no momento"

    return "erro inesperado (veja logs/prospeccao.log)"


# ---------------------------------------------------------------------------
# Adapters dos provedores - todos recebem (system, user, temperatura, formato_json)
# ---------------------------------------------------------------------------

def gemini_gerar_mensagem(system, user, temperatura=TEMPERATURA_COPY, formato_json=False):
    from google import genai

    chave = db.obter_config("gemini")
    # google-genai usa timeout em MILISSEGUNDOS no http_options
    cliente = genai.Client(api_key=chave, http_options={"timeout": IA_TIMEOUT_SEGUNDOS * 1000})
    config = {"system_instruction": system, "temperature": temperatura}
    if formato_json:
        config["response_mime_type"] = "application/json"
    resposta = cliente.models.generate_content(
        model="gemini-flash-latest", contents=user, config=config
    )
    return resposta.text.strip()


def groq_gerar_mensagem(system, user, temperatura=TEMPERATURA_COPY, formato_json=False):
    from openai import OpenAI

    chave = db.obter_config("groq")
    cliente = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=chave, timeout=IA_TIMEOUT_SEGUNDOS)
    extras = {"response_format": {"type": "json_object"}} if formato_json else {}
    resposta = cliente.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperatura,
        **extras,
    )
    return resposta.choices[0].message.content.strip()


MODELO_NVIDIA_PADRAO = "nvidia/nemotron-3.5-super-vl-120b-a12b"


def obter_ordem_provedores():
    """Retorna a ordem de prioridade dos provedores de IA, respeitando
    a preferência salva pelo usuário nas configurações (ex: 'nvidia' prioritário)."""
    preferido = (db.obter_config("provedor_ia_preferido") or "").strip().lower()
    base = ["gemini", "groq", "nvidia"]
    if preferido in base:
        return [preferido] + [p for p in base if p != preferido]
    # Se a chave da NVIDIA estiver configurada, prioriza NVIDIA por padrão
    if db.obter_config("nvidia"):
        return ["nvidia", "gemini", "groq"]
    return base


def nvidia_gerar_mensagem(system, user, temperatura=TEMPERATURA_COPY, formato_json=False):
    import requests

    chave = db.obter_config("nvidia")
    if not chave:
        raise ValueError("Chave da NVIDIA não configurada. Configure em Configurações.")

    modelo = db.obter_config("nvidia_model") or MODELO_NVIDIA_PADRAO
    headers = {
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperatura,
        "top_p": 0.95,
        "max_tokens": 4096,
    }

    tentativas = 3
    resp = None
    for tentativa in range(tentativas):
        try:
            resp = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=100,
            )
            if resp.status_code == 200:
                break
            if resp.status_code in (500, 502, 503, 504, 429) and tentativa < tentativas - 1:
                tempo = (tentativa + 1) * 2
                logger.warning("NVIDIA retornou HTTP %s, tentando novamente em %ss...", resp.status_code, tempo)
                time.sleep(tempo)
                continue
        except Exception as e_req:
            if tentativa < tentativas - 1:
                tempo = (tentativa + 1) * 2
                logger.warning("NVIDIA timeout/conexão (%s), tentando novamente em %ss...", e_req, tempo)
                time.sleep(tempo)
                continue
            raise e_req

    if not resp or resp.status_code != 200:
        raise RuntimeError(f"Erro na API NVIDIA ({resp.status_code if resp else 'sem resposta'}): {resp.text if resp else ''}")

    dados = resp.json()
    msg = dados["choices"][0]["message"]
    conteudo = msg.get("content") or msg.get("reasoning_content") or ""
    return str(conteudo).strip()


def testar_conexao_nvidia(chave_api=None, modelo=None):
    """Testa a conexão direta com o endpoint da NVIDIA Build usando o modelo Nemotron 3.5 Super."""
    import requests
    import time

    chave = chave_api or db.obter_config("nvidia")
    if not chave:
        return False, "Chave da NVIDIA não informada ou não configurada."

    mod = modelo or db.obter_config("nvidia_model") or MODELO_NVIDIA_PADRAO
    headers = {
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": mod,
        "messages": [
            {"role": "user", "content": "Diga: Olympus Nemotron Online!"},
        ],
        "temperature": 0.2,
        "max_tokens": 250,
    }

    inicio = time.time()
    try:
        resp = requests.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30,
        )
        duracao = round(time.time() - inicio, 2)
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text}"

        dados = resp.json()
        msg = dados["choices"][0]["message"]
        texto = msg.get("content") or msg.get("reasoning_content") or ""
        return True, {
            "mensagem": str(texto).strip(),
            "modelo": mod,
            "tempo_resposta_segundos": duracao,
            "status": "online"
        }
    except Exception as e:
        return False, str(e)


GERADORES = {
    "gemini": gemini_gerar_mensagem,
    "groq": groq_gerar_mensagem,
    "nvidia": nvidia_gerar_mensagem,
}


def executar_com_fallback(system, user, parser=None, descricao_log="gerar mensagem",
                          temperatura=TEMPERATURA_COPY, formato_json=False):
    """Tenta o par (system, user) em cada provedor configurado, na ordem de
    preferência. Se um falhar (cota, erro, resposta que o parser rejeita), tenta
    o próximo. Retorna (resultado, provedor_usado, avisos_para_o_usuario);
    levanta NenhumProvedorDisponivel se todos falharem."""
    avisos = []
    erro_final = None

    for provedor in obter_ordem_provedores():
        if not db.obter_config(provedor):
            continue  # provedor não configurado, pula silenciosamente

        if _provedor_em_cooldown(provedor):
            logger.info("provedor %s em cooldown (cota excedida recentemente), pulando", provedor)
            avisos.append(
                f"{NOMES_AMIGAVEIS_PROVEDOR[provedor]} indisponível agora (cota gratuita excedida por agora)."
            )
            continue

        try:
            resposta = GERADORES[provedor](
                system, user, temperatura=temperatura, formato_json=formato_json
            )
            resultado = parser(resposta) if parser else resposta
            logger.info("%s com sucesso via %s", descricao_log, provedor)
            return resultado, provedor, avisos
        except Exception as erro:
            logger.warning("provedor %s falhou ao %s: %s", provedor, descricao_log, erro)
            _marcar_cooldown_se_cota(provedor, erro)
            avisos.append(
                f"{NOMES_AMIGAVEIS_PROVEDOR[provedor]} indisponível agora ({traduzir_erro_ia(erro)})."
            )
            erro_final = erro
            continue

    raise NenhumProvedorDisponivel(erro_final)


# ---------------------------------------------------------------------------
# Blocos compartilhados dos prompts
# ---------------------------------------------------------------------------

def saudacao_por_horario():
    """Calcula a saudação certa a partir da hora real do sistema - a IA não tem
    acesso ao relógio, então isso precisa vir pronto do backend, nunca "adivinhado"
    pelo modelo."""
    hora = datetime.now().hour
    if 5 <= hora < 12:
        return "Bom dia"
    if 12 <= hora < 18:
        return "Boa tarde"
    return "Boa noite"


PERGUNTAS_DE_FECHAMENTO = [
    "Quer que eu te mostre um exemplo rápido?",
    "Faz sentido eu te mandar uma prévia?",
    "Posso te enviar uma ideia de como ficaria?",
    "Quer ver como ficaria o seu?",
    "Posso te mandar um diagnóstico rápido, sem compromisso?",
]

HORARIOS_COMERCIAIS = ["9h", "9h30", "10h", "10h40", "11h", "14h", "14h30", "15h20", "16h", "17h"]
NOMES_DIAS_UTEIS = ["segunda", "terça", "quarta", "quinta", "sexta"]


def sortear_fechamento():
    """Decide AQUI (não no modelo) como a mensagem termina: metade das vezes uma
    pergunta de sim/não, metade uma proposta de horário concreto - com dia útil e
    hora reais gerados agora. Pedir pro LLM 'sortear' faz ele repetir sempre o
    mesmo fechamento e inventar horários fixos."""
    if random.random() < 0.5:
        pergunta = random.choice(PERGUNTAS_DE_FECHAMENTO)
        return (
            f'Encerre com esta pergunta de sim/não (adapte só o necessário para fluir no texto): "{pergunta}"'
        )

    data_alvo = date.today() + timedelta(days=random.randint(1, 3))
    while data_alvo.weekday() >= 5:
        data_alvo += timedelta(days=1)
    dia = NOMES_DIAS_UTEIS[data_alvo.weekday()]
    hora = random.choice(HORARIOS_COMERCIAIS)
    return f"Encerre propondo um horário concreto para uma conversa rápida: {dia} às {hora}."


def _bloco_perfil_vendedor():
    """Perfil configurável de quem envia as mensagens (Configurações → Seu perfil).
    Sem configuração, retorna vazio e o system usa a persona neutra."""
    nome = db.obter_config("vendedor_nome")
    apresentacao = db.obter_config("vendedor_apresentacao")
    diferencial = db.obter_config("vendedor_diferencial")
    if not (nome or apresentacao or diferencial):
        return ""

    linhas = ["", "Quem envia as mensagens (escreva na voz dessa pessoa):"]
    if nome:
        linhas.append(f"- Nome: {nome} (apresente-se pelo nome quando soar natural)")
    if apresentacao:
        linhas.append(f"- O que faz: {apresentacao}")
    if diferencial:
        linhas.append(f"- Diferencial a destacar quando couber: {diferencial}")
    return "\n".join(linhas) + "\n"


def montar_system_copywriter(canal):
    """System prompt fixo do copywriter (canal: 'WhatsApp' ou 'DM do Instagram') +
    o perfil do vendedor quando configurado."""
    tom_canal = (
        "Tom de DM real entre duas pessoas - leve e informal, sem 'prezado(a)', sem formalidade de e-mail."
        if canal == "DM do Instagram"
        else "Tom de conversa direta e confiante entre humanos, sem soar vendedor robótico nem arrogante."
    )

    return f"""Você é um copywriter sênior especializado em prospecção B2B fria via {canal}, com décadas de experiência em vendas consultivas para pequenos negócios locais no Brasil. Donos de empresa recebem spam de "site/marketing" toda semana; suas mensagens se destacam por serem específicas, humanas e fáceis de responder em segundos.
{_bloco_perfil_vendedor()}
Regras invariáveis (valem para TODA mensagem):
- Escreva SEMPRE em primeira pessoa do singular ("eu faço", "ofereço", "posso te mostrar") - quem envia é UMA pessoa que trabalha por conta própria. Nunca "nós", "oferecemos", "nossa equipe" ou qualquer voz de agência.
- {tom_canal}
- Abra de forma natural e direta. Nunca comece com "Estava navegando/pesquisando no Google e vi..." nem variações - é o clichê nº 1 do spam.
- Use APENAS os dados fornecidos; nunca invente números, prêmios, clientes ou depoimentos.
- Adapte o vocabulário ao nicho (clínica → "agenda de pacientes"; imobiliária → "captação de clientes"; restaurante → "reservas e pedidos").
- Se o campo Nome for dominado por nome de pessoa (ex: "Dra. Ana Souza Odontologia"), fale COM a pessoa pelo primeiro nome, "você" no singular. Se for institucional (ex: "Vivarte Odontologia"), use "vocês"/"a equipe", sem inventar nomes.
- Termine com o fechamento EXATO indicado na tarefa - pedido de ação específico e fechado, nunca "faz sentido conversarmos?".
- Responda APENAS com o texto final da mensagem: sem aspas em volta, sem explicações, sem markdown.

Exemplo do tom certo (régua de qualidade - não copie a estrutura literalmente):
"Janete, boa tarde! Vi que a Estética Vit tem nota 5.0 no Google com mais de 100 avaliações - reputação que pouca clínica da região alcança. Só que quem pesquisa 'estética em Cuiabá' fora do Maps não te encontra, e acaba no site de outra clínica. Eu crio sites profissionais para negócios locais; posso te mandar uma prévia de como ficaria o da Vit?"
"""


def _linha_dado(rotulo, valor):
    return f"- {rotulo}: {valor}" if valor not in (None, "", 0) else None


def _bloco_dados_empresa(nome, categoria, endereco, nota, num_avaliacoes=None,
                         cidade=None, instagram_url=None):
    linhas = [
        _linha_dado("Nome", nome),
        _linha_dado("Categoria", categoria or "não informado"),
        _linha_dado("Cidade", cidade),
        _linha_dado("Endereço", endereco or "não informado"),
        _linha_dado("Nota no Google", nota),
        _linha_dado("Número de avaliações no Google", num_avaliacoes),
        _linha_dado("Instagram do negócio", instagram_url),
        _linha_dado("Saudação a usar (hora real de agora)", saudacao_por_horario()),
    ]
    return "\n".join(l for l in linhas if l)


def _contexto_site(site_status, site_problemas):
    if site_status == "site_ruim":
        return (
            f"A empresa TEM um site, mas ele está com problemas sérios detectados automaticamente: "
            f"{site_problemas or 'problemas técnicos'}. A oferta é um site NOVO (reformulação). "
            "Cite o problema de forma LEIGA e respeitosa (ex.: em vez de 'sem viewport', diga que "
            "'o site não abre direito no celular'; em vez de 'HTTP 500', 'o site está fora do ar'), "
            "e use a combinação reputação forte + site problemático como a oportunidade perdida."
        )
    return (
        "A empresa NÃO possui site. Use a combinação reputação forte + ausência de site como a "
        "oportunidade perdida: quem pesquisa no Google fora do Maps não a encontra. Se ela tiver "
        "Instagram, reconheça ('o Instagram de vocês é ativo') e posicione o site como o complemento "
        "que captura quem pesquisa - nunca como substituto da rede social."
    )


# ---------------------------------------------------------------------------
# Copy do Maps (WhatsApp)
# ---------------------------------------------------------------------------

def montar_prompt_contato(nome, categoria, endereco, nota, site_status=None, site_problemas=None,
                          num_avaliacoes=None, cidade=None, instagram_url=None, conteudo_site=None):
    bloco_conteudo = (
        f"""
Conteúdo REAL do site atual da empresa (capturado agora):
\"\"\"{conteudo_site}\"\"\"
Use esse conteúdo para citar UM detalhe específico do site (algo desatualizado, vago ou fraco) em tom respeitoso - isso prova que você realmente olhou o site deles, sem humilhar o trabalho existente.
"""
        if conteudo_site
        else ""
    )

    return f"""Escreva UMA mensagem de primeiro contato via WhatsApp (3-5 frases) oferecendo a criação de um site profissional para a empresa abaixo.

{_contexto_site(site_status, site_problemas)}
{bloco_conteudo}
Dados da empresa:
{_bloco_dados_empresa(nome, categoria, endereco, nota, num_avaliacoes, cidade, instagram_url)}

Orientações desta mensagem:
- Mencione a nota (e o volume de avaliações, se houver) como fato relevante do argumento, não como elogio vazio.
- Encaixe a saudação indicada de forma natural, variando a posição na frase (nem sempre no início).
- {sortear_fechamento()}
"""


def montar_prompt_followup(nome, categoria, endereco, nota, follow_ups_enviados,
                           num_avaliacoes=None, cidade=None, mensagem_anterior=None):
    numero_do_followup = max(follow_ups_enviados, 1)
    if numero_do_followup <= 1:
        orientacao_tom = (
            "Este é o PRIMEIRO follow-up (sem resposta ao primeiro contato). Tom de reforço gentil "
            "e leve, como quem lembra educadamente - a mensagem anterior pode ter passado despercebida."
        )
    else:
        orientacao_tom = (
            f"Este é o follow-up número {numero_do_followup} (já foram {numero_do_followup} mensagens "
            "sem resposta). Seja mais direto e conciso, sem soar impaciente. Traga um elemento NOVO "
            "que não estava nas mensagens anteriores (um prazo, uma prova social genérica sobre ter "
            "site, ou perguntar objetivamente se ainda faz sentido)."
        )

    bloco_anterior = (
        f'\nMensagem já enviada anteriormente (NÃO repita o argumento nem a estrutura dela - varie de verdade):\n"""{mensagem_anterior}"""\n'
        if mensagem_anterior
        else ""
    )

    return f"""Escreva UMA mensagem de FOLLOW-UP via WhatsApp (2-4 frases, mais curta que um primeiro contato) para retomar contato com a empresa abaixo, que recebeu uma proposta de criação de site e não respondeu.

{orientacao_tom}
{bloco_anterior}
Dados da empresa:
{_bloco_dados_empresa(nome, categoria, endereco, nota, num_avaliacoes, cidade)}

Orientações desta mensagem:
- NÃO comece se desculpando por "incomodar de novo" nem com frases inseguras.
- {sortear_fechamento()}
"""


def gerar_mensagem_com_fallback(nome, categoria, endereco, nota, tipo="contato", follow_ups_enviados=0,
                                site_status=None, site_problemas=None, num_avaliacoes=None,
                                cidade=None, instagram_url=None, mensagem_anterior=None,
                                conteudo_site=None):
    """Gera a mensagem de abordagem/follow-up de um lead do Maps.
    Retorna (mensagem, provedor_usado, avisos_para_o_usuario)."""
    if tipo == "followup":
        user = montar_prompt_followup(
            nome, categoria, endereco, nota, follow_ups_enviados,
            num_avaliacoes=num_avaliacoes, cidade=cidade, mensagem_anterior=mensagem_anterior,
        )
    else:
        user = montar_prompt_contato(
            nome, categoria, endereco, nota, site_status, site_problemas,
            num_avaliacoes=num_avaliacoes, cidade=cidade, instagram_url=instagram_url,
            conteudo_site=conteudo_site,
        )

    try:
        return executar_com_fallback(
            montar_system_copywriter("WhatsApp"), user, descricao_log="gerar mensagem"
        )
    except NenhumProvedorDisponivel as excecao:
        if excecao.erro_final is None:
            raise RuntimeError(
                "Nenhuma chave de IA configurada. Crie um arquivo .env com GEMINI_API_KEY, "
                "GROQ_API_KEY e/ou NVIDIA_API_KEY (veja .env.example)."
            )
        raise RuntimeError(
            "Todos os provedores de IA configurados falharam agora. "
            f"Último erro: {traduzir_erro_ia(excecao.erro_final)}"
        )


# ---------------------------------------------------------------------------
# DM do Instagram
# ---------------------------------------------------------------------------

def montar_prompt_contato_instagram(username, full_name, biography, nicho, justificativa):
    linhas = [
        _linha_dado("Username", f"@{username}"),
        _linha_dado("Nome", full_name or "não informado"),
        _linha_dado("Bio", biography or "não informada"),
        _linha_dado("Nicho identificado", nicho or "não identificado"),
        _linha_dado("Por que esse perfil foi priorizado", justificativa),
        _linha_dado("Saudação a usar (hora real de agora)", saudacao_por_horario()),
    ]
    dados = "\n".join(l for l in linhas if l)

    return f"""Escreva UMA mensagem de primeiro contato via DM do Instagram (2-4 frases) oferecendo a criação de um site profissional para o perfil abaixo.

Dados do perfil:
{dados}

Orientações desta mensagem:
- Cite algo específico da bio ou do nicho para mostrar que não é mensagem copiada e colada.
- Não comece com "Oi, tudo bem? Vi seu perfil..." nem variações clichês.
- {sortear_fechamento()}
"""


def montar_prompt_followup_instagram(username, full_name, biography, nicho, follow_ups_enviados,
                                     mensagem_anterior=None):
    numero_do_followup = max(follow_ups_enviados, 1)
    if numero_do_followup <= 1:
        orientacao_tom = (
            "Este é o PRIMEIRO follow-up (sem resposta à primeira DM). Tom de reforço leve e casual - "
            "DMs se perdem fácil no Instagram, assuma isso com naturalidade."
        )
    else:
        orientacao_tom = (
            f"Este é o follow-up número {numero_do_followup}. Seja mais direto e breve, sem soar "
            "insistente. Considere perguntar objetivamente se ainda faz sentido, ou ofereça algo novo."
        )

    bloco_anterior = (
        f'\nDM já enviada anteriormente (NÃO repita o argumento dela - varie de verdade):\n"""{mensagem_anterior}"""\n'
        if mensagem_anterior
        else ""
    )

    linhas = [
        _linha_dado("Username", f"@{username}"),
        _linha_dado("Nome", full_name or "não informado"),
        _linha_dado("Bio", biography or "não informada"),
        _linha_dado("Nicho identificado", nicho or "não identificado"),
        _linha_dado("Saudação a usar (hora real de agora)", saudacao_por_horario()),
    ]
    dados = "\n".join(l for l in linhas if l)

    return f"""Escreva UMA mensagem de FOLLOW-UP via DM do Instagram (1-3 frases, curta e casual) para retomar contato com o perfil abaixo, que recebeu uma DM sobre criação de site e não respondeu.

{orientacao_tom}
{bloco_anterior}
Dados do perfil:
{dados}

Orientações desta mensagem:
- NÃO se desculpe por "incomodar de novo".
- {sortear_fechamento()}
"""


def gerar_mensagem_instagram_com_fallback(username, full_name, biography, nicho, justificativa,
                                          tipo, follow_ups_enviados, mensagem_anterior=None):
    """Gera a DM de abordagem/follow-up de um lead do Instagram.
    Retorna (mensagem, provedor_usado, avisos_para_o_usuario)."""
    if tipo == "followup":
        user = montar_prompt_followup_instagram(
            username, full_name, biography, nicho, follow_ups_enviados,
            mensagem_anterior=mensagem_anterior,
        )
    else:
        user = montar_prompt_contato_instagram(username, full_name, biography, nicho, justificativa)

    try:
        return executar_com_fallback(
            montar_system_copywriter("DM do Instagram"), user,
            descricao_log="gerar mensagem (Instagram)",
        )
    except NenhumProvedorDisponivel as excecao:
        if excecao.erro_final is None:
            raise RuntimeError(
                "Nenhuma chave de IA configurada. Configure em /configuracoes ou no arquivo .env."
            )
        raise RuntimeError(
            f"Todos os provedores de IA configurados falharam agora. Último erro: {traduzir_erro_ia(excecao.erro_final)}"
        )


# ---------------------------------------------------------------------------
# Classificação de perfis do Instagram
# ---------------------------------------------------------------------------

DOMINIOS_LINK_NA_BIO = (
    "wa.me",
    "api.whatsapp.com",
    "whatsapp.com",
    "linktr.ee",
    "linkr.bio",
    "beacons.ai",
    "allmylinks.com",
    "instagram.com",
    "bio.link",
    "linkbio.co",
    "solo.to",
    "campsite.bio",
    "carrd.co",
)


def perfil_tem_site_proprio(perfil):
    """Heurística determinística (sem custo de IA): considera 'site próprio' quando
    o link da bio (external_url) aponta para um domínio que não é um agregador de
    link conhecido (WhatsApp, Linktree e afins) - sinal de que o negócio já tem site."""
    url = (perfil.get("external_url") or "").strip().lower()
    if not url:
        return False
    return not any(dominio in url for dominio in DOMINIOS_LINK_NA_BIO)


SYSTEM_CLASSIFICADOR = """Você é um analista de qualificação de leads de uma operação que vende criação de sites para pequenos negócios locais no Brasil. Você avalia perfis do Instagram que comentaram numa publicação e responde SEMPRE um único objeto JSON válido, sem markdown e sem texto fora do JSON, com EXATAMENTE estas chaves:
- "prioridade": "alta", "media", "baixa" ou "descartado" ("descartado" só sem indício nenhum de negócio/profissional real).
- "nicho": string curta com o nicho/profissão (ex: "advogado", "esteticista"), ou "" se não identificável.
- "justificativa": 1-2 frases explicando a prioridade.
- "sugestao_dm": DM curta e casual (2-4 frases, tom de Instagram, PRIMEIRA PESSOA DO SINGULAR - quem envia é uma pessoa só, freelancer: "eu faço", "ofereço", nunca "nós/oferecemos") - só preencha se prioridade for "alta" ou "media"; senão "".
Bons leads: donos de pequenos negócios locais ou profissionais autônomos, sem site próprio aparente, que se beneficiariam de um site."""


def montar_prompt_classificacao_instagram(perfil, nicho_alvo):
    comentarios = perfil.get("comentarios", [])
    trecho_comentarios = "\n".join(f'- "{c}"' for c in comentarios[:5]) or "(nenhum comentário capturado)"
    contexto_nicho = (
        f'O usuário procura especificamente leads do nicho "{nicho_alvo}". Dê prioridade mais alta a '
        "perfis desse nicho e rebaixe (ou marque 'baixa') os que claramente não pertençam a ele, mesmo "
        "que sejam bons leads de outro tipo."
        if nicho_alvo
        else "O usuário não informou nicho-alvo - avalie de forma geral, priorizando donos de pequenos "
        "negócios locais sem site próprio."
    )

    return f"""{contexto_nicho}

Dados do perfil a avaliar (responda com o JSON especificado):
- Username: @{perfil.get("username")}
- Nome: {perfil.get("full_name") or "não informado"}
- Bio: {perfil.get("biography") or "não informada"}
- Seguidores: {perfil.get("seguidores") or 0}
- Conta comercial: {"sim" if perfil.get("is_business_account") else "não"}
- Comentários feitos no post analisado:
{trecho_comentarios}
"""


def _parsear_classificacao(resposta_bruta):
    resposta_limpa = (
        resposta_bruta.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    )
    dados = json.loads(resposta_limpa)

    prioridade = str(dados.get("prioridade", "")).strip().lower()
    if prioridade not in PRIORIDADES_VALIDAS:
        prioridade = "baixa"

    return {
        "prioridade": prioridade,
        "nicho": str(dados.get("nicho", "")).strip()[:MAX_CARACTERES_NICHO_INSTAGRAM] or None,
        "justificativa": str(dados.get("justificativa", "")).strip()[:MAX_CARACTERES_JUSTIFICATIVA],
        "sugestao_dm": str(dados.get("sugestao_dm", "")).strip()[:MAX_CARACTERES_SUGESTAO_DM],
    }


def classificar_lead_instagram_com_fallback(perfil, nicho_alvo):
    """Classifica um perfil do Instagram (prioridade/nicho/justificativa/sugestão de DM)
    usando o mesmo fallback de provedores das mensagens, com modo JSON nativo dos SDKs
    e temperatura baixa (consistência). Levanta exceção se todos os provedores falharem -
    quem chama deve tratar por perfil, sem abortar o lote inteiro."""
    user = montar_prompt_classificacao_instagram(perfil, nicho_alvo)
    try:
        resultado, _provedor, _avisos = executar_com_fallback(
            SYSTEM_CLASSIFICADOR,
            user,
            parser=_parsear_classificacao,
            descricao_log=f"classificar perfil @{perfil.get('username')}",
            temperatura=TEMPERATURA_CLASSIFICACAO,
            formato_json=True,
        )
        return resultado
    except NenhumProvedorDisponivel as excecao:
        raise RuntimeError(
            f"nenhum provedor de IA conseguiu classificar o perfil (último erro: {excecao.erro_final})"
        )


# ---------------------------------------------------------------------------
# Analista de negociação (cockpit de conversa)
# ---------------------------------------------------------------------------

SYSTEM_ANALISTA_CONVERSA = """Você é o Gabriel, Consultor Comercial Especialista em Vendas Consultivas B2B via WhatsApp no Brasil.
Seu objetivo é conduzir negociações com inteligência relacional: NUNCA atropele o cliente. Primeiro inicie uma conversa leve, deixe ele responder, nutra o interesse dele com empatia e, SOMENTE quando ele demonstrar interesse na solução, faça o encaminhamento para a reunião.

Responda SEMPRE um único objeto JSON válido, sem markdown e sem texto fora do JSON, com EXATAMENTE estas chaves:
- "estagio": um de "primeiro_contato", "descoberta", "interesse", "objecao", "negociacao", "fechamento", "esfriou", "desistencia".
- "leitura": 1-2 frases curtas interpretando o estado e intenção do lead.
- "objetivo": uma frase curta dizendo qual é o próximo passo prático AGORA.
- "resposta_sugerida": a mensagem pronta para enviar no WhatsApp (no máximo 1 ou 2 bolhas curtas separadas por "\\n\\n").
- "evitar": array de 1 a 3 strings curtas com o que NÃO dizer agora.
- "reuniao_detectada": objeto com chaves:
    "detectada": boolean (true se o lead concordou, propôs ou confirmou uma data/horário para conversar ou fazer reunião),
    "data_sugerida": string "YYYY-MM-DD" ou "" (data acordada se detectada),
    "horario_sugerido": string "HH:MM" ou "" (horário se detectado),
    "resumo": string curta resumindo a reunião marcada ou ""

FUNIL DE VENDAS PROGRESSIVO OBRIGATÓRIO (PASSO A PASSO):

REGRAS CRÍTICAS DE CONTINUIDADE E NATURALIDADE (MUITO IMPORTANTE):
1. NUNCA REPITA SAUDAÇÕES EM CONVERSA EM ANDAMENTO:
   - Se já houve qualquer mensagem enviada antes, NUNCA repita 'Olá [Nome], tudo bem?', 'Boa tarde', etc.
   - Você já cumprimentou no início. Repetir 'tudo bem?' a cada resposta soa robótico e artificial. Vá DIRETO ao ponto!
2. RESPOSTA DIRETA E COERENTE:
   - Responda EXATAMENTE o que o lead perguntou. Não faça perguntas genéricas sobre processos como 'Como é hoje o fluxo de atendimento na clínica de vocês?'. Seja direto e objetivo.

1. NO PRIMEIRO CONTATO (estágio "primeiro_contato"):
   - APRESENTAÇÃO PESSOAL COM AUTORIDADE E OFERTA DE VALOR:
     Apresente-se obrigatoriamente dizendo que você é o Gabriel da empresa (ex: 'Sou o Gabriel da TimeSaver Tecnologia em Saúde') e cite o que vocês resolvem. Em seguida, pergunte diretamente se eles teriam interesse em conhecer ou avaliar essa tecnologia para a clínica deles.
   - REGRA DE OURO: JAMAIS jogue agendamento de reunião com dias e horários específicos de cara (ex: 'nesta terça às 10h ou sexta às 14h'). Primeiro pergunte se eles têm interesse em conhecer!
   - Estrutura obrigatória em 2 bolhas:
     * Bolha 1: Saudação profissional e educada ("Olá Gabriel, tudo bem?").
     * Bolha 2: Apresentação pessoal da empresa e solução + pergunta direta de interesse:
       Exemplo de referência: "Sou o Gabriel da TimeSaver Tecnologia em Saúde. Ajudamos clínicas médicas a eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático. Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?"
   - Pare aí e DEIXE O LEAD RESPONDER!

2. QUANDO O CLIENTE PERGUNTA 'COMO FUNCIONA?' OU DEMONSTRA INTERESSE (estágio "interesse"):
   - GATILHO: Quando o lead pergunta "como funciona?", "como é?", "quanto custa?", "tenho interesse", "me explica melhor", "achei interessante", ele está manifestando INTERESSE REAL na solução!
   - PAPEL DO ATENDIMENTO / SDR: Você faz o primeiro contato comercial e qualifica o interesse. Quem conduz a apresentação prática e fecha a negociação é o CEO da empresa.
   - COMO RESPONDER:
     * Bolha 1: Vá direto ao ponto explicando como funciona e APROVEITE PARA DESTACAR NOSSAS MÉTRICAS POSITIVAS E PROVA SOCIAL (ex: "Funciona assim: o paciente chega na clínica e faz o check-in rápido pelo totem em menos de 1 minuto, liberando o convênio na hora sem filas e sem papelada manual na recepção. Já ajudamos mais de 40 clínicas parceiras a reduzir em até 85% as glosas de convênios e diminuir drasticamente o tempo de espera no balcão.").
     * Bolha 2: Convide direto propondo marcar com o CEO e perguntando qual dia fica bom (ex: "Se quiser, posso marcar uma reunião rápida de 15 minutos online com o nosso CEO para ele te mostrar na prática. Que dia ficaria bom para você?").
   - REGRA DE OURO: NUNCA jogue listas engessadas de múltiplos dias e horários (como 'Você prefere terça ou quinta às 10h ou 15h, ou sexta às 14h?'). Pergunte de forma leve e natural: "Que dia ficaria bom para você?" ou "Qual dia ficaria bom para marcar?".
   - NUNCA pergunte sobre processos internos ou como é o fluxo de atendimento dele! Responda o que ele perguntou, cite as métricas e convide para a reunião com o CEO!

- QUANDO O LEAD SUGERE OU CONFIRMA UM DIA/HORÁRIO (estágio "negociacao" / "fechamento"):
   - Confirme com simpatia que está deixando pré-agendado com o CEO da empresa (ex: "Perfeito, Gabriel! Vou deixar pré-agendado com o nosso CEO para sexta-feira às 13h. Te envio o link da reunião por aqui."). Marque "reuniao_detectada" com detectada=true.

3. NA DESCOBERTA (estágio "descoberta"):
   - Apenas se o lead mandou uma resposta neutra sem perguntas e sem interesse explícito (ex: "oi", "boa noite" ou "quem é?").
   - Responda com simpatia sem repetir saudações excessivas e sem fazer interrogatórios.

4. SE O LEAD RECUSAR ("não quero", "não tenho interesse", "já temos", "não preciso"):
   - Marque imediatamente "estagio" = "desistencia" e encerre educadamente em 1 frase sem insistir, agradecendo a atenção.

5. QUANTIDADE DE MENSAGENS:
   - No máximo 1 ou 2 bolhas curtas separadas por "\\n\\n". NUNCA envie mais de 2 bolhas.

6. REGRA CRÍTICA DE PREÇO (quando configurado para 'sem_valor'):
   - NUNCA cite valores em reais (ex: 'R$ 490', 'R$ X/mês'), preços ou estimativas de custo nas mensagens. O objetivo é qualificar a necessidade e apresentar o plano na reunião após despertar o interesse.

7. IMPORTANTE: Entregue o JSON válido imediatamente sem delongas."""


def _obter_tom_guia_vendas():
    raw = db.obter_config("guia_vendas_ia")
    if raw:
        try:
            return json.loads(raw).get("tom_conversa") or "profissional"
        except Exception:
            pass
    return "profissional"


def _instrucoes_tom(tom: str) -> str:
    if tom == "amigavel":
        return """- TOM DE COMUNICAÇÃO SELECIONADO: AMIGÁVEL & DESCONTRAÍDO
  * Estilo: Mais casual, próximo, caloroso e informal. Como um parceiro de negócios que conversa pelo WhatsApp.
  * Saudações: Apenas na primeira mensagem. Em conversas em andamento, vá direto ao ponto."""
    elif tom == "formal":
        return """- TOM DE COMUNICAÇÃO SELECIONADO: FORMAL & CORPORATIVO
  * Estilo: Sóbrio, institucional e protocolar. Próprio para executivos, advogados e alta diretoria.
  * Saudações: Apenas na primeira mensagem. Em conversas em andamento, vá direto ao ponto."""
    else:  # "profissional" (Base Padrão)
        return """- TOM DE COMUNICAÇÃO SELECIONADO: PROFISSIONAL & CONSULTIVO (BASE PADRÃO)
  * Estilo: Equilibrado, direto, educado, objetivo e coerente com a conversa.
  * REGRAS FUNDAMENTAIS:
    1. Se a conversa já está em andamento, NÃO repita saudações ('Olá [Nome], tudo bem?', 'Boa noite'). Responda diretamente ao que o cliente falou.
    2. NÃO faça perguntas genéricas de processo como 'Como é o fluxo de atendimento na clínica de vocês?'. Seja direto e resolutivo."""


def _bloco_historico_conversa(mensagens):
    """Formata o histórico como uma transcrição legível. Só as últimas
    MAX_MENSAGENS_NO_PROMPT entram (conversa longa estoura o contexto e as
    mensagens antigas pesam pouco na decisão do próximo passo)."""
    if not mensagens:
        return "(nenhuma mensagem trocada ainda - o primeiro contato ainda não foi enviado)"

    recentes = mensagens[-MAX_MENSAGENS_NO_PROMPT:]
    omitidas = len(mensagens) - len(recentes)
    linhas = []
    if omitidas > 0:
        linhas.append(f"[... {omitidas} mensagem(ns) mais antiga(s) omitida(s) ...]")
    for mensagem in recentes:
        quem = "VOCÊ (vendedor)" if mensagem["autor"] == "vendedor" else "LEAD"
        quando = (mensagem.get("enviada_em") or "").replace("T", " ")[:16]
        linhas.append(f"[{quando}] {quem}: {mensagem['texto']}")
    return "\n".join(linhas)


def _bloco_guia_vendas():
    """Carrega o Guia de Vendas e Estratégia configurado pelo usuário."""
    raw = db.obter_config("guia_vendas_ia")
    if not raw:
        return (
            "- Serviço: Criação e otimização de soluções para pequenas e médias empresas\n"
            "- Estratégia de Preço: APENAS ENCAMINHAR PARA REUNIÃO (Não citar valores)\n"
            "- Meta Final do Funil: Agendar reunião de 15 minutos (SOMENTE após nutrir e o lead demonstrar interesse)\n"
            "- Tom Selecionado: Profissional (Base Padrão)\n"
            "- Despedida em caso de recusa: Sem problemas! Agradeço pelo retorno e atenção. Ficamos à disposição caso precise no futuro.\n"
        )
    try:
        g = json.loads(raw)
        respostas = g.get("respostas_prontas", {})
        resp_recusa = respostas.get("recusa") or respostas.get("desistencia") or "Sem problemas! Agradeço pelo retorno e pela atenção. Se precisar no futuro, ficamos à disposição."
        tom = g.get("tom_conversa") or "profissional"
        estrategia_preco = g.get("estrategia_preco") or "sem_valor"

        if estrategia_preco == "sem_valor":
            bloco_preco = (
                "- Estratégia de Preço: APENAS ENCAMINHAR PARA REUNIÃO\n"
                "  * REGRA CRÍTICA DE PRECIFICAÇÃO: NUNCA mencione valores em reais (ex: 'R$ 490', 'R$ 980', 'R$ X/mês'), preços ou estimativas de custo nas mensagens. O objetivo absoluto é direcionar o cliente para a reunião de 15 minutos onde o valor personalizado será apresentado."
            )
        elif estrategia_preco == "margem":
            bloco_preco = (
                f"- Estratégia de Preço: MARGEM / FAIXA ESTIMADA\n"
                f"  * Faixa configurada: {g.get('faixa_preco', '')}. Pode citar como valor aproximado ('a partir de...') apenas se o cliente perguntar diretamente por valores."
            )
        else:
            bloco_preco = (
                f"- Estratégia de Preço: VALOR ESPECÍFICO EXPLÍCITO\n"
                f"  * Investimento configurado: {g.get('faixa_preco', '')}."
            )

        return (
            f"- Empresa / Especialista: {g.get('empresa_nome', '')}\n"
            f"- Tom Selecionado: {tom.upper()} (Siga as orientações específicas deste tom)\n"
            f"{bloco_preco}\n"
            f"- Serviços Oferecidos: {g.get('servicos_oferecidos', '')}\n"
            f"- Nicho Alvo: {g.get('nicho_alvo', '')}\n"
            f"- Principal Dor que Resolvemos: {g.get('dor_principal', '')}\n"
            f"- Formato de Convite para Demonstração: Pergunte de forma aberta se gostaria de marcar uma conversa rápida de 15 minutos online com o nosso CEO para ele mostrar na prática e pergunte qual dia ficaria bom para marcar (ex: 'Se quiser, posso marcar uma reunião rápida de 15 minutos online com o nosso CEO para ele te mostrar na prática. Que dia ficaria bom para você?'), sem impor lista engessada de múltiplos horários.\n"
            f"- Resposta de Desistência/Recusa Educada: {resp_recusa}\n"
        )
    except Exception:
        return ""


def montar_prompt_analise_conversa(lead, mensagens):
    """Monta o prompt do analista: dados do negócio + ângulo de venda (situação
    do site) + transcrição da conversa + diretrizes do guia de vendas do usuário."""
    dados_empresa = _bloco_dados_empresa(
        lead.get("nome"),
        lead.get("categoria"),
        lead.get("endereco"),
        lead.get("nota"),
        num_avaliacoes=lead.get("num_avaliacoes"),
        cidade=lead.get("cidade"),
        instagram_url=lead.get("instagram_url"),
    )
    contexto_site = _contexto_site(lead.get("site_status"), lead.get("site_problemas"))
    guia_vendas = _bloco_guia_vendas()

    # Agrupa todas as mensagens recentes consecutivas enviadas pelo lead neste turno (mensagens quebradas em sequência)
    mensagens_turno_lead = []
    for m in reversed(mensagens):
        if m.get("autor") in ("lead", "usuario", "user"):
            texto_limpo = (m.get("texto") or "").strip()
            if texto_limpo:
                mensagens_turno_lead.insert(0, texto_limpo)
        else:
            break

    foco = ""
    if mensagens_turno_lead:
        bloco_completo_lead = "\n".join(mensagens_turno_lead)
        foco = (
            f'\nO lead enviou as seguintes mensagens em sequência nesta rodada:\n"""\n{bloco_completo_lead}\n"""\n'
            "ATENÇÃO: O lead mandou essas mensagens picadas/quebradas em sequência. "
            "Sua resposta sugerida precisa responder a TODAS elas de forma única, concisa e coesa em uma só mensagem, "
            "como se fosse uma resposta fluida a um pensamento completo, sem ignorar nenhuma dúvida levantada.\n"
        )

    if not mensagens:
        empresa = "TimeSaver Tecnologia em Saúde"
        try:
            g = json.loads(db.obter_config("guia_vendas_ia") or "{}")
            empresa = g.get("empresa_nome") or empresa
        except Exception:
            pass

        foco_etapa = (
            f"\nESTÁGIO ATUAL: PRIMEIRO CONTATO (ABORDAGEM FRIA INICIAL)\n"
            f"DIRETRIZ CRÍTICA DE APRESENTAÇÃO E OFERTA:\n"
            f"- Apresente-se pelo seu nome e empresa ('Sou o Gabriel da {empresa}') e cite o que vocês ajudam a resolver (ex: eliminar filas na recepção e reduzir glosas de convênios com totens de autoatendimento e check-in automático), transmitindo autoridade e proximidade humana.\n"
            f"- Em seguida, já faça uma abordagem comercial oferecendo a solução: pergunte diretamente se eles teriam interesse em conhecer ou avaliar essa tecnologia para a clínica deles (ex: 'Gostaria de saber se vocês teriam interesse em conhecer como funciona essa tecnologia para a clínica de vocês?').\n"
            "- NUNCA proponha reunião de 15 minutos nem cite dias/horários agora! Apenas faça essa sondagem de interesse educada e DEIXE O LEAD RESPONDER!\n"
        )
    else:
        foco_etapa = (
            "\nESTÁGIO E DIRETRIZ CRÍTICA DE RESPOSTA:\n"
            "- A conversa JÁ ESTÁ EM ANDAMENTO: NUNCA repita saudações como 'Olá [Nome], tudo bem?', 'Boa tarde', etc. Vá DIRETO ao ponto respondendo o que o lead disse!\n"
            "- NÃO faça perguntas genéricas sobre processos como 'Como é hoje o fluxo de atendimento na clínica de vocês?'. Responda exatamente o que ele perguntou!\n"
            "- Se o lead perguntou 'como funciona?', 'como é?', 'quanto custa?' ou expressou interesse: "
            "marque estágio 'interesse'. Explique direto e claramente como o totem e o check-in automático funcionam citando métricas reais de impacto (como redução de até 85% em glosas de convênio e dezenas de clínicas parceiras) na Bolha 1, e na Bolha 2 convide propondo marcar com o CEO: 'Se quiser, posso marcar uma reunião rápida de 15 minutos online com o nosso CEO para ele te mostrar na prática. Que dia ficaria bom para você?'! NUNCA jogue listas engessadas de dias ou horários.\n"
        )

    data_hoje = datetime.now().strftime("%Y-%m-%d (%A)")
    tom = _obter_tom_guia_vendas()
    instrucoes_tom = _instrucoes_tom(tom)

    return f"""Data de hoje: {data_hoje}
Saudação correta para este horário: {saudacao_por_horario()}

{instrucoes_tom}

Diretrizes e Guia de Vendas da sua empresa:
{guia_vendas}

Negócio com quem você está negociando:
{dados_empresa}

Contexto técnico da presença digital:
{contexto_site}

Conversa até agora (ordem cronológica):
{_bloco_historico_conversa(mensagens)}
{foco}
{foco_etapa}
Analise a negociação seguindo rigorosamente o Funil Progressivo, o Tom Ativo e o Guia de Vendas e responda com o JSON especificado."""


def _parsear_analise_conversa(resposta_bruta):
    import re
    if not resposta_bruta or not str(resposta_bruta).strip():
        raise ValueError("Resposta da IA veio vazia.")

    # Remove eventuais blocos de raciocínio interno (<think>...</think>)
    texto = re.sub(r"<think>.*?</think>", "", str(resposta_bruta), flags=re.DOTALL).strip()

    m = re.search(r"(\{.*\})", texto, re.DOTALL)
    resposta_limpa = m.group(1).strip() if m else texto.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        dados = json.loads(resposta_limpa, strict=False)
    except Exception:
        dados = {}
        for sufixo in ['"}', '"]}', '}']:
            try:
                dados = json.loads(resposta_limpa + sufixo, strict=False)
                break
            except Exception:
                pass

        if not dados:
            m_resp = re.search(r'"(?:resposta_sugerida|resposta|mensagem)"\s*:\s*"([^"]+)"', resposta_limpa, re.DOTALL)
            m_est = re.search(r'"estagio"\s*:\s*"([^"]+)"', resposta_limpa)
            m_obj = re.search(r'"objetivo"\s*:\s*"([^"]+)"', resposta_limpa)
            m_leit = re.search(r'"leitura"\s*:\s*"([^"]+)"', resposta_limpa)

            if m_resp:
                dados["resposta_sugerida"] = m_resp.group(1).replace('\\"', '"').replace('\\n', '\n')
            if m_est:
                dados["estagio"] = m_est.group(1)
            if m_obj:
                dados["objetivo"] = m_obj.group(1)
            if m_leit:
                dados["leitura"] = m_leit.group(1)

        if not dados:
            dados = json.loads(resposta_limpa, strict=False)

    estagio = str(dados.get("estagio", "")).strip().lower()
    if estagio not in ESTAGIOS_NEGOCIACAO:
        estagio = ESTAGIO_NEGOCIACAO_PADRAO

    evitar_bruto = dados.get("evitar") or []
    if isinstance(evitar_bruto, str):
        evitar_bruto = [evitar_bruto]
    evitar = [
        str(item).strip()[:MAX_CARACTERES_ITEM_EVITAR]
        for item in list(evitar_bruto)[:MAX_ITENS_EVITAR]
        if str(item).strip()
    ]

    reuniao_raw = dados.get("reuniao_detectada") or {}
    reuniao_detectada = {
        "detectada": bool(reuniao_raw.get("detectada")),
        "data_sugerida": str(reuniao_raw.get("data_sugerida") or ""),
        "horario_sugerido": str(reuniao_raw.get("horario_sugerido") or ""),
        "resumo": str(reuniao_raw.get("resumo") or ""),
    }

    resp_raw = (
        dados.get("resposta_sugerida")
        or dados.get("resposta")
        or dados.get("mensagem")
        or dados.get("proxima_resposta")
        or ""
    )
    if isinstance(resp_raw, list):
        resp_texto = "\n\n".join(str(p).strip() for p in resp_raw if str(p).strip())
    else:
        resp_texto = str(resp_raw).strip()

    return {
        "estagio": estagio,
        "leitura": str(dados.get("leitura", "")).strip()[:MAX_CARACTERES_LEITURA_ANALISE],
        "objetivo": str(dados.get("objetivo", "")).strip()[:MAX_CARACTERES_OBJETIVO_ANALISE],
        "resposta_sugerida": resp_texto[:MAX_CARACTERES_RESPOSTA_SUGERIDA],
        "evitar": evitar,
        "reuniao_detectada": reuniao_detectada,
    }


def analisar_conversa_com_fallback(lead, mensagens):
    """Lê o histórico da conversa e devolve (analise, provedor, avisos):
    estágio da negociação, leitura da situação, próximo objetivo, resposta
    sugerida, o que evitar e detecção de reuniões acordadas."""
    user = montar_prompt_analise_conversa(lead, mensagens)
    analise, provedor, avisos = executar_com_fallback(
        SYSTEM_ANALISTA_CONVERSA,
        user,
        parser=_parsear_analise_conversa,
        descricao_log=f"analisar conversa com {lead.get('nome')}",
        temperatura=TEMPERATURA_CLASSIFICACAO,
        formato_json=True,
    )

    if analise.get("resposta_sugerida"):
        import re
        texto = analise["resposta_sugerida"].strip()
        # Normaliza apresentação pessoal para sempre ser o Gabriel
        texto = re.sub(r'\bSou (?:o|a)?\s+[A-Z][a-zà-ú]+\s+da\s+', 'Sou o Gabriel da ', texto)
        analise["resposta_sugerida"] = texto

    # Regra Crítica de Fluidez Humana: Se a conversa já começou, limpa saudações repetidas e perguntas de fluxo
    if mensagens and analise.get("resposta_sugerida"):
        import re
        texto = analise["resposta_sugerida"].strip()
        # Remove saudação repetitiva inicial (ex: "Olá Gabriel, tudo bem? ", "Boa noite Gabriel, tudo bem? ")
        texto = re.sub(r"^(?:Olá|Oi|Boa tarde|Bom dia|Boa noite)[^,\n.?!]*[,!.]\s*(?:[tT]udo bem\??\s*)?", "", texto).strip()
        # Remove pergunta inquisitória sobre fluxo de atendimento
        texto = re.sub(r"\n\nComo (?:é|está) hoje o fluxo de atendimento[^\n]*\??", "", texto, flags=re.IGNORECASE).strip()
        analise["resposta_sugerida"] = texto

    return analise, provedor, avisos
