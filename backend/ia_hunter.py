"""
ia_hunter.py — Motor de Busca Autônoma de Leads na Web com IA (AI Web Hunter).

Permite que a IA vasculhe a internet ativamente, utilizando estratégias de busca,
dorks, análise de perfis públicos e extração inteligente para descobrir novas empresas,
números de WhatsApp e oportunidades para o CRM Olympus.
"""

import hashlib
import json
import logging
import re
import threading
import time
import urllib.parse
from datetime import datetime
from typing import Dict, List, Optional, Any

from playwright.sync_api import sync_playwright

import db
import ia
import telefone_util

logger = logging.getLogger(__name__)

# Estado global da busca autônoma
estado_hunter: Dict[str, Any] = {
    "rodando": False,
    "progresso": 0,
    "etapa": "Parado",
    "mensagem": "Pronto para iniciar busca autônoma.",
    "queries_executadas": [],
    "total_web_encontrados": 0,
    "total_leads_salvos": 0,
    "leads": [],
    "erro": None,
    "cancelar": False,
    "iniciado_em": None,
    "finalizado_em": None,
}

_lock_hunter = threading.Lock()
_thread_hunter: Optional[threading.Thread] = None


def obter_status_hunter() -> Dict[str, Any]:
    with _lock_hunter:
        return dict(estado_hunter)


def _atualizar_estado(**kwargs):
    with _lock_hunter:
        estado_hunter.update(kwargs)


def parar_busca_hunter():
    with _lock_hunter:
        if estado_hunter.get("rodando"):
            estado_hunter["cancelar"] = True
            estado_hunter["mensagem"] = "Cancelando busca autônoma..."
            estado_hunter["etapa"] = "Cancelando..."


def extrair_json_valido(texto: str) -> Optional[dict]:
    """Extrai objeto JSON de forma robusta de respostas com markdown ou texto explicativo."""
    if not texto:
        return None

    # 1. Tenta bloco markdown ```json ... ```
    match_code = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", texto)
    if match_code:
        candidato = match_code.group(1).strip()
        try:
            return json.loads(candidato)
        except Exception:
            pass

    # 2. Tenta o maior bloco entre chaves { ... }
    match_braces = re.search(r"(\{[\s\S]*\})", texto)
    if match_braces:
        candidato = match_braces.group(1).strip()
        try:
            return json.loads(candidato)
        except Exception:
            pass

    # 3. Tenta direto
    try:
        return json.loads(texto.strip())
    except Exception:
        pass

    return None


def extrair_telefones_texto(texto: str) -> List[str]:
    """Extrai possíveis números de telefone/WhatsApp de snippets de busca."""
    if not texto:
        return []
    padrao = r'(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})'
    encontrados = re.findall(padrao, texto)
    validos = []
    for num in encontrados:
        limpo = telefone_util.limpar_digitos(num)
        if len(limpo) in (10, 11):
            validos.append(limpo)
    return list(dict.fromkeys(validos))


