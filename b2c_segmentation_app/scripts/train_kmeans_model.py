# K-Means Customer Segmentation Training Script
"""
Production-ready training script for K-Means customer segmentation model.

Stores model artifacts in PostgreSQL ml_models table
Writes cluster assignments to both PostgreSQL and ClickHouse
Includes comprehensive error handling and logging
"""

import logging
import os
import sys
import psycopg2
from datetime import datetime
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import pickle
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
  handlers=[
    logging.FileHandler(os.path.join(os.path.dirname(__file__), '..', '..', 'logs', 'train_kmeans.log'), mode='a'),
    logging.StreamHandler()
  ]
)
logger = logging.getLogger(__name__)

class TrainingError(Exception):
    """Custom exception for training failures"""
    pass

def load_environment_config():
    """Load database configuration from environment variables"""
    config = {
        'postgres_host': os.getenv('POSTGRES_HOST', 'localhost'),
        'postgres_port': int(os.getenv('POSTGRES_PORT', '5432')),
        'postgres_db': os.getenv('POSTGRES_DB', 'b2c_segmentation'),
        'postgres_user': os.getenv('POSTGRES_USER', 'app_user'),
        'postgres_password': os.getenv('POSTGRES_PASSWORD', ''),
        'clickhouse_host': os.getenv('CLICKHOUSE_HOST', 'localhost'),
        'clickhouse_port': int(os.getenv('CLICKHOUSE_PORT', '9000')),
        'clickhouse_db': os.getenv('CLICKHOUSE_DB', 'b2c_segmentation'),
        'clickhouse_user': os.getenv('CLICKHOUSE_USER', 'default'),
        'clickhouse_password': os.getenv('CLICKHOUSE_PASSWORD', ''),
    }
    return config

def get_db_connections(config):
    """Establish database connections"""
    try:
        # PostgreSQL connection
        postgres_conn = psycopg2.connect(
            host=config['postgres_host'],
            port=config['postgres_port'],
            database=config['postgres_db'],
            user=config['postgres_user'],
            password=config['postgres_password']
        )
        postgres_conn.autocommit = False
        
        logger.info("✓ PostgreSQL connection established")
        
        return postgres_conn
        
    except Exception as e:
        logger.error(f"✗ Failed to connect to PostgreSQL: {str(e)}")
        raise TrainingError(f"Database connection failed: {str(e)}")

def fetch_rfm_data(conn):
    """Fetch RFM metrics for 8,031 customers"""
    cursor = conn.cursor()
    query = """
    SELECT customer_id, recency, frequency, monetary_value
    FROM rfm_metrics 
    WHERE recency IS NOT NULL AND frequency IS NOT NULL AND monetary_value IS NOT NULL
    """
    
    try:
        cursor.execute(query)
        data = cursor.fetchall()
        logger.info(f"✓ Fetched {len(data)} customers with complete RFM data")
        return data
    except Exception as e:
        logger.error(f"✗ Failed to fetch RFM data: {str(e)}")
        raise TrainingError(f"Data fetch failed: {str(e)}")
    finally:
        cursor.close()

def preprocess_features(data):
    """Extract features and handle missing data"""
    try:
        # Convert to numpy array
        customer_ids = [row[0] for row in data]
        features = np.array([[row[1], row[2], row[3]] for row in data])
        
        # Standardize features
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)
        
        logger.info(f"✓ Preprocessed {len(features)} customer records")
        logger.info(f"  Feature shape: {features_scaled.shape}")
        logger.info(f"  Feature mean: {np.mean(features_scaled, axis=0)}")
        logger.info(f"  Feature std: {np.std(features_scaled, axis=0)}")
        
        return customer_ids, features, features_scaled, scaler
        
    except Exception as e:
        logger.error(f"✗ Feature preprocessing failed: {str(e)}")
        raise TrainingError(f"Feature processing error: {str(e)}")

def train_kmeans_model(features_scaled, n_clusters=4, random_state=42):
    """Train K-Means model with silhouette scoring"""
    try:
        # Train model
        model = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
        model.fit(features_scaled)
        
        # Calculate silhouette score
        score = silhouette_score(features_scaled, model.labels_)
        
        logger.info(f"✓ K-Means training completed")
        logger.info(f"  n_clusters: {n_clusters}")
        logger.info(f"  silhouette_score: {score:.4f}")
        logger.info(f"  inertia: {model.inertia_:.2f}")
        logger.info(f"  iterations: {model.n_iter_}")
        
        # Validate model quality
        if score <= 0.60:
            logger.warning(f"⚠ Silhouette score {score:.4f} is below threshold of 0.60")
            # Don't fail, but log warning
        
        return model, score
        
    except Exception as e:
        logger.error(f"✗ Model training failed: {str(e)}")
        raise TrainingError(f"Model training error: {str(e)}")

