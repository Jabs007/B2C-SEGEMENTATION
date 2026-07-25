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

# Get latest model version
cursor.execute("SELECT version FROM ml_models ORDER BY created_at DESC LIMIT 1;")
version = cursor.fetchone()[0]

print("="*70)
print("K-MEANS CLUSTER DISTRIBUTION")
print("="*70)
print(f"\nModel: {version}")

# Distribution
cursor.execute(f"""
    SELECT "clusterId", COUNT(*) as count
    FROM customer_clusters 
    WHERE "modelVersion" = '{version}'
    GROUP BY "clusterId" 
    ORDER BY "clusterId"
""")
rows = cursor.fetchall()

total = sum(r[1] for r in rows)
print(f"\n{'Cluster':<10} {'Customers':<15} {'% of Total':<15}")
print("-"*70)
for cluster, count in rows:
    pct = (count / total) * 100
    print(f"{cluster:<10} {count:<15,} {pct:<15.1f}%")

print("-"*70)
print(f"{'TOTAL':<10} {total:<15,} {100.0:<15.1f}%")

# RFM Profiles
print("\n" + "="*70)
print("CLUSTER RFM PROFILES (Average Values)")
print("="*70)

cursor.execute(f"""
    SELECT 
        c."clusterId" as cluster,
        COUNT(*) as count,
        AVG(cust.recency) as avg_recency,
        AVG(cust.frequency) as avg_frequency,
        AVG(cust.monetary) as avg_monetary,
        AVG(cust.aov) as avg_aov,
        AVG(cust.tenure) as avg_tenure
    FROM customer_clusters c
    JOIN customers cust ON c."customerId" = cust."customerId"
    WHERE c."modelVersion" = '{version}'
    GROUP BY c."clusterId" 
    ORDER BY c."clusterId"
""")

profile_rows = cursor.fetchall()

print(f"{'Cluster':<10} {'Count':<12} {'Recency':<12} {'Frequency':<12} {'Monetary':<15} {'AOV':<15} {'Tenure':<12}")
print("-"*70)
for row in profile_rows:
    cluster, count, recency, frequency, monetary, aov, tenure = row
    print(f"{cluster:<10} {count:<12,} {recency:<12.1f} {frequency:<12.1f} ${monetary:<14.2f} ${aov:<14.2f} {tenure:<12.1f}")

cursor.close()
conn.close()

print("\n" + "="*70)
print("INTERPRETATION GUIDE")
print("="*70)
print("""
Lower Recency (days) = More recent customer (better)
Higher Frequency = More purchases (better)
Higher Monetary = More total spend (better)
Higher AOV = Larger average order value (better)
Higher Tenure = Longer customer lifetime (better)

Typical segment patterns:
- High recency (low days) + high frequency + high monetary → Champions
- High recency + low frequency + low monetary → At Risk / Lost
- Medium all-around → Regulars / Loyal
""")
