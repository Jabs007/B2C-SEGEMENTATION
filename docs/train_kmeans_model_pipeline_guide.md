# `train_kmeans_model` Pipeline — Configuration Guide & Implementation Plan

## 1. Pipeline Overview

| Attribute | Value |
|---|---|
| **Pipeline name** | `train_kmeans_model` |
| **Purpose** | Retrain K-Means clustering model on full historical RFM data |
| **Schedule** | Weekly (Sunday 03:00 UTC) or configurable |
| **Expected runtime** | 5–10 minutes |
| **Blocks** | 4 (1 loader, 1 transformer, 1 ML, 1 exporter) |
| **Trigger** | Automatic (schedule) or manual (API/CLI) |
| **Success criteria** | New model saved to `ml_models` with `is_active = true` |

---

## 2. Block Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        train_kmeans_model                            │
├─────────────┬───────────────────────────────────────────────────────┤
│ Block Name  │ Type                │ Responsibility                 │
├─────────────┼─────────────────────┼────────────────────────────────┤
│ #1          │ Data Loader         │ Load invoices + contacts from  │
│ load_data   │                     │ PostgreSQL                      │
├─────────────┼─────────────────────┼────────────────────────────────┤
│ #2          │ Transformer         │ Clean, deduplicate, compute RFM│
│ rfm_features│                     │ features, standardize (Z-score)│
├─────────────┼─────────────────────┼────────────────────────────────┤
│ #3          │ Custom (ML)         │ Train K-Means (50 runs, pick    │
│ train_kmeans│                     │ best), evaluate, compare, save  │
├─────────────┼─────────────────────┼────────────────────────────────┤
│ #4          │ Data Exporter       │ Save model to PostgreSQL        │
│ save_model  │                     │ ml_models + set is_active flag  │
└─────────────┴─────────────────────┴────────────────────────────────┘
```

---

## 3. Block-by-Block Configuration

### Block 1 — `load_data` (Data Loader)

**Type:** `data_loader`  
**Language:** Python

**Purpose:** Extract all historical invoice and contact data from PostgreSQL.

**Configuration:**

```python
from mage_ai.data_preparation.repo_manager import get_repo_path
from mage_ai.data_preparation.variable_manager import get_variable
from mage_ai.orchestration.db import db_connection
import pandas as pd

@data_loader
def load_data(*args, **kwargs):
    """
    Loads all historical invoices and contacts from PostgreSQL.
    """
    connection = db_connection.get_connection()
    
    invoices_query = """
        SELECT 
            invoice_id,
            customer_id,
            invoice_date,
            total_amount,
            line_items
        FROM invoices
        WHERE invoice_date >= NOW() - INTERVAL '2 years'
        ORDER BY invoice_date ASC
    """
    
    contacts_query = """
        SELECT 
            customer_id,
            first_name,
            last_name,
            email,
            created_at
        FROM contacts
    """
    
    invoices_df = pd.read_sql(invoices_query, connection)
    contacts_df = pd.read_sql(contacts_query, connection)
    
    return {
        'invoices': invoices_df,
        'contacts': contacts_df
    }
```

**Environment variables required:**

| Variable | Description |
|---|---|
| `POSTGRES_HOST` | PostgreSQL host |
| `POSTGRES_PORT` | PostgreSQL port (default: 5432) |
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |

---

### Block 2 — `rfm_features` (Transformer)

**Type:** `transformer`  
**Language:** Python

**Purpose:** Clean data, deduplicate, compute RFM features, and standardize using Z-score normalization.

**Configuration:**

```python
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timedelta

