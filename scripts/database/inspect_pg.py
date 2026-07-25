import os, psycopg2

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")
print('Tables:')
for r in cur.fetchall(): print(' ', r[0])
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='customers' ORDER BY ordinal_position")
print('customers columns:')
for r in cur.fetchall(): print(' ', r)
cur.execute("SELECT COUNT(*) FROM customers")
print('customers count:', cur.fetchone()[0])
cur.close(); conn.close()
