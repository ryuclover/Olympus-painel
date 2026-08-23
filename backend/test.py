
import sqlite3
limit = 100
offset = 0
sql = 'SELECT * FROM leads WHERE status IN (\'contatado\', \'respondeu\', \'qualificado\') ORDER BY visto_em DESC, nota DESC LIMIT ? OFFSET ?'
parametros = [limit + 1, offset]
conn = sqlite3.connect('olympus.db')
conn.row_factory = sqlite3.Row
try:
    linhas = conn.execute(sql, parametros).fetchall()
    print('Found:', len(linhas))
except Exception as e:
    print('Error:', type(e).__name__, e)

