const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:iconic2003@localhost:5432/b2c_segmentation';

const modelPath = path.join(__dirname, '..', 'models', 'kmeans_rfm_20260716_010003.json');

async function main() {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

  const centroidsData = {
    centroids: model.centroids,
    labels: ['Champions', 'Loyal', 'At Risk', 'Regulars'],
  };

  const scalerData = {
    mean: model.scaler_mean,
    scale: model.scaler_std,
  };

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("UPDATE ml_models SET is_active = false WHERE model_name = 'kmeans_rfm_segmentation'");
    await client.query(
      `INSERT INTO ml_models (
        model_name, version, model_type, algorithm,
        hyperparameters, training_metrics, status,
        features_used, scaler_parameters, centroids,
        training_data_count, is_active, created_at
      ) VALUES (
        'kmeans_rfm_segmentation', $1, 'KMeans', 'K-Means',
        $2, $3, 'production',
        $4, $5, $6,
        $7, true, $8
      )`,
      [
        model.version,
        JSON.stringify({ n_clusters: model.n_clusters, random_state: model.random_state, n_init: model.n_init }),
        JSON.stringify({ silhouette_score: model.silhouette_score, inertia: model.inertia }),
        JSON.stringify(['recency', 'frequency', 'monetary', 'aov', 'tenure']),
        JSON.stringify(scalerData),
        JSON.stringify(centroidsData),
        Array.isArray(model.labels_) ? model.labels_.length : 0,
        new Date(),
      ]
    );
    await client.query("COMMIT");
    console.log(`Registered active model: ${model.version}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Failed to register model:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
