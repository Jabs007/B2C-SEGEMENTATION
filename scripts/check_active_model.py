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

print("Checking ml_models table for active model:")
cursor.execute("SELECT model_id, version, is_active, hyperparameters, scaler_parameters FROM ml_models WHERE is_active = true;")
active = cursor.fetchall()

if active:
    for row in active:
        model_id, version, is_active, hyperparams, scaler_params = row
        print(f"\nActive Model ID: {model_id}")
        print(f"Version: {version}")
        print(f"Is Active: {is_active}")
        
        # Check if scaler parameters exist
        if scaler_params:
            if isinstance(scaler_params, dict):
                print(f"Scaler means: {len(scaler_params.get('mean', []))} features")
                print(f"Scaler stds: {len(scaler_params.get('scale', []))} features")
            else:
                print(f"Scaler params type: {type(scaler_params)}")
        else:
            print("WARNING: No scaler parameters stored!")
            
        if hyperparams:
            if isinstance(hyperparams, dict):
                print(f"Hyperparameters: n_clusters={hyperparams.get('n_clusters')}")
            else:
                print(f"Hyperparams type: {type(hyperparams)}")
else:
    print("NO ACTIVE MODEL FOUND!")

cursor.close()
conn.close()