@transformer
def rfm_features(data, *args, **kwargs):
    """
    Cleans data, computes RFM features, and standardizes.
    """
    invoices_df = data['invoices']
    contacts_df = data['contacts']
    
    # Reference date (latest date in dataset for historical training)
    reference_date = invoices_df['invoice_date'].max() + timedelta(days=1)
    
    # Clean invoices
    invoices_df = invoices_df.dropna(subset=['customer_id', 'invoice_date', 'total_amount'])
    invoices_df = invoices_df.drop_duplicates(subset=['invoice_id'], keep='first')
    
    # Compute RFM per customer
    rfm = invoices_df.groupby('customer_id').agg({
        'invoice_date': [
            lambda x: (reference_date - x.max()).days,  # Recency
            lambda x: len(x.unique())                    # Frequency
        ],
        'total_amount': 'sum'  # Monetary
    }).reset_index()
    
    rfm.columns = ['customer_id', 'recency', 'frequency', 'monetary']
    
    # Calculate AOV (Average Order Value)
    rfm['aov'] = rfm['monetary'] / rfm['frequency']
    
    # Calculate tenure (days since customer creation)
    contacts_df['created_at'] = pd.to_datetime(contacts_df['created_at'])
    contacts_df['tenure'] = (reference_date - contacts_df['created_at']).dt.days
    rfm = rfm.merge(contacts_df[['customer_id', 'tenure']], on='customer_id', how='left')
    
    # Handle infinities
    rfm = rfm.replace([np.inf, -np.inf], np.nan).fillna(0)
    
    features = ['recency', 'frequency', 'monetary', 'aov', 'tenure']
    X = rfm[features].copy()
    
    # Standardize (Z-score)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    return {
        'rfm': rfm,
        'features_scaled': X_scaled,
        'features': features,
        'scaler': scaler
    }
```

**Output variables:**
- `rfm` — DataFrame with customer-level RFM data
- `features_scaled` — Numpy array of standardized features
- `features` — List of feature column names used
- `scaler` — Fitted `StandardScaler` object

---

### Block 3 — `train_kmeans` (Custom ML Block)

**Type:** `custom`  
**Language:** Python  
**Dependencies:** `scikit-learn`, `numpy`, `mlflow` (optional for experiment tracking)

**Purpose:** Train 50 K-Means models with different random initializations, evaluate each, select the best, compare against previous active model, and prepare the model artifact.

**Configuration:**

```python
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, calinski_harabasz_score
import json
import pickle
import io
from datetime import datetime

N_CLUSTERS = 5          # Configurable: typical 4-8 clusters
RANDOM_STATE = 42       # Fixed seed for reproducibility
N_INITS = 50            # Per the specification: train 50 iterations


@custom
def train_kmeans(data, *args, **kwargs):
    """
    Trains 50 K-Means models, selects best performer based on
    silhouette score, compares with previous active model, and
    returns the winning model plus metadata.
    """
    X = data['features_scaled']
    rfm = data['rfm']
    
    # ────────────────────────────────────────────
    # STEP 1: Train 50 K-Means models
    # ────────────────────────────────────────────
    best_score = -1
    best_model = None
    best_labels = None
    model_results = []
    
    for i in range(1, N_INITS + 1):
        km = KMeans(
            n_clusters=N_CLUSTERS,
            random_state=RANDOM_STATE + i,   # Different seed per run
            n_init=1,                        # Single initialization per run
            max_iter=300,
            algorithm='elkan'
        )
        labels = km.fit_predict(X)
        
        sil_score = silhouette_score(X, labels)
        ch_score = calinski_harabasz_score(X, labels)
        inertia = km.inertia_
        
        model_results.append({
            'run_id': i,
            'silhouette_score': float(sil_score),
            'calinski_harabasz_score': float(ch_score),
            'inertia': float(inertia),
        })
        
        if sil_score > best_score:
            best_score = sil_score
            best_model = km
            best_labels = labels
            best_run_id = i
    
    # ────────────────────────────────────────────
    # STEP 2: Assign best labels to RFM DataFrame
    # ────────────────────────────────────────────
    rfm['cluster'] = best_labels
    
    # ────────────────────────────────────────────
    # STEP 3: Evaluate best model (internal metrics)
    # ────────────────────────────────────────────
    cluster_summary = rfm.groupby('cluster').agg({
        'recency': ['mean', 'std', 'count'],
        'frequency': ['mean', 'std'],
        'monetary': ['mean', 'std'],
        'aov': ['mean', 'std'],
        'tenure': ['mean', 'std']
    }).round(2)
    
    # ────────────────────────────────────────────
    # STEP 4: Load previous active model for comparison
    # ────────────────────────────────────────────
    previous_model = kwargs.get('previous_model', None)
    previous_sil_score = kwargs.get('previous_sil_score', None)
    
    model_comparison = {
        'new_model_silhouette': float(best_score),
        'previous_model_silhouette': previous_sil_score,
        'improvement': float(best_score - previous_sil_score) if previous_sil_score else None,
        'deploy_new_model': True
    }
    
    if previous_sil_score is not None:
        if best_score <= previous_sil_score:
            model_comparison['deploy_new_model'] = False
    
    # ────────────────────────────────────────────
    # STEP 5: Serialize model artifact for exporter
    # ────────────────────────────────────────────
    model_bundle = {
        'model': best_model,
        'scaler': data['scaler'],
        'features': data['features'],
        'n_clusters': N_CLUSTERS,
        'cluster_labels': best_labels.tolist(),
        'rfm_data': rfm,
        'training_timestamp': datetime.utcnow().isoformat(),
        'silhouette_score': float(best_score),
        'model_parameters': {
            'n_init': N_INITS,
            'best_run_id': best_run_id,
            'algorithm': 'elkan',
            'max_iter': 300,
        },
        'cluster_summary': cluster_summary.to_dict(),
        'model_results': model_results,
        'model_comparison': model_comparison,
    }
    
    # Serialize as bytes for PostgreSQL BYTEA storage
    model_bytes = pickle.dumps(model_bundle)
    
    return {
        'model_bytes': model_bytes,
        'model_bundle': model_bundle,
        'model_comparison': model_comparison,
        'cluster_summary': cluster_summary,
        'model_results': model_results,
    }
