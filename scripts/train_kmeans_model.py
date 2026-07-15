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
import psycopg2.extras
from datetime import datetime
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import pickle
import json

# Configure logging
log_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'logs')
log_dir = os.path.abspath(log_dir)
os.makedirs(log_dir, exist_ok=True)

# Use UTF-8 encoding for log file to support Unicode symbols
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, 'train_kmeans.log'), mode='a', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class TrainingError(Exception):
    """Custom exception for training failures"""
    pass

def load_environment_config():
    """Load database configuration from environment variables or DATABASE_URL"""
    # Load .env file if it exists in the project root
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    env_path = os.path.abspath(env_path)
    if os.path.exists(env_path):
        logger.info(f"Loading environment from {env_path}")
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
    
    # Try to parse DATABASE_URL first (format: postgresql://user:password@host:port/db)
    database_url = os.getenv('DATABASE_URL')
    if database_url:
        import urllib.parse
        parsed = urllib.parse.urlparse(database_url)
        postgres_host = parsed.hostname or 'localhost'
        postgres_port = parsed.port or 5432
        postgres_db = parsed.path.lstrip('/')
        postgres_user = parsed.username
        postgres_password = parsed.password
    else:
        # Fallback to individual environment variables
        postgres_host = os.getenv('POSTGRES_HOST', 'localhost')
        postgres_port = int(os.getenv('POSTGRES_PORT', '5432'))
        postgres_db = os.getenv('POSTGRES_DB', 'b2c_segmentation')
        postgres_user = os.getenv('POSTGRES_USER', 'postgres')
        postgres_password = os.getenv('POSTGRES_PASSWORD', '')
    
    config = {
        'postgres_host': postgres_host,
        'postgres_port': postgres_port,
        'postgres_db': postgres_db,
        'postgres_user': postgres_user,
        'postgres_password': postgres_password,
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
        
        logger.info("PostgreSQL connection established")
        
        return postgres_conn
        
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {str(e)}")
        raise TrainingError(f"Database connection failed: {str(e)}")

def fetch_rfm_data(conn):
    """Fetch RFM metrics from customers table"""
    cursor = conn.cursor()
    query = """
    SELECT "customerId", recency, frequency, monetary, aov, tenure
    FROM customers
    WHERE recency IS NOT NULL AND frequency IS NOT NULL AND monetary IS NOT NULL
    """
    
    try:
        cursor.execute(query)
        data = cursor.fetchall()
        logger.info(f"Fetched {len(data)} customers with complete RFM data")
        return data
    except Exception as e:
        logger.error(f"Failed to fetch RFM data: {str(e)}")
        raise TrainingError(f"Data fetch failed: {str(e)}")
    finally:
        cursor.close()

def preprocess_features(data):
    """Extract features and handle missing data"""
    try:
        # Convert to numpy array (customerId, recency, frequency, monetary, aov, tenure)
        customer_ids = [str(row[0]) for row in data]
        features = np.array([[row[1], row[2], row[3], row[4], row[5]] for row in data], dtype=float)

        # Standardize features (K-Means is sensitive to scale)
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)

        logger.info(f"Preprocessed {len(features)} customer records")
        logger.info(f" Feature shape: {features_scaled.shape}")
        logger.info(f" Feature mean: {np.mean(features_scaled, axis=0)}")
        logger.info(f" Feature std: {np.std(features_scaled, axis=0)}")

        return customer_ids, features, features_scaled, scaler

    except Exception as e:
        logger.error(f"Feature preprocessing failed: {str(e)}")
        raise TrainingError(f"Feature processing error: {str(e)}")

def train_kmeans_model(features_scaled, n_clusters=4, random_state=42):
    """Train K-Means model with silhouette scoring"""
    try:
        # Train model - high n_init for robust centroid finding
        model = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=50)
        model.fit(features_scaled)
        
        # Calculate silhouette score
        score = silhouette_score(features_scaled, model.labels_)
        
        logger.info(f"K-Means training completed")
        logger.info(f"  n_clusters: {n_clusters}")
        logger.info(f"  silhouette_score: {score:.4f}")
        logger.info(f"  inertia: {model.inertia_:.2f}")
        logger.info(f"  iterations: {model.n_iter_}")
        
        # Validate model quality - adjusted threshold for RFM segmentation
        if score <= 0.40:
            logger.warning(f"WARNING: Silhouette score {score:.4f} is below threshold of 0.40")
        
        return model, score
        
    except Exception as e:
        logger.error(f"Model training failed: {str(e)}")
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
            'training_timestamp': datetime.now().astimezone().isoformat(),
            'scaler_mean': scaler.mean_.tolist(),
            'scaler_std': scaler.scale_.tolist(),
        }
        
        # Create model directory if it doesn't exist (inside project)
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
        model_dir = os.path.abspath(model_dir)
        os.makedirs(model_dir, exist_ok=True)
        
        # Save as JSON
        model_path = f"{model_dir}/{version_name}.json"
        with open(model_path, 'w') as f:
            json.dump(artifacts, f, indent=2)
        
        logger.info(f"Model artifacts saved to {model_path}")
        return artifacts
        
    except Exception as e:
        logger.error(f"Failed to save model artifacts: {str(e)}")
        raise TrainingError(f"Artifact save failed: {str(e)}")