def save_model_artifacts(model, scaler, score, version_name="kmeans_rfm_v1"):
    """Serialize model and preprocessing artifacts"""
    try:
        # Get model parameters and centroids
        artifacts = {
            'model_type': 'KMeans',
            'version': version_name,
            'n_clusters': model.n_clusters,
            'random_state': model.random_state,
            'n_init': model.n_init,
            'centroids': model.cluster_centers_.tolist(),
            'labels_': model.labels_.tolist(),
            'inertia': model.inertia_,
            'silhouette_score': score,
            'training_timestamp': datetime.utcnow().isoformat(),
            'scaler_mean': scaler.mean_.tolist(),
            'scaler_std': scaler.scale_.tolist(),
        }
        
  # Create model directory if it doesn't exist
  model_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'models')
  model_dir = os.path.abspath(model_dir)
  os.makedirs(model_dir, exist_ok=True)
        
        # Save as JSON
        model_path = f"{model_dir}/{version_name}.json"
        with open(model_path, 'w') as f:
            json.dump(artifacts, f, indent=2)
        
        logger.info(f"✓ Model artifacts saved to {model_path}")
        return artifacts
        
    except Exception as e:
        logger.error(f"✗ Failed to save model artifacts: {str(e)}")
        raise TrainingError(f"Artifact save failed: {str(e)}")

def create_model_record_in_postgres(conn, artifacts):
    """Store model configuration and metadata in PostgreSQL ml_models table"""
    cursor = conn.cursor()
    
    try:
        # Prepare SQL
        model_record = {
            'model_name': 'kmeans_rfm_segmentation',
            'version': artifacts['version'],
            'model_type': artifacts['model_type'],
            'algorithm': 'K-Means',
            'hyperparameters': json.dumps({
                'n_clusters': artifacts['n_clusters'],
                'random_state': artifacts['random_state'],
                'n_init': artifacts['n_init']
            }),
            'training_metrics': json.dumps({
                'silhouette_score': artifacts['silhouette_score'],
                'inertia': artifacts['inertia']
            }),
            'status': 'production',
            'created_at': datetime.utcnow(),
            'features_used': json.dumps(['recency', 'frequency', 'monetary_value']),
            'scaler_parameters': json.dumps({
                'mean': artifacts['scaler_mean'],
                'scale': artifacts['scaler_std']
            }),
            'centroids': psycopg2.extras.Json(artifacts['centroids']),
            'training_data_count': artifacts['labels_'].__len__(),
        }
        
        # Generate INSERT statement
        columns = ', '.join(model_record.keys())
        values_placeholders = ', '.join(['%s'] * len(model_record))
        
        query = f"""
        INSERT INTO ml_models ({columns})
        VALUES ({values_placeholders})
        RETURNING model_id
        """
        
        cursor.execute(query, tuple(model_record.values()))
        model_id = cursor.fetchone()[0]
        
        conn.commit()
        logger.info(f"✓ Model record created in PostgreSQL with model_id={model_id}")
        return model_id
        
    except Exception as e:
        conn.rollback()
        logger.error(f"✗ Failed to create model record in PostgreSQL: {str(e)}")
        raise TrainingError(f"PostgreSQL record creation failed: {str(e)}")
    finally:
        cursor.close()

def write_cluster_assignments_to_postgres(conn, customer_ids, labels):
    """Write cluster assignments to PostgreSQL customer_clusters table"""
    cursor = conn.cursor()
    
    try:
        # Truncate existing clusters for this version
        cursor.execute("""
        DELETE FROM customer_clusters 
        WHERE model_version = 'kmeans_rfm_v1'
        """)
        
        # Insert new cluster assignments
        insert_query = """
        INSERT INTO customer_clusters (customer_id, cluster_id, model_version)
        VALUES (%s, %s, 'kmeans_rfm_v1')
        """
        
        data = [(cid, int(label),) for cid, label in zip(customer_ids, labels)]
        
        # Batch insert for performance
        psycopg2.extras.execute_batch(cursor, insert_query, data, page_size=1000)
        
        logger.info(f"✓ Cluster assignments written to PostgreSQL for {len(customer_ids)} customers")
        
    except Exception as e:
        logger.error(f"✗ Failed to write cluster assignments to PostgreSQL: {str(e)}")
        raise TrainingError(f"PostgreSQL cluster write failed: {str(e)}")
    finally:
        cursor.close()