```

---

### Block 4 — `save_model` (Data Exporter)

**Type:** `data_exporter`  
**Language:** Python

**Purpose:** Persist the best model, its metadata, and cluster summary to PostgreSQL. Set `is_active = true` if the new model is better than the previous one.

**Configuration:**

```python
import pandas as pd
import json
from datetime import datetime
from mage_ai.orchestration.db import db_connection

MODEL_NAME = 'kmeans_rfm_model'
MODEL_VERSION = 'v4'
ACTIVE_STATUS_KEY = 'kmeans:active_model_id'


@data_exporter
def save_model(data, *args, **kwargs):
    """
    Saves the best K-Means model to PostgreSQL ml_models table.
    Sets is_active = true only if the new model outperforms
    the previous active model.
    """
    connection = db_connection.get_connection()
    cursor = connection.cursor()
    
    model_bytes = data['model_bytes']
    model_bundle = data['model_bundle']
    comparison = data['model_comparison']
    cluster_summary = data['cluster_summary']
    
    # Determine if new model should be activated
    should_activate = comparison.get('deploy_new_model', True)
    is_active = should_activate
    
    # Insert new model record
    insert_query = """
        INSERT INTO ml_models (
            model_name,
            model_type,
            model_version,
            model_artifact,
            parameters,
            metrics,
            features,
            cluster_summary,
            is_active,
            trained_at,
            created_at,
            updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING model_id
    """
    
    cursor.execute(insert_query, (
        MODEL_NAME,
        'kmeans',
        MODEL_VERSION,
        model_bytes,                           # BYTEA - serialized pickle
        json.dumps(model_bundle['model_parameters']),
        json.dumps({
            'silhouette_score': model_bundle['silhouette_score'],
            'calinski_harabasz_score': float(model_bundle['model_results'][0]['calinski_harabasz_score']),
            'n_clusters': model_bundle['n_clusters'],
            'model_comparison': comparison,
        }),
        json.dumps(model_bundle['features']),
        json.dumps(cluster_summary),
        is_active,
        model_bundle['training_timestamp'],
        datetime.utcnow(),
        datetime.utcnow()
    ))
    
    new_model_id = cursor.fetchone()[0]
    
    # If new model is better: deactivate all previous models and activate this one
    if should_activate:
        cursor.execute(
            "UPDATE ml_models SET is_active = false WHERE model_id != %s",
            (new_model_id,)
        )
        cursor.execute(
            "UPDATE ml_models SET is_active = true WHERE model_id = %s",
            (new_model_id,)
        )
    
    # Deactivate previous models regardless (cleanup)
    cursor.execute(
        "UPDATE ml_models SET is_active = false WHERE is_active = true AND model_id != %s",
        (new_model_id,)
    )
    connection.commit()
    cursor.close()
    connection.close()
    
    return {
        'model_id': new_model_id,
        'is_active': is_active,
        'activated': should_activate,
    }
