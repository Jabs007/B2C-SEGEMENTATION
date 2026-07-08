CREATE DATABASE IF NOT EXISTS statspeak;

CREATE TABLE IF NOT EXISTS statspeak.customer_segments
(
    customer_id       String,
    segment           String,
    confidence        Float64,
    recency           Int32,
    frequency         Int32,
    monetary          Float64,
    aov               Float64,
    tenure            Int32,
    prediction_date   DateTime
) ENGINE=MergeTree
  ORDER BY (customer_id, prediction_date);

CREATE TABLE IF NOT EXISTS statspeak.segment_history
(
    customer_id       String,
    segment           String,
    confidence        Float64,
    pipeline_run_id   UUID,
    prediction_date   DateTime
) ENGINE=MergeTree
  ORDER BY (customer_id, prediction_date);

CREATE TABLE IF NOT EXISTS statspeak.pipeline_logs
(
    pipeline_run_id            UUID,
    run_date                   DateTime,
    total_customers            Int32,
    successfully_scored        Int32,
    errors                     Int32,
    average_confidence         Float64,
    processing_time_seconds    Float64,
    status                     String
) ENGINE=MergeTree
  ORDER BY (pipeline_run_id, run_date);
