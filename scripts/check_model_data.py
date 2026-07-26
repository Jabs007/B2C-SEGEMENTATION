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

cursor.execute("SELECT version, scaler_parameters, centroids FROM ml_models WHERE is_active = true;")
row = cursor.fetchone()

if row:
    version, scaler_params, centroids = row
    print(f"Active model: {version}")
    print(f"\nScaler parameters type: {type(scaler_params)}")
    print(f"Scaler parameters: {scaler_params}")
    
    print(f"\nCentroids type: {type(centroids)}")
    if isinstance(centroids, dict):
        print(f"Centroids keys: {centroids.keys()}")
        print(f"Centroids labels: {centroids.get('labels')}")
    else:
        print(f"Centroids: {centroids}")
else:
    print("No active model found")

cursor.close()
conn.close()