```

**`ml_models` table schema (PostgreSQL):**

```sql
CREATE TABLE IF NOT EXISTS ml_models (
    model_id          SERIAL PRIMARY KEY,
    model_name        VARCHAR(255) NOT NULL,
    model_type        VARCHAR(100) NOT NULL,
    model_version     VARCHAR(50)  NOT NULL,
    model_artifact    BYTEA        NOT NULL,
    parameters        JSONB,
    metrics           JSONB,
    features          JSONB,
    cluster_summary   JSONB,
    is_active         BOOLEAN      DEFAULT FALSE,
    trained_at        TIMESTAMP    NOT NULL,
    created_at        TIMESTAMP    DEFAULT NOW(),
    updated_at        TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_models_active 
    ON ml_models(model_name) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ml_models_type 
    ON ml_models(model_type);
```

---

## 4. Pipeline YAML Config

Create or edit the pipeline definition file:

`pipelines/train_kmeans_model/pipeline.yaml`

```yaml
version: 0.2.x

pipelines:
  - pipeline:
      uuid: train_kmeans_model
      name: train_kmeans_model
      description: |
        Weekly/Monthly K-Means retraining pipeline. Loads all historical data,
        computes RFM features, trains 50 K-Means models, selects best performer
        by silhouette score, compares with previous model, and saves to PostgreSQL.
      
      blocks:
        - block:
            uuid: load_data
            type: data_loader
            name: load_data
            language: python
            file_path: pipelines/train_kmeans_model/load_data.py
      
        - block:
            uuid: rfm_features
            type: transformer
            name: rfm_features
            language: python
            file_path: pipelines/train_kmeans_model/rfm_features.py
            upstream_blocks:
              - load_data
      
        - block:
            uuid: train_kmeans
            type: custom
            name: train_kmeans
            language: python
            file_path: pipelines/train_kmeans_model/train_kmeans.py
            upstream_blocks:
              - rfm_features
            configuration:
              n_clusters: 5
              n_initializations: 50
              random_state: 42
              max_iter: 300
              algorithm: elkan
      
        - block:
            uuid: save_model
            type: data_exporter
            name: save_model
            language: python
            file_path: pipelines/train_kmeans_model/save_model.py
            upstream_blocks:
              - train_kmeans
            configuration:
              model_name: kmeans_rfm_model
              model_version: v4
              table_name: ml_models
      
      schedules:
        - schedule:
            uuid: weekly_sunday_3am
            name: weekly_sunday_3am
            cron_expression: "0 3 * * 0"
            start_time: "2026-07-27T03:00:00+00:00"
            schedule_type: time
            schedule_intervals:
              - interval_schedule:
                  hours: 3
                  minutes: 0
                  seconds: 0
                  day_of_week: Sunday
```

---

## 5. Mage AI System Settings

`pipelines/train_kmeans_model/settings.yaml`

```yaml
pipelines:
  train_kmeans_model:
    type: python
    remote_variables_dir: s3://your-bucket/mage-remote-variables/train_kmeans_model/
    spark_config:
      - key: spark.executor.memory
        value: "4g"
    variables_dir: variables
    status: active
    tags:
      - ml
      - kmeans
      - model-training
```

---

## 6. Environment Variables (`.env`)

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=b2c_segmentation
POSTGRES_USER=mage
POSTGRES_PASSWORD=<secure_password>

# Mage AI
MAGE_DATABASE_CONNECTION_URL=postgresql+psycopg2://mage:<password>@localhost:5432/mage

# Model storage
MODEL_STORAGE_PATH=/tmp/mage_models
S3_BUCKET=your-bucket

# MLflow (optional — for experiment tracking)
MLFLOW_TRACKING_URI=http://localhost:5000
MLFLOW_EXPERIMENT_NAME=kmeans_rfm_segmentation
```

---

## 7. Implementation Steps

### Step 1: Create Database Table

```bash
psql -U mage -d b2c_segmentation -f infra/postgres/init_ml_models.sql
```

### Step 2: Install Dependencies

```bash
pip install scikit-learn>=1.4.0 pandas numpy psycopg2-binary
```

### Step 3: Create Block Files

```
/home/jabs101/Documents/B2C_APP/b2c_segmentation/pipelines/train_kmeans_model/
├── load_data.py
├── rfm_features.py
├── train_kmeans.py
├── save_model.py
└── pipeline.yaml
```

### Step 4: Initialize Pipeline in Mage

```bash
mage init pipeline train_kmeans_model --template custom
```

### Step 5: Connect Upstream Block

```python
# In b2c_segmentation_etl pipeline's Save Results block,
# trigger train_kmeans_model after daily run completes:
@data_exporter
def save_results(data, *args, **kwargs):
    ...
    from mage_ai.orchestration.pipeline_scheduler import PipelineScheduler
    PipelineScheduler.trigger_pipeline_run(
        pipeline_uuid='train_kmeans_model',
        config={'triggered_by': 'b2c_segmentation_etl'}
    )
```

### Step 6: Run Pipeline Manually (Validation)

```bash
mage run train_kmeans_model --run-name "weekly_model_retrain_$(date +%Y%m%d)"
```

### Step 7: Verify Output

```sql
SELECT 
    model_id,
    model_name,
    model_version,
    is_active,
    (metrics->>'silhouette_score')::float as silhouette_score,
    trained_at
FROM ml_models
ORDER BY trained_at DESC
LIMIT 5;
```

---

## 8. Integration with `b2c_segmentation_etl`

In the **daily ETL pipeline**, update the `load_active_model` block to fetch the active model:

```python
# pipelines/b2c_segmentation_etl/blocks/load_model.py
@transformer
def load_model(*args, **kwargs):
    connection = db_connection.get_connection()
    cursor = connection.cursor()
    
    cursor.execute("""
        SELECT model_artifact, model_type, model_version, trained_at
        FROM ml_models
        WHERE is_active = true
        ORDER BY trained_at DESC
        LIMIT 1
    """)
    
    result = cursor.fetchone()
    model_bytes = result[0]
    
    import pickle
    model_bundle = pickle.loads(model_bytes)
    
    return {
        'model': model_bundle['model'],
        'scaler': model_bundle['scaler'],
        'features': model_bundle['features'],
        'cluster_labels': model_bundle.get('cluster_labels', {}),
    }
```

---

## 9. Monitoring & Alerts

```sql
-- Pipeline run log table
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id         UUID PRIMARY KEY,
    pipeline_name  VARCHAR(255),
    start_time     TIMESTAMP,
    end_time       TIMESTAMP,
    status         VARCHAR(50),   -- 'running', 'completed', 'failed'
    dataset_size   INTEGER,
    silhouette_score FLOAT,
    model_saved    BOOLEAN,
    error_message  TEXT
);

-- Alert threshold
-- Trigger alert if silhouette_score < 0.4 (model quality degraded)
```

---

## 10. Rollback Procedure

If the new model performs worse than expected:

```sql
-- Find previous good model
SELECT model_id, trained_at, (metrics->>'silhouette_score')::float as silhouette
FROM ml_models
WHERE model_name = 'kmeans_rfm_model'
ORDER BY trained_at DESC
LIMIT 2;

-- Reactivate previous model
UPDATE ml_models SET is_active = false WHERE model_id = <new_bad_model_id>;
UPDATE ml_models SET is_active = true WHERE model_id = <previous_good_model_id>;
```

---

## 11. Success Criteria Checklist

| Criterion | Check |
|---|---|
| ✅ Pipeline runs on schedule (weekly Sunday 03:00 UTC) | |
| ✅ Loads all historical invoices and contacts | |
| ✅ Computes valid RFM features (no nulls) | |
| ✅ Trains 50 K-Means iterations with different random states | |
| ✅ Best model selected via silhouette score | |
| ✅ New model surpassed OR did NOT surpass previous (log comparison) | |
| ✅ Model serialized and saved to `ml_models` table | |
| ✅ `is_active` flag set correctly (true only if better) | |
| ✅ `b2c_segmentation_etl` picks up new model on next run | |
| ✅ Previous models retained in database | |
