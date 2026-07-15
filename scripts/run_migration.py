import psycopg2
from psycopg2 import sql

# Read SQL migration file
with open('drizzle/0001_sync_missing_tables.sql', 'r') as f:
    sql_content = f.read()

# Split on statement-breakpoint
statements = sql_content.split('--> statement-breakpoint')

# Connect to database
conn = psycopg2.connect(
    host='localhost',
    port=5432,
    database='b2c_segmentation',
    user='postgres',
    password='iconic2003'
)
conn.autocommit = True
cursor = conn.cursor()

try:
    for stmt in statements:
        stmt = stmt.strip()
        if stmt:
            cursor.execute(stmt)
            print(f"Executed: {stmt[:50]}...")
    print("Migration completed successfully")
except Exception as e:
    print(f"Error: {e}")
finally:
    cursor.close()
    conn.close()
