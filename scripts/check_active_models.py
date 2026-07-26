import psycopg2
import json

with open('.env', 'r') as f:
    for line in f:
        if line.startswith('DATABASE_URL'):
            db_url = line.split('=', 1)[1].strip()
            break

import urllib.parse
parsed = urllib.parse.urlparse(db_url)

conn = psycopg2.connect(
    host=parsed.hostname,
    port=parsed.port,
    database=parsed.path.lstrip('/'),
    user=parsed.username,
    password=parsed.password
)

cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM ml_models WHERE is_active = true;")
active_count = cursor.fetchone()[0]
print(f"Active models: {active_count}")

cursor.execute("SELECT version, created_at FROM ml_models ORDER BY is_active DESC, created_at DESC;")
for row in cursor.fetchall():
    print(f"  {row[1]} - {row[0]}")

cursor.close()
conn.close()
