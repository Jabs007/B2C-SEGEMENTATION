import sys
import os
import json

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'b2c_segmentation_app'))
sys.path.insert(0, PROJECT_ROOT)

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

SEGMENT_LABELS = ['Champions', 'Loyal', 'At Risk', 'Regulars']

def execute(upstream_output, **kwargs):
    features = upstream_output['features']
    customer_ids = upstream_output['customer_ids']
    n_clusters = kwargs.get('n_clusters', 4)
    random_state = kwargs.get('random_state', 42)

    X = np.array(features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
    labels = model.fit_predict(X_scaled)

    silhouette = silhouette_score(X_scaled, labels)

    return {
        'customer_ids': customer_ids,
        'labels': labels.tolist(),
        'centroids': model.cluster_centers_.tolist(),
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_std': scaler.scale_.tolist(),
        'inertia': float(model.inertia_),
        'silhouette_score': float(silhouette),
        'n_clusters': n_clusters,
        'training_count': len(customer_ids)
    }

if __name__ == '__main__':
    mock_upstream = {'features': [[10, 5, 1000], [50, 2, 500], [5, 20, 2000]], 'customer_ids': ['c1', 'c2', 'c3']}
    result = execute(mock_upstream)
    print(json.dumps(result, indent=2))
