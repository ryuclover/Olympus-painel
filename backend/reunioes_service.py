"""
reunioes_service.py — Serviço modular e isolado para gerenciamento de reuniões,
atualização de status no CRM e formatação de alertas de notificação.
"""
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

import db

logger = logging.getLogger(__name__)


def agora_iso() -> str:
    """Retorna timestamp ISO padrão com resolução em segundos."""
    return datetime.now().isoformat(timespec="seconds")


def formatar_alerta_reuniao_admin(
    lead_nome: str,
    data_reuniao: str,
    horario_reuniao: str,
    telefone_cliente: str,
    categoria: str = "",
    cidade: str = ""
) -> str:
    """
    Função pura: formata o texto do alerta instantâneo enviado ao WhatsApp pessoal do dono.
    """
    msg = (
        f"🚀 *Olympus Alerta:* **Nova Reunião Fechada com Sucesso!**\n\n"
        f"👤 *Cliente:* {lead_nome or 'Cliente'}\n"
        f"📅 *Data:* {data_reuniao}\n"
        f"⏰ *Horário:* {horario_reuniao}\n"
        f"📱 *Telefone:* {telefone_cliente}\n"
    )
    if categoria or cidade:
        detalhe = f"{categoria} - {cidade}" if (categoria and cidade) else (categoria or cidade)
        msg += f"🎯 *Segmento / Cidade:* {detalhe}\n"
    msg += "\n*Os detalhes já foram salvos e sincronizados no seu CRM do Olympus!*"
    return msg


def salvar_reuniao(
    lead_id: str,
    lead_nome: str,
    telefone: str,
    canal: str,
    titulo: str,
    data_reuniao: str,
    horario_reuniao: str,
    link_reuniao: str = "",
    notas: str = "",
    status: str = "agendada"
) -> Dict[str, Any]:
    """
    Insere uma reunião no banco SQLite e atualiza o lead para status 'reuniao' no CRM.
    Retorna dicionário com o ID inserido e sucesso da operação.
    """
    if not data_reuniao or not horario_reuniao:
        raise ValueError("Data e horário da reunião são obrigatórios.")

    agora = agora_iso()
    conexao = db.conectar()
    try:
        cur = conexao.execute(
            """
            INSERT INTO reunioes (
                lead_id, lead_nome, telefone, canal, titulo,
                data_reuniao, horario_reuniao, link_reuniao, status, notas, criado_em, atualizado_em
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lead_id or "",
                lead_nome or "Lead",
                telefone or "",
                canal or "maps",
                titulo or f"Reunião com {lead_nome}",
                data_reuniao,
                horario_reuniao,
                link_reuniao or "",
                status,
                notas or "",
                agora,
                agora,
            )
        )
        reuniao_id = cur.lastrowid

        # Atualiza status no CRM
        if lead_id:
            if canal == "maps" or not canal:
                conexao.execute(
                    "UPDATE leads SET status = 'reuniao', atualizado_em = ? WHERE place_id = ?",
                    (agora, lead_id)
                )
            elif canal == "instagram":
                try:
                    conexao.execute(
                        "UPDATE instagram_leads SET status = 'reuniao' WHERE id = ?",
                        (int(lead_id),)
                    )
                except Exception:
                    pass

        conexao.commit()
        return {
            "id": reuniao_id,
            "lead_id": lead_id,
            "lead_nome": lead_nome,
            "data_reuniao": data_reuniao,
            "horario_reuniao": horario_reuniao,
            "status": status,
        }
    finally:
        conexao.close()


def listar_reunioes() -> List[Dict[str, Any]]:
    """Retorna lista de reuniões ordenada por data e horário decrescentes."""
    conexao = db.conectar()
    try:
        linhas = conexao.execute(
            """
            SELECT id, lead_id, lead_nome, telefone, canal, titulo, data_reuniao,
                   horario_reuniao, link_reuniao, status, notas, criado_em, atualizado_em
            FROM reunioes
            ORDER BY data_reuniao DESC, horario_reuniao DESC
            """
        ).fetchall()
        return [dict(r) for r in linhas]
    finally:
        conexao.close()


def atualizar_reuniao(reuniao_id: int, status: Optional[str] = None, notas: Optional[str] = None) -> bool:
    """Atualiza status e/ou notas de uma reunião."""
    campos = []
    valores = []
    if status is not None:
        campos.append("status = ?")
        valores.append(status)
    if notas is not None:
        campos.append("notas = ?")
        valores.append(notas)

    if not campos:
        return False

    campos.append("atualizado_em = ?")
    valores.append(agora_iso())
    valores.append(reuniao_id)

    conexao = db.conectar()
    try:
        cur = conexao.execute(f"UPDATE reunioes SET {', '.join(campos)} WHERE id = ?", valores)
        conexao.commit()
        return cur.rowcount > 0
    finally:
        conexao.close()


def excluir_reuniao(reuniao_id: int) -> bool:
    """Exclui um agendamento de reunião."""
    conexao = db.conectar()
    try:
        cur = conexao.execute("DELETE FROM reunioes WHERE id = ?", (reuniao_id,))
        conexao.commit()
        return cur.rowcount > 0
    finally:
        conexao.close()
