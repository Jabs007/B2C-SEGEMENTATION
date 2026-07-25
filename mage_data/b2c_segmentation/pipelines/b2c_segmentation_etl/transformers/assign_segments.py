 """Block 3: assign_segments (transformer)

 Loads the active K-Means model from PostgreSQL and assigns clusters
 using Euclidean distance in scaled feature space.
 """

 import sys
 import os
 import json
 import psycopg2
 import numpy as np
 import pandas as pd
 from sklearn.metrics.pairwise import euclidean_distances

 if 'transformer' not in globals():
     from mage_ai.data_preparation.decorators import transformer

 SEGMENT_LABELS = ['Champions', 'Loyal', 'At Risk', 'Regulars']


 def _load_active_model():
     """Fetch the latest active K-Means model from PostgreSQL."""
     # Use same connection params as other blocks
     config = {
         'postgres_host': os.getenv('POSTGRES_HOST', 'localhost'),
         'postgres_port': int(os.getenv('POSTGRES_PORT', 5432)),
         'postgres_db': os.getenv('POSTGRES_DB', 'b2c_segmentation'),
         'postgres_user': os.getenv('POSTGRES_USER', 'postgres'),
         'postgres_password': os.getenv('POSTGRES_PASSWORD', 'iconic2003'),
     }
     conn = psycopg2.connect(
         host=config['postgres_host'],
         port=config['postgres_port'],
         database=config['postgres_db'],
         user=config['postgres_user'],
         password=config['postgres_password']
     )
     cursor = conn.cursor()
     cursor.execute("""
         SELECT scaler_parameters, centroids
         FROM ml_models
         WHERE is_active = true
         ORDER BY created_at DESC
         LIMIT 1
     """)
     row = cursor.fetchone()
     cursor.close()
     conn.close()

     if not row:
         raise Exception("No active K-Means model found in ml_models table")

     scaler_params = row[0]  # {mean: [...], scale: [...]}
     centroids_data = row[1]  # {centroids: [...], labels: [...]}

     return scaler_params, centroids_data


 @transformer
 def transform(df: pd.DataFrame, *args, **kwargs) -> pd.DataFrame:
     if df.empty:
         return df

     df = df.copy()

     # Load model artifacts
     scaler_params, centroids_data = _load_active_model()
     scaler_mean = np.array(scaler_params['mean'])
     scaler_scale = np.array(scaler_params['scale'])
     centroids = np.array(centroids_data['centroids'])
     labels = centroids_data.get('labels', SEGMENT_LABELS)

     # Feature order must match training
     feature_cols = ['recency', 'frequency', 'monetary', 'aov', 'tenure']

     # Standardize features using training scaler
     X = df[feature_cols].values.astype(float)
     X_scaled = (X - scaler_mean) / scaler_scale

     # Compute distances to each centroid
     distances = euclidean_distances(X_scaled, centroids)
     min_distances = distances.min(axis=1)

     # Assign cluster and segment
     cluster_ids = distances.argmin(axis=1)
     df['cluster'] = cluster_ids
     df['segment'] = [labels[idx] for idx in cluster_ids]

     # Add description
     desc_map = {
         'Champions': 'High monetary value and high frequency – your best customers deserving premium treatment.',
         'Loyal': 'Recent and frequent buyers with solid spend – great candidates for loyalty programs.',
         'At Risk': 'Customers showing disengagement – consider win-back campaigns.',
         'Regulars': 'Low recent activity – may need re-engagement.',
     }
     df['segment_description'] = df['segment'].map(desc_map)

     # Add confidence score: 1 / (1 + distance)
     df['confidence'] = (1 / (1 + min_distances)).round(4)

     return df
