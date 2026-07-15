import sys
import os

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'b2c_segmentation_app'))
sys.path.insert(0, PROJECT_ROOT)

from scripts.train_kmeans_model import load_environment_config, get_db_connections, fetch_rfm_data

def execute():
    config = load_environment_config()
    conn = get_db_connections(config)
    raw_data = fetch_rfm_data(conn)
    conn.close()

  customer_ids = [row[0] for row in raw_data]
  features = [[row[1], row[2], row[3], row[4], row[5]] for row in raw_data]

    return {
        'customer_ids': customer_ids,
        'features': features,
        'count': len(raw_data)
    }

if __name__ == '__main__':
    result = execute()
    print(f"Loaded {result['count']} customers for training")
