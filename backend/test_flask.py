
import rotas_leads
from flask import Flask, request

app = Flask(__name__)
app.register_blueprint(rotas_leads.bp)

with app.test_request_context('/api/leads?status=em_andamento&limit=100'):
    resp = rotas_leads.listar_leads()
    print('RESPONSE:', resp.get_json())

