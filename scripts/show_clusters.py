import psycopg2
import json

# Load .env to get DATABASE_URL
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

print("="*70)
print("K-MEANS CLUSTER DISTRIBUTION")
print("="*70)

# Get latest model version
cursor.execute("""
    SELECT version, hyperparameters, training_metrics, created_at
    FROM ml_models 
    WHERE model_name = 'kmeans_rfm_segmentation' 
    ORDER BY created_at DESC 
    LIMIT 1
""")
model_info = cursor.fetchone()

if model_info:
    version, hyperparameters, training_metrics, created_at = model_info
    # psycopg2 returns JSON columns as dicts already
    hyperparams = hyperparameters if isinstance(hyperparameters, dict) else {}
    metrics = training_metrics if isinstance(training_metrics, dict) else {}
    
    n_clusters = hyperparams.get('n_clusters', 'N/A')
    silhouette = metrics.get('silhouette_score', 0.0)
    inertia = metrics.get('inertia', 0.0)
    
    print(f"\nModel: {version}")
    print(f"Created: {created_at}")
    print(f"Clusters: {n_clusters}")
    print(f"Silhouette Score: {silhouette:.4f}")
    print(f"Inertia: {inertia:,.2f}")
    print("\n" + "-"*70)

# Get cluster distribution
cursor.execute(f"""
    SELECT 
        "clusterId" as cluster,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as pct
    FROM customer_clusters 
    WHERE "modelVersion" = '{version}'
    GROUP BY "clusterId" 
    ORDER BY "clusterId"
""")

rows = cursor.fetchall()

print(f"{'Cluster':<10} {'Customers':<15} {'% of Total':<15}")
print("-"*70)
total = 0
for row in rows:
    cluster, count, pct = row
    print(f"{cluster:<10} {count:<15,} {pct:<15}%")
    total += count

print("-"*70)
print(f"{'TOTAL':<10} {total:<15,} {100.0:<15}%")

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
    # Round in Python
    recency = round(recency, 1) if recency else 0
    frequency = round(frequency, 1) if frequency else 0
    monetary = round(monetary, 2) if monetary else 0.0
    aov = round(aov, 2) if aov else 0.0
    tenure = round(tenure, 1) if tenure else 0
    print(f"{cluster:<10} {count:<12,} {recency:<12} {frequency:<12} ${monetary:<14.2f} ${aov:<14.2f} {tenure:<12}")

cursor.close()
conn.close()

print("\n" + "="*70)
