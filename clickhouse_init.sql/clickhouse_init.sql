-- Create database
CREATE DATABASE IF NOT EXISTS statspeak;

-- Use the database
USE statspeak;

-- Create raw invoices table (simulating Statspeak's data)
CREATE TABLE IF NOT EXISTS invoices (
    invoice_id String,
    customer_id String,
    invoice_date Date,
    total_amount Float64,
    line_total Float64,
    product_id String,
    quantity Int32
) ENGINE = MergeTree()
ORDER BY (customer_id, invoice_date);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
    customer_id String,
    customer_name String,
    email String,
    phone String,
    country String,
    created_date Date
) ENGINE = MergeTree()
ORDER BY customer_id;

-- Create output table for customer segments
CREATE TABLE IF NOT EXISTS customer_segments (
    customer_id String,
    segment String,
    confidence Float32,
    recency Int32,
    frequency Int32,
    monetary Float64,
    aov Float64,
    tenure Int32,
    prediction_date DateTime
) ENGINE = MergeTree()
ORDER BY (customer_id, prediction_date);

-- Create segment history table (for tracking migrations)
CREATE TABLE IF NOT EXISTS segment_history (
    customer_id String,
    segment String,
    confidence Float32,
    pipeline_run_id String,
    prediction_date DateTime,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (customer_id, prediction_date);

-- Create pipeline logs table
CREATE TABLE IF NOT EXISTS pipeline_logs (
    pipeline_run_id String,
    run_date DateTime,
    total_customers Int32,
    successfully_scored Int32,
    errors Int32,
    average_confidence Float32,
    processing_time_seconds Float32,
    status String
) ENGINE = MergeTree()
ORDER BY run_date;

-- Create model registry table
CREATE TABLE IF NOT EXISTS model_registry (
    model_id String,
    model_version String,
    training_date DateTime,
    training_data_size Int32,
    silhouette_score Float32,
    davies_bouldin_index Float32,
    feature_names String,
    centroids String,
    scaler_params String,
    status String,
    deployed_date DateTime,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY training_date;

-- Create drift metrics table
CREATE TABLE IF NOT EXISTS drift_metrics (
    pipeline_run_id String,
    feature String,
    training_mean Float32,
    training_std Float32,
    current_mean Float32,
    current_std Float32,
    drift_score Float32,
    is_drifted UInt8,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (pipeline_run_id, feature);
