import psycopg2

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

# Get the latest model version
cursor.execute("SELECT version FROM ml_models ORDER BY created_at DESC LIMIT 1;")
result = cursor.fetchone()

if result:
    version = result[0]
    print(f"Latest model version: {version}")
    
    print("\nCluster distribution:")
    cursor.execute(f"""
        SELECT "clusterId", COUNT(*) 
        FROM customer_clusters 
        WHERE "modelVersion" = '{version}'
        GROUP BY "clusterId" 
        ORDER BY "clusterId"
    """)
    rows = cursor.fetchall()
    if rows:
        for cluster, count in rows:
            print(f"  Cluster {cluster}: {count} customers")
    else:
        print("  NO DATA FOUND in customer_clusters for this model version!")
        
    print("\nRecord count check:")
    cursor.execute(f"SELECT COUNT(*) FROM customer_clusters WHERE \"modelVersion\" = '{version}';")
    total = cursor.fetchone()[0]
    print(f"  Total: {total}")

cursor.close()
conn.close()
