"""
telefone_util.py — Identificação, extração de múltiplos números e priorização de WhatsApp.
"""
import re
from typing import Tuple, List, Dict, Union, Optional


def limpar_digitos(telefone: str) -> str:
    """Retorna apenas dígitos, removendo DDI 55 se vier com 12 ou 13 dígitos."""
    if not telefone:
        return ""
    d = re.sub(r"\D", "", str(telefone))
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    return d


def classificar_telefone(telefone: str) -> Tuple[str, bool, str]:
    """
    Classifica um número individual de telefone.
    Retorna: (tipo_telefone, tem_whatsapp, telefone_formatado)
    Tipos: 'celular', 'fixo', '0800', 'nenhum'
    """
    if not telefone:
        return "nenhum", False, ""

    d = limpar_digitos(telefone)

    # 0800 ou 0300
    if d.startswith("0800") or d.startswith("0300"):
        return "0800", False, telefone.strip()

    # Celular com DDD (11 dígitos: DDD + 9 dígitos começando com 9)
    if len(d) == 11 and d[2] == "9":
        ddd = d[:2]
        num = f"{d[2:7]}-{d[7:]}"
        fmt = f"({ddd}) {num}"
        return "celular", True, fmt

    # Fixo com DDD (10 dígitos: DDD + 8 dígitos começando com 2, 3, 4, 5)
    if len(d) == 10 and d[2] in ("2", "3", "4", "5"):
        ddd = d[:2]
        num = f"{d[2:6]}-{d[6:]}"
        fmt = f"({ddd}) {num}"
        return "fixo", False, fmt

    # Celular sem DDD (9 dígitos começando com 9)
    if len(d) == 9 and d[0] == "9":
        return "celular", True, f"{d[:5]}-{d[5:]}"

    # Fixo sem DDD (8 dígitos)
    if len(d) == 8:
        return "fixo", False, f"{d[:4]}-{d[4:]}"

    # Formato desconhecido mas com tamanho razoável
    if len(d) >= 8:
        is_cel = len(d) == 11 and d[2] == "9"
        return ("celular" if is_cel else "fixo"), is_cel, telefone.strip()

    return "nenhum", False, ""


def extrair_candidatos_telefone(raw_input: Union[str, List[str], None]) -> List[str]:
    """
    Recebe um texto ou lista de textos e extrai todos os fragmentos ou padrões de telefone.
    Divide por separadores comuns: '/', '|', ';', '\n', ',', ' ou ', ' e '.
    """
    if not raw_input:
        return []

    if isinstance(raw_input, list):
        entradas = raw_input
    else:
        entradas = [str(raw_input)]

    candidatos = []
    delimitadores = re.compile(r'[/|;\n,]|(?:\s+e\s+)|\bou\b', re.IGNORECASE)

    for item in entradas:
        if not item:
            continue
        # Limpa prefixos
        texto = re.sub(r'^(?:telefone|phone|tel|contato|celular|whats(?:app)?)\s*:\s*', '', str(item).strip(), flags=re.IGNORECASE)
        partes = delimitadores.split(texto)
        for p in partes:
            p_limpo = p.strip()
            # Se tem pelo menos 7 dígitos, consideramos candidato
            if len(re.sub(r'\D', '', p_limpo)) >= 7:
                candidatos.append(p_limpo)

    return candidatos


def processar_multiplos_telefones(raw_input: Union[str, List[str], None]) -> Dict:
    """
    Processa um ou mais telefones de um lead, deduplica e prioriza o WhatsApp (Celular)
    como contato principal.
    
    Retorna dicionário:
    {
        "telefone_principal": str,
        "tipo_telefone": str,
        "tem_whatsapp": bool,
        "telefones_secundarios": list[str],
        "todos_formatados": list[str],
        "resumo_telefones": str
    }
    """
    candidatos = extrair_candidatos_telefone(raw_input)
    
    celulares = []
    fixos = []
    outros = []
    digitos_vistos = set()

    for cand in candidatos:
        tipo, tem_wpp, fmt = classificar_telefone(cand)
        if tipo == "nenhum" or not fmt:
            continue
        
        dig = limpar_digitos(fmt)
        if dig in digitos_vistos:
            continue
        digitos_vistos.add(dig)

        info = {"numero": fmt, "tipo": tipo, "tem_whatsapp": tem_wpp}
        if tipo == "celular":
            celulares.append(info)
        elif tipo == "fixo":
            fixos.append(info)
        else:
            outros.append(info)

    # PRIORIZAÇÃO INTELIGENTE:
    # 1. Se tem celular/WhatsApp -> Celular vira o principal!
    # 2. Fixos e outros celulares viram secundários.
    # 3. Se só tem fixo -> Fixo vira o principal.
    
    todos_ordenados = celulares + fixos + outros

    if not todos_ordenados:
        return {
            "telefone_principal": "",
            "tipo_telefone": "nenhum",
            "tem_whatsapp": False,
            "telefones_secundarios": [],
            "todos_formatados": [],
            "resumo_telefones": "",
        }

    principal = todos_ordenados[0]
    secundarios = [item["numero"] for item in todos_ordenados[1:]]
    todos_fmt = [item["numero"] for item in todos_ordenados]

    # Cria um resumo amigável se houver múltiplos
    if secundarios:
        resumo = f"{principal['numero']} ({principal['tipo'].title()}) | Outros: {', '.join(secundarios)}"
    else:
        resumo = principal["numero"]

    return {
        "telefone_principal": principal["numero"],
        "tipo_telefone": principal["tipo"],
        "tem_whatsapp": principal["tem_whatsapp"],
        "telefones_secundarios": secundarios,
        "todos_formatados": todos_fmt,
        "resumo_telefones": resumo,
    }

