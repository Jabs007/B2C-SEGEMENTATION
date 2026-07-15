import sys
import os
import json
from datetime import datetime, timezone

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'b2c_segmentation_app'))
sys.path.insert(0, PROJECT_ROOT)

import psycopg2
import psycopg2.extras
from scripts.train_kmeans_model import load_environment_config

def execute(upstream_output, **kwargs):
    config = load_environment_config()
    conn = psycopg2.connect(
        host=config['postgres_host'], port=config['postgres_port'],
        database=config['postgres_db'], user=config['postgres_user'],
        password=config['postgres_password']
    )
    conn.autocommit = False
    cursor = conn.cursor()

    version = f"kmeans_rfm_v{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"

    model_record = {
        'model_name': 'kmeans_rfm_segmentation',
        'version': version,
        'model_type': 'KMeans',
        'algorithm': 'K-Means',
        'hyperparameters': json.dumps({'n_clusters': upstream_output['n_clusters'], 'random_state': 42, 'n_init': 10}),
        'training_metrics': json.dumps({
            'silhouette_score': upstream_output['silhouette_score'],
            'inertia': upstream_output['inertia']
        }),
        'status': 'production',
        'features_used': json.dumps(['recency', 'frequency', 'monetary_value']),
        'scaler_parameters': json.dumps({
            'mean': upstream_output['scaler_mean'],
            'scale': upstream_output['scaler_std']
        }),
        'centroids': psycopg2.extras.Json({
            'centroids': upstream_output['centroids'],
            'labels': ['Champions', 'Loyal', 'At Risk', 'Regulars']
        }),
        'training_data_count': upstream_output['training_count'],
        'is_active': True,
    }

    cursor.execute("UPDATE ml_models SET is_active = false WHERE model_name = 'kmeans_rfm_segmentation'")
    columns = ', '.join(model_record.keys())
    placeholders = ', '.join(['%s'] * len(model_record))
    cursor.execute(
        f"INSERT INTO ml_models ({columns}) VALUES ({placeholders}) RETURNING model_id",
        tuple(model_record.values())
    )
    model_id = cursor.fetchone()[0]
    conn.commit()
    cursor.close()
    conn.close()

    return {
        'model_id': model_id,
        'version': version,
        'silhouette_score': upstream_output['silhouette_score'],
        'status': 'registered'
    }

if __name__ == '__main__':
    import numpy as np
    mock_upstream = {
        'customer_ids': ['c1', 'c2', 'c3'],
        'labels': [0, 1, 2],
        'centroids': [[0.5, 0.5, 0.5], [1.0, 1.0, 1.0], [0.0, 0.0, 0.0]],
        'scaler_mean': [10.0, 5.0, 1000.0],
        'scaler_std': [5.0, 3.0, 500.0],
        'inertia': 100.0,
        'silhouette_score': 0.68,
        'n_clusters': 4,
        'training_count': 8031
    }
    result = execute(mock_upstream)
    print(json.dumps(result, indent=2))
