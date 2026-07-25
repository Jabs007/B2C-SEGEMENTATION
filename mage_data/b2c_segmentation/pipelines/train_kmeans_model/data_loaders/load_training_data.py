 import sys
 import os
 import psycopg2
 
 # Add project root to path
 PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'b2c_segmentation_app'))
 sys.path.insert(0, PROJECT_ROOT)
 
 def execute():
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
     cursor = conn.cursor()
     
     # Fetch RFM data directly (matching your script logic)
     query = """
         SELECT 
             c."customerId",
             c.recency,
             c.frequency,
             c.monetary,
             c.aov,
             c.tenure
         FROM customers c
         ORDER BY c."customerId"
     """
     cursor.execute(query)
     raw_data = cursor.fetchall()
     cursor.close()
     conn.close()

     customer_ids = [row[0] for row in raw_data]
     features = [[float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5])] for row in raw_data]

     return {
         'customer_ids': customer_ids,
         'features': features,
         'count': len(raw_data)
     }

if __name__ == '__main__':
    result = execute()
    print(f"Loaded {result['count']} customers for training")