def create_model_record_in_postgres(conn, artifacts):
    """Store model configuration and metadata in PostgreSQL ml_models table"""
    cursor = conn.cursor()

    try:
        # First, deactivate all existing models
        cursor.execute("UPDATE ml_models SET is_active = false WHERE model_name = 'kmeans_rfm_segmentation'")
        logger.info("Deactivated previous models")
        
        # Prepare SQL - new model will be active by default
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
            'created_at': datetime.now().astimezone(),
            'features_used': json.dumps(['recency', 'frequency', 'monetary', 'aov', 'tenure']),
            'scaler_parameters': json.dumps({
                'mean': artifacts['scaler_mean'],
                'scale': artifacts['scaler_std']
            }),
            'centroids': psycopg2.extras.Json({
                'centroids': artifacts['centroids'],
                'labels': ['Champions', 'Loyal', 'At Risk', 'Regulars'],
            }),
            'training_data_count': artifacts['labels_'].__len__(),
            'is_active': True,  # Explicitly set new model as active
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
        logger.info(f"Model record created in PostgreSQL with model_id={model_id} (ACTIVE)")
        return model_id
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to create model record in PostgreSQL: {str(e)}")
        raise TrainingError(f"PostgreSQL record creation failed: {str(e)}")
    finally:
        cursor.close()

def write_cluster_assignments_to_postgres(conn, customer_ids, labels, model_version):
    """Write cluster assignments to PostgreSQL customer_clusters table"""
    cursor = conn.cursor()
    
    try:
        # Truncate existing clusters for this version
        cursor.execute("""
        DELETE FROM customer_clusters 
        WHERE "modelVersion" = %s
        """, (model_version,))
        
        # Insert new cluster assignments - use quoted identifiers for camelCase columns
        insert_query = """
        INSERT INTO customer_clusters ("customerId", "clusterId", "modelVersion")
        VALUES (%s, %s, %s)
        """
        
        data = [(cid, int(label), model_version) for cid, label in zip(customer_ids, labels)]
        
        # Batch insert for performance
        psycopg2.extras.execute_batch(cursor, insert_query, data, page_size=1000)
        
        # Commit the transaction
        conn.commit()
        
        logger.info(f"Cluster assignments written to PostgreSQL for {len(customer_ids)} customers")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to write cluster assignments to PostgreSQL: {str(e)}")
        raise TrainingError(f"PostgreSQL cluster write failed: {str(e)}")
    finally:
        cursor.close()

def write_cluster_assignments_to_clickhouse(customer_ids, labels, model_version):
    """Write cluster assignments to ClickHouse (optional - skip if unavailable)"""
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
        WHERE "modelVersion" = 'kmeans_rfm_v1'
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
        
        # Note: ClickHouse table 'customer_clusters' may not exist; skip if any error
        cursor.executemany(
            "INSERT INTO customer_clusters (customer_id, cluster_id, model_version) VALUES",
            data
        )
        
        conn.commit()
        logger.info(f"Cluster assignments written to ClickHouse for {len(customer_ids)} customers")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.warning(f"ClickHouse write skipped (table or connection issue): {str(e)}")

def validate_model_quality(model, score, threshold=0.40):
    """Validate that model meets quality thresholds"""
    if score < threshold:
        raise TrainingError(
            f"Model quality failed: silhouette score {score:.4f} < {threshold} threshold"
        )
        logger.info(f"Model validation passed: silhouette score {score:.4f} >= {threshold}")


def log_training_outcome(artifacts, model_id, success=True):
    """Log overall training outcome"""
    outcome = "SUCCESS" if success else "FAILED"
    
    logger.info("\n" + "="*60)
    logger.info(f"TRAINING OUTCOME: {outcome}")
    logger.info("="*60)
    
    # Safely access artifacts fields (may not exist if training failed early)
    version = artifacts.get('version', 'N/A')
    model_type = artifacts.get('model_type', 'N/A')
    centroids_count = len(artifacts.get('centroids', []))
    labels_count = len(artifacts.get('labels_', []))
    silhouette = artifacts.get('silhouette_score', 0.0)
    
    logger.info(f"Model version: {version}")
    logger.info(f"Model type: {model_type}")
    logger.info(f"Centroids: {centroids_count} clusters")
    logger.info(f"Training samples: {labels_count}")
    logger.info(f"Silhouette score: {silhouette:.4f}")
    logger.info(f"Model ID (PostgreSQL): {model_id if model_id else 'N/A'}")
    logger.info("="*60 + "\n")


def main():
    """Main training pipeline execution"""
    try:
        logger.info("Starting K-Means Customer Segmentation Training")
        logger.info(f"Working directory: {os.getcwd()}")
        
        # Load configuration
        config = load_environment_config()
        logger.info("Configuration loaded")
        
        # Connect to databases
        postgres_conn = get_db_connections(config)
        logger.info("Database connections established")
        
        # Fetch training data
        raw_data = fetch_rfm_data(postgres_conn)
        if not raw_data:
            raise TrainingError("No RFM data available for training")
        
        # Preprocess features
        customer_ids, features, features_scaled, scaler = preprocess_features(raw_data)
        
        # Train model
        model, score = train_kmeans_model(features_scaled, n_clusters=4, random_state=42)
        
        # Validate model quality
        validate_model_quality(model, score, threshold=0.40)
        
        # Save model artifacts with timestamped version for uniqueness
        version_name = f"kmeans_rfm_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        artifacts = save_model_artifacts(model, scaler, score, version_name=version_name)
        
        # Create PostgreSQL model record
        model_id = create_model_record_in_postgres(postgres_conn, artifacts)
        
        # Write cluster assignments to PostgreSQL
        write_cluster_assignments_to_postgres(postgres_conn, customer_ids, artifacts['labels_'], version_name)
        
        # Write cluster assignments to ClickHouse (if available)
        write_cluster_assignments_to_clickhouse(customer_ids, artifacts['labels_'], version_name)
        
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