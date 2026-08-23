from flask import Blueprint, jsonify
from db import conectar

bp = Blueprint("dashboard", __name__)

@bp.route("/api/dashboard/metrics", methods=["GET"])
def obter_metricas():
    conexao = conectar()
    try:
        # 1. Total leads
        total_leads = conexao.execute("SELECT COUNT(*) as c FROM leads").fetchone()["c"]

        # 2. Funnel metrics
        funil_query = conexao.execute("SELECT status, COUNT(*) as c FROM leads GROUP BY status").fetchall()
        funil = {f["status"]: f["c"] for f in funil_query}
        
        # 3. Categorias/Nichos performance
        # Quantos tem de cada categoria
        categorias_query = conexao.execute("""
            SELECT 
                categoria, 
                COUNT(*) as total,
                SUM(CASE WHEN status != 'novo' THEN 1 ELSE 0 END) as contatados,
                SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) as fechados
            FROM leads 
            WHERE categoria IS NOT NULL AND categoria != ''
            GROUP BY categoria
            ORDER BY total DESC
            LIMIT 10
        """).fetchall()
        
        nichos = []
        for c in categorias_query:
            nichos.append({
                "categoria": c["categoria"],
                "total": c["total"],
                "contatados": c["contatados"] or 0,
                "fechados": c["fechados"] or 0
            })

        # 4. Score médio dos contatados vs não contatados
        score_novo = conexao.execute("SELECT AVG(score) as s FROM leads WHERE status = 'novo'").fetchone()["s"] or 0
        score_contatado = conexao.execute("SELECT AVG(score) as s FROM leads WHERE status != 'novo'").fetchone()["s"] or 0

        metricas = {
            "total_leads": total_leads,
            "funil": funil,
            "nichos": nichos,
            "score_medio_novo": round(score_novo, 1),
            "score_medio_contatado": round(score_contatado, 1)
        }
        return jsonify(metricas)

    finally:
        conexao.close()