def write_cluster_assignments_to_clickhouse(customer_ids, labels):
    """Write cluster assignments to ClickHouse (simplified - use direct driver)"""
    try:
        import clickhouse_driver
        
        conn = clickhouse_driver.connect(
            host=os.getenv('CLICKHOUSE_HOST', 'localhost'),
            port=os.getenv('CLICKHOUSE_PORT', 9000),
            database=os.getenv('CLICKHOUSE_DB', 'b2c_segmentation'),
            user=os.getenv('CLICKHOUSE_USER', 'default'),
            password=os.getenv('CLICKHOUSE_PASSWORD', ''),
        )
        
        cursor = conn.cursor()
        
        # Truncate existing clusters for this version
        cursor.execute("""
        ALTER TABLE customer_clusters DELETE 
        WHERE model_version = 'kmeans_rfm_v1'
        """)
        
        # Insert new cluster assignments - ClickHouse prefers array operations
        data = [(cid, label, 'kmeans_rfm_v1') for cid, label in zip(customer_ids, labels)]
        
        # Use fast insert method
        insert_batch = [
            (cid, label, model_version)
            for cid, label, model_version in [
                (cid, int(label), 'kmeans_rfm_v1')
                for cid, label in zip(customer_ids, labels)
            ]
        ]
        
        cursor.executemany(
            "INSERT INTO customer_clusters (customer_id, cluster_id, model_version) VALUES",
            data
        )
        
        conn.commit()
        logger.info(f"✓ Cluster assignments written to ClickHouse for {len(customer_ids)} customers")
        
        cursor.close()
        conn.close()
        
    except ImportError:
        logger.warning("⚠ ClickHouse driver not available, skipping ClickHouse write")
    except Exception as e:
        logger.error(f"✗ Failed to write cluster assignments to ClickHouse: {str(e)}")
        raise TrainingError(f"ClickHouse cluster write failed: {str(e)}")

def validate_model_quality(model, score, threshold=0.60):
    """Validate that model meets quality thresholds"""
    if score < threshold:
        raise TrainingError(
            f"Model quality failed: silhouette score {score:.4f} < {threshold} threshold"
        )
    logger.info(f"✓ Model validation passed: silhouette score {score:.4f} >= {threshold}")


def log_training_outcome(artifacts, model_id, success=True):
    """Log overall training outcome"""
    outcome = "SUCCESS" if success else "FAILED"
    
    logger.info("\n" + "="*60)
    logger.info(f"TRAINING OUTCOME: {outcome}")
    logger.info("="*60)
    logger.info(f"Model version: {artifacts['version']}")
    logger.info(f"Model type: {artifacts['model_type']}")
    logger.info(f"Centroids: {len(artifacts['centroids'])} clusters")
    logger.info(f"Training samples: {len(artifacts['labels_'])}")
    logger.info(f"Silhouette score: {artifacts['silhouette_score']:.4f}")
    logger.info(f"Model ID (PostgreSQL): {model_id}")
    logger.info("="*60 + "\n")


def main():
    """Main training pipeline execution"""
    try:
        logger.info("Starting K-Means Customer Segmentation Training")
        logger.info(f"Working directory: {os.getcwd()}")
        
        # Load configuration
        config = load_environment_config()
        logger.info("Configuration loaded ✓")
        
        # Connect to databases
        postgres_conn = get_db_connections(config)
        logger.info("Database connections established ✓")
        
        # Fetch training data
        raw_data = fetch_rfm_data(postgres_conn)
        if not raw_data:
            raise TrainingError("No RFM data available for training")
        
        # Preprocess features
        customer_ids, features, features_scaled, scaler = preprocess_features(raw_data)
        
        # Train model
        model, score = train_kmeans_model(features_scaled, n_clusters=4, random_state=42)
        
        # Validate model quality
        validate_model_quality(model, score, threshold=0.60)
        
        # Save model artifacts
        artifacts = save_model_artifacts(model, scaler, score, version_name="kmeans_rfm_v1")
        
        # Create PostgreSQL model record
        model_id = create_model_record_in_postgres(postgres_conn, artifacts)
        
        # Write cluster assignments to PostgreSQL
        write_cluster_assignments_to_postgres(postgres_conn, customer_ids, artifacts['labels_'])
        
        # Write cluster assignments to ClickHouse (if available)
        write_cluster_assignments_to_clickhouse(customer_ids, artifacts['labels_'])
        
        # Log final outcome
        log_training_outcome(artifacts, model_id, success=True)
        
        return True
        
    except TrainingError as e:
        logger.error(f"Training failed: {str(e)}")
        log_training_outcome({'version': 'kmeans_rfm_v1'}, None, success=False)
        return False
        
    except Exception as e:
        logger.error(f"Unexpected error during training: {str(e)}", exc_info=True)
        log_training_outcome({'version': 'kmeans_rfm_v1'}, None, success=False)
        return False
        
    finally:
        try:
            postgres_conn.close()
        except:
            pass
        logger.info("Training script completed")


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)