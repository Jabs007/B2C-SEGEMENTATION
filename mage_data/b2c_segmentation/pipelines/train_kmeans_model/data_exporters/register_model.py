"""Register trained model in PostgreSQL."""

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
    # Use environment variables (set in docker-compose.mage.yml)
    host = os.getenv('POSTGRES_HOST', 'host.docker.internal')
    port = int(os.getenv('POSTGRES_PORT', 5432))
    db = os.getenv('POSTGRES_DB', 'b2c_segmentation')
    user = os.getenv('POSTGRES_USER', 'postgres')
    password = os.getenv('POSTGRES_PASSWORD', 'iconic2003')

    conn = psycopg2.connect(
        host=host, port=port,
        database=db, user=user,
        password=password
    )
    conn.autocommit = False
    cursor = conn.cursor()

    version = f"kmeans_rfm_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    model_record = {
        'model_name': 'kmeans_rfm_segmentation',
        'version': version,
        'model_type': 'KMeans',
        'algorithm': 'K-Means',
        'hyperparameters': json.dumps({
            'n_clusters': upstream_output['n_clusters'],
            'random_state': 42,
            'n_init': upstream_output.get('n_init', 50)
        }),
        'training_metrics': json.dumps({
            'silhouette_score': upstream_output['silhouette_score'],
            'inertia': upstream_output['inertia']
        }),
        'status': 'production',
        'features_used': json.dumps(['recency', 'frequency', 'monetary', 'aov', 'tenure']),
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

    # Deactivate all previous models of this name
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
