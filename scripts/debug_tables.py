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

print("1. Check ml_models table:")
cursor.execute("SELECT model_id, model_name, version, created_at FROM ml_models ORDER BY created_at DESC LIMIT 5;")
rows = cursor.fetchall()
for row in rows:
    print(f"   {row}")

print("\n2. Check customer_clusters table count:")
cursor.execute("SELECT COUNT(*) FROM customer_clusters;")
count = cursor.fetchone()[0]
print(f"   Total records: {count}")

print("\n3. Check customer_clusters sample:")
cursor.execute("SELECT * FROM customer_clusters LIMIT 3;")
rows = cursor.fetchall()
for row in rows:
    print(f"   {row}")

print("\n4. Check customers table count:")
cursor.execute("SELECT COUNT(*) FROM customers;")
count = cursor.fetchone()[0]
print(f"   Total customers: {count}")

print("\n5. Check column names in customer_clusters:")
cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_clusters' ORDER BY ordinal_position;")
cols = cursor.fetchall()
print(f"   Columns: {[c[0] for c in cols]}")

cursor.close()
conn.close()
