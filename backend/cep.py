"""
cep.py — Resolucao de CEP para cidade/estado via ViaCEP (gratuito, sem chave).
Se o valor digitado nao for CEP, retorna como esta.
"""
import re
import requests

_CEP_RE = re.compile(r"^\d{5}-?\d{3}$")


def eh_cep(valor: str) -> bool:
    return bool(_CEP_RE.match(valor.strip()))


def resolver_localizacao(valor: str) -> dict:
    """
    Retorna {localizacao, cidade, estado, cep}.
    Se for CEP, consulta ViaCEP e extrai cidade/estado.
    Se for texto livre, retorna como esta.
    """
    valor = valor.strip()

    if not eh_cep(valor):
        return {"localizacao": valor, "cidade": valor, "estado": "", "cep": ""}

    cep_limpo = valor.replace("-", "")
    try:
        resp = requests.get(
            f"https://viacep.com.br/ws/{cep_limpo}/json/",
            timeout=5,
        )
        resp.raise_for_status()
        dados = resp.json()

        if dados.get("erro"):
            raise ValueError(f"CEP {valor} nao encontrado")

        cidade = dados.get("localidade", "")
        estado = dados.get("uf", "")
        bairro = dados.get("bairro", "").strip()
        if bairro:
            localizacao = f"{bairro}, {cidade} - {estado}"
        else:
            localizacao = f"{cidade}, {estado}"

        return {
            "localizacao": localizacao,
            "cidade": cidade,
            "estado": estado,
            "bairro": bairro,
            "cep": valor,
        }

    except requests.RequestException as exc:
        raise RuntimeError(f"Erro ao consultar ViaCEP: {exc}") from exc