def salvar_lead_no_crm(lead_dados: dict) -> bool:
    """Insere ou atualiza o lead qualificado pela IA na tabela leads do Olympus."""
    nome = (lead_dados.get("nome") or "").strip()
    if not nome:
        return False

    tel_raw = lead_dados.get("telefone") or ""
    tipo_tel, tem_whats, tel_formatado = telefone_util.classificar_telefone(tel_raw)
    tel_digitos = telefone_util.limpar_digitos(tel_raw)

    seed = f"{nome}_{tel_digitos or lead_dados.get('site', '')}".lower()
    hash_id = hashlib.md5(seed.encode()).hexdigest()[:16]
    place_id = f"web_ai_{hash_id}"

    cidade = (lead_dados.get("cidade") or "").strip()
    estado = (lead_dados.get("estado") or "").strip()
    categoria = (lead_dados.get("categoria") or "").strip()
    site_url = (lead_dados.get("site") or "").strip()
    instagram = site_url if "instagram.com" in site_url.lower() else ""

    diagnostico = (lead_dados.get("diagnostico_ia") or "").strip()
    pitch = (lead_dados.get("pitch_sugerido") or "").strip()
    query_origem = (lead_dados.get("query_origem") or "Busca Autônoma IA Web").strip()

    observacao_completa = f"[IA Web Hunter] {diagnostico}" if diagnostico else "[IA Web Hunter] Lead prospectado na web"

    conn = db.conectar()
    try:
        agora = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            """
            INSERT INTO leads (
                place_id, nome, categoria, telefone, tipo_telefone, tem_whatsapp,
                cidade, estado, site, site_url, instagram_url, status, score,
                query_origem, observacoes, mensagem_gerada, criado_em, atualizado_em
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', 85, ?, ?, ?, ?, ?)
            ON CONFLICT(place_id) DO UPDATE SET
                nome = excluded.nome,
                categoria = excluded.categoria,
                telefone = COALESCE(NULLIF(excluded.telefone, ''), leads.telefone),
                tipo_telefone = excluded.tipo_telefone,
                tem_whatsapp = excluded.tem_whatsapp,
                cidade = COALESCE(NULLIF(excluded.cidade, ''), leads.cidade),
                estado = COALESCE(NULLIF(excluded.estado, ''), leads.estado),
                site_url = COALESCE(NULLIF(excluded.site_url, ''), leads.site_url),
                instagram_url = COALESCE(NULLIF(excluded.instagram_url, ''), leads.instagram_url),
                observacoes = excluded.observacoes,
                mensagem_gerada = COALESCE(NULLIF(excluded.mensagem_gerada, ''), leads.mensagem_gerada),
                atualizado_em = excluded.atualizado_em
            """,
            (
                place_id,
                nome,
                categoria,
                tel_digitos or tel_raw,
                tipo_tel,
                1 if tem_whats else 0,
                cidade,
                estado,
                site_url,
                site_url,
                instagram,
                query_origem,
                observacao_completa,
                pitch,
                agora,
                agora,
            ),
        )
        conn.commit()
        return True
    except Exception as e:
        logger.error("Erro ao salvar lead da IA no CRM: %s", e)
        return False
    finally:
        conn.close()


