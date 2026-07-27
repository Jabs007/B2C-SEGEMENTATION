import sys
import os
import json
import psycopg2

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'b2c_segmentation_app'))
sys.path.insert(0, PROJECT_ROOT)

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

SEGMENT_LABELS = ['Champions', 'Loyal', 'At Risk', 'Regulars']


def _get_previous_silhouette():
    try:
        host = os.getenv('POSTGRES_HOST', 'host.docker.internal')
        port = int(os.getenv('POSTGRES_PORT', 5432))
        db = os.getenv('POSTGRES_DB', 'b2c_segmentation')
        user = os.getenv('POSTGRES_USER', 'postgres')
        password = os.getenv('POSTGRES_PASSWORD', 'iconic2003')

        conn = psycopg2.connect(host=host, port=port, database=db, user=user, password=password)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT training_metrics FROM ml_models "
            "WHERE model_name = 'kmeans_rfm_segmentation' AND is_active = TRUE "
            "ORDER BY trained_at DESC LIMIT 1"
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row and row[0]:
            return json.loads(row[0]).get('silhouette_score')
    except Exception as exc:
        print(f"[train_model] Could not load previous model: {exc}")
    return None


def execute(upstream_output, **kwargs):
    features = upstream_output['features']
    customer_ids = upstream_output['customer_ids']
    n_clusters = kwargs.get('n_clusters', 5)
    random_state = kwargs.get('random_state', 42)
    n_init = kwargs.get('n_init', 50)

    X = np.array(features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    previous_sil = _get_previous_silhouette()

    best_sil = -1.0
    best_run_id = None
    best_labels = None
    best_inertia = None
    best_centroids = None

    results = []
    for run_id in range(1, n_init + 1):
        km = KMeans(
            n_clusters=n_clusters,
            random_state=random_state + run_id,
            n_init=1,
            max_iter=300,
            algorithm='elkan',
        )
        labels = km.fit_predict(X_scaled)
        sil = silhouette_score(X_scaled, labels)

        results.append({
            'run_id': run_id,
            'silhouette_score': float(sil),
            'inertia': float(km.inertia_),
        })

        if sil > best_sil:
            best_sil = sil
            best_run_id = run_id
            best_labels = labels
            best_inertia = float(km.inertia_)
            best_centroids = km.cluster_centers_.tolist()

    should_activate = (previous_sil is None) or (best_sil > previous_sil)

    return {
        'customer_ids': customer_ids,
        'labels': best_labels.tolist(),
        'centroids': best_centroids,
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_std': scaler.scale_.tolist(),
        'inertia': best_inertia,
        'silhouette_score': float(best_sil),
        'previous_silhouette_score': previous_sil,
        'is_better': should_activate,
        'n_clusters': n_clusters,
        'best_run_id': best_run_id,
        'training_count': len(customer_ids),
        'run_results': results,
    }

if __name__ == '__main__':
    mock_upstream = {
        'features': [[10, 5, 1000], [50, 2, 500], [5, 20, 2000], [2, 40, 3000], [15, 10, 800]],
        'customer_ids': ['c1', 'c2', 'c3', 'c4', 'c5'],
    }
    result = execute(mock_upstream)
    print(json.dumps(result, indent=2))
