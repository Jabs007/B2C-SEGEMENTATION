"""Block 5: write_to_clickhouse (data_exporter)

Appends every scored customer to `customer_segments` and `segment_history`,
and writes a single row to `pipeline_logs` summarising this Mage run.
"""

import os
import uuid
from datetime import datetime

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data(df, *args, **kwargs):
    """Append rows to ClickHouse analytics tables."""
    import clickhouse_driver

    # Use environment variables (set in docker-compose.mage.yml)
    host = os.getenv('CLICKHOUSE_NATIVE_HOST', 'clickhouse')
    port = int(os.getenv('CLICKHOUSE_NATIVE_PORT', 9000))
    user = os.getenv('CLICKHOUSE_USER', 'statspeak_user')
    password = os.getenv('CLICKHOUSE_PASSWORD', 'statspeak_password')
    database = os.getenv('CLICKHOUSE_DB', 'statspeak')

    client = clickhouse_driver.Client(
        host=host, port=port, user=user, password=password, database=database
    )

    run_id = str(uuid.uuid4())
    now = datetime.utcnow()

    seg_rows = []
    hist_rows = []
    for _, r in df.iterrows():
        cid = str(r['customer_id'])
        seg = str(r['segment'])
        conf = float(r['confidence'])
        rec = int(r['recency'])
        freq = int(r['frequency'])
        mon = float(r['monetary'])
        aov = float(r['aov'])
        ten = int(r['tenure'])
        seg_rows.append((cid, seg, conf, rec, freq, mon, aov, ten, now))
        hist_rows.append((cid, seg, conf, run_id, now))

    if seg_rows:
        client.execute(
            """
            INSERT INTO customer_segments
            (customer_id, segment, confidence,
             recency, frequency, monetary, aov, tenure, prediction_date)
            VALUES
            """,
            seg_rows,
        )
    if hist_rows:
        client.execute(
            """
            INSERT INTO segment_history
            (customer_id, segment, confidence, pipeline_run_id, prediction_date)
            VALUES
            """,
            hist_rows,
        )

    avg_confidence = float(df['confidence'].mean()) if len(df) else 0.0
    client.execute(
        """
        INSERT INTO pipeline_logs
        (pipeline_run_id, run_date, total_customers, successfully_scored,
         errors, average_confidence, processing_time_seconds, status)
        VALUES
        """,
        [(run_id, now, len(df), len(df), 0, avg_confidence, 0.0, 'success')],
    )

    return {
        'clickhouse_run_id': run_id,
        'clickhouse_rows_written': len(seg_rows),
        'pipeline_log_row_count': 1,
    }