def _executar_pipeline_hunter(
    nicho: str,
    localizacao: str,
    criterio: str = "",
    max_leads: int = 10,
    salvar_banco: bool = True
):
    """Executa o pipeline completo de prospecção autônoma na web."""
    logger.info("Iniciando AI Web Hunter: nicho='%s', loc='%s', max=%d", nicho, localizacao, max_leads)
    _atualizar_estado(
        rodando=True,
        progresso=5,
        etapa="Planejando estratégia de busca",
        mensagem=f"Estrategista de IA planejando termos e dorks para '{nicho}'...",
        queries_executadas=[],
        total_web_encontrados=0,
        total_leads_salvos=0,
        leads=[],
        erro=None,
        cancelar=False,
        iniciado_em=datetime.now().isoformat(),
        finalizado_em=None,
    )

    try:
        # 1. Planejamento com IA (Nemotron / Fallback)
        system_plan = """Você é o arquiteto sênior de inteligência comercial do Olympus.
Gere 3 termos de busca no Google/Bing para encontrar empresas e profissionais reais com contatos (WhatsApp, Instagram, site).
Seja conciso. Responda APENAS em JSON estrito no formato:
{
  "queries": [
    "busca 1",
    "busca 2",
    "busca 3"
  ]
}"""
        user_plan = f"Nicho: {nicho}\nLocalidade: {localizacao}\nCritério: {criterio or 'Empresas com WhatsApp e Instagram'}"

        queries = []
        try:
            res_plan, _, _ = ia.executar_com_fallback(
                system=system_plan,
                user=user_plan,
                formato_json=True,
                descricao_log="planejamento hunter ia"
            )
            dados_plan = extrair_json_valido(res_plan)
            if dados_plan:
                queries = dados_plan.get("queries", [])
        except Exception as e:
            logger.warning("Falha ao gerar queries via IA, usando defaults inteligentes: %s", e)

        if not queries:
            queries = [
                f'"{nicho}" "{localizacao}" whatsapp',
                f'site:instagram.com "{nicho}" "{localizacao}"',
                f'"{nicho}" "{localizacao}" contato agendamento'
            ]

        _atualizar_estado(
            progresso=20,
            etapa="Vasculhando a internet",
            mensagem=f"Estratégia traçada. Executando {len(queries)} varreduras inteligentes na web...",
            queries_executadas=queries,
        )

        if estado_hunter.get("cancelar"):
            _atualizar_estado(rodando=False, etapa="Cancelado", mensagem="Busca cancelada pelo usuário.")
            return

        # 2. Coleta na Web com Playwright Headless
        resultados_brutos = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            page = context.new_page()

            for idx, q in enumerate(queries):
                if estado_hunter.get("cancelar"):
                    break

                progresso_atual = 20 + int((idx / len(queries)) * 35)
                _atualizar_estado(
                    progresso=progresso_atual,
                    etapa=f"Vasculhando web ({idx+1}/{len(queries)})",
                    mensagem=f"Pesquisando: '{q}'...",
                )

                try:
                    busca_url = f"https://www.bing.com/search?q={urllib.parse.quote_plus(q)}"
                    page.goto(busca_url, timeout=15000, wait_until="domcontentloaded")
                    page.wait_for_timeout(1500)

                    itens = page.evaluate("""() => {
                        const results = Array.from(document.querySelectorAll('li.b_algo'));
                        return results.map(it => {
                            const titleEl = it.querySelector('h2');
                            const linkEl = it.querySelector('h2 a');
                            const snippetEl = it.querySelector('.b_caption p, p');
                            return {
                                titulo: titleEl ? titleEl.innerText.trim() : '',
                                link: linkEl ? linkEl.href : '',
                                snippet: snippetEl ? snippetEl.innerText.trim() : ''
                            };
                        }).filter(x => x.titulo && (x.snippet || x.link));
                    }""")

                    for it in itens[:8]:
                        it["query"] = q
                        resultados_brutos.append(it)

                except Exception as err_busca:
                    logger.warning("Erro ao executar busca '%s': %s", q, err_busca)

            browser.close()

        _atualizar_estado(
            progresso=55,
            total_web_encontrados=len(resultados_brutos),
            etapa="Qualificando empresas com IA",
            mensagem=f"{len(resultados_brutos)} resultados encontrados na web. Analisando oportunidades e contatos...",
        )

        if estado_hunter.get("cancelar"):
            _atualizar_estado(rodando=False, etapa="Cancelado", mensagem="Busca cancelada pelo usuário.")
            return

        if not resultados_brutos:
            _atualizar_estado(
                rodando=False,
                progresso=100,
                etapa="Finalizado",
                mensagem="Nenhum resultado retornado pelos buscadores para os termos informados.",
                finalizado_em=datetime.now().isoformat(),
            )
            return

        # 3. Pré-processamento Heurístico + Qualificação com IA
        leads_qualificados: List[Dict[str, Any]] = []
        lote_size = 5
        total_lotes = (len(resultados_brutos) + lote_size - 1) // lote_size

        system_extract = """Você é o Qualificador de Leads B2B e Hunter do Olympus.
Analise os resultados coletados na internet e extraia empresas ou profissionais reais que sejam potenciais clientes.
Seja objetivo e direto.
Para cada empresa válida encontrada:
- "nome": Nome comercial da clínica, loja, escritório ou profissional
- "telefone": Número de telefone ou WhatsApp (se estiver presente no snippet, título ou URL). Se não houver, deixe ""
- "cidade": Cidade detectada
- "estado": UF (ex: SP, RJ, MG)
- "site": Site oficial ou perfil no Instagram/link
- "categoria": Nicho ou especialidade
- "diagnostico_ia": Uma oportunidade prática ou dor detectada para vendas
- "pitch_sugerido": Abordagem inicial de 2 frases para WhatsApp

Responda APENAS em JSON estrito no formato:
{
  "leads": [
    {
      "nome": "...",
      "telefone": "...",
      "cidade": "...",
      "estado": "...",
      "site": "...",
      "categoria": "...",
      "diagnostico_ia": "...",
      "pitch_sugerido": "..."
    }
  ]
}"""

        for i in range(0, len(resultados_brutos), lote_size):
            if estado_hunter.get("cancelar") or len(leads_qualificados) >= max_leads:
                break

            lote = resultados_brutos[i : i + lote_size]
            lote_idx = i // lote_size + 1
            progresso_lote = 55 + int((lote_idx / total_lotes) * 38)

            _atualizar_estado(
                progresso=progresso_lote,
                etapa=f"Análise profunda com IA (Lote {lote_idx}/{total_lotes})",
                mensagem=f"Avaliando {len(lote)} candidatos comerciais...",
            )

            novos_deste_lote = []
            user_extract = f"Resultados brutos coletados da internet:\n" + json.dumps(lote, ensure_ascii=False, indent=2)

            try:
                res_ext, _, _ = ia.executar_com_fallback(
                    system=system_extract,
                    user=user_extract,
                    formato_json=True,
                    descricao_log=f"extracao hunter lote {lote_idx}"
                )
                dados_ext = extrair_json_valido(res_ext)
                if dados_ext and isinstance(dados_ext.get("leads"), list):
                    novos_deste_lote = dados_ext["leads"]
            except Exception as e_ia:
                logger.warning("Falha na chamada de IA para o lote %d: %s. Usando extração heurística.", lote_idx, e_ia)

            # Heurística de fallback se a IA não retornou ou falhou no lote
            if not novos_deste_lote:
                for item in lote:
                    titulo = item.get("titulo", "")
                    # Limpa título comum de buscas (remove sufixos como "| Doctoralia", "- Instagram")
                    nome_limpo = re.split(r"[-–|•·]", titulo)[0].strip()
                    if len(nome_limpo) < 3 or any(w in nome_limpo.lower() for w in ["encontre", "os melhores", "guia de", "como fazer", "top 10"]):
                        continue

                    telefones = extrair_telefones_texto(f"{item.get('titulo')} {item.get('snippet')}")
                    novos_deste_lote.append({
                        "nome": nome_limpo,
                        "telefone": telefones[0] if telefones else "",
                        "cidade": localizacao.split(",")[0].strip(),
                        "estado": localizacao.split(",")[1].strip() if "," in localizacao else "",
                        "site": item.get("link", ""),
                        "categoria": nicho,
                        "diagnostico_ia": "Perfil ativo na web sem automação comercial de resposta rápida visível.",
                        "pitch_sugerido": f"Olá! Encontrei a {nome_limpo} através de buscas no Google e gostaria de apresentar como podemos acelerar seu atendimento e captação de clientes.",
                    })

            for l in novos_deste_lote:
                if not l.get("nome"):
                    continue

                # Se a IA não pegou telefone mas ele está no snippet, preenche
                if not l.get("telefone"):
                    tels = extrair_telefones_texto(json.dumps(lote))
                    if tels:
                        l["telefone"] = tels[0]

                l["query_origem"] = f"IA Web Hunter: {nicho} ({localizacao})"

                if salvar_banco:
                    salvar_lead_no_crm(l)

                leads_qualificados.append(l)
                _atualizar_estado(
                    total_leads_salvos=len(leads_qualificados),
                    leads=list(leads_qualificados)
                )

                if len(leads_qualificados) >= max_leads:
                    break

        # 4. Finalização
        _atualizar_estado(
            rodando=False,
            progresso=100,
            etapa="Finalizado com Sucesso",
            mensagem=f"Prospecção autônoma concluída! {len(leads_qualificados)} leads qualificados encontrados e salvos no CRM.",
            total_leads_salvos=len(leads_qualificados),
            leads=leads_qualificados,
            finalizado_em=datetime.now().isoformat(),
        )
        logger.info("IA Web Hunter concluído com sucesso. %d leads qualificados.", len(leads_qualificados))

    except Exception as exc:
        logger.exception("Erro crítico no AI Web Hunter: %s", exc)
        _atualizar_estado(
            rodando=False,
            etapa="Erro",
            mensagem=f"Ocorreu uma falha durante a busca: {exc}",
            erro=str(exc),
            finalizado_em=datetime.now().isoformat(),
        )


def iniciar_busca_hunter(
    nicho: str,
    localizacao: str,
    criterio: str = "",
    max_leads: int = 10,
    salvar_banco: bool = True
) -> Dict[str, Any]:
    global _thread_hunter

    with _lock_hunter:
        if estado_hunter.get("rodando"):
            return {
                "ok": False,
                "erro": "Uma busca autônoma com IA já está em andamento. Aguarde ou clique em Parar."
            }

    _thread_hunter = threading.Thread(
        target=_executar_pipeline_hunter,
        args=(nicho, localizacao, criterio, max_leads, salvar_banco),
        daemon=True,
    )
    _thread_hunter.start()

    return {"ok": True, "mensagem": "Busca autônoma com IA iniciada com sucesso!"}
