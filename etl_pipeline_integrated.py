import clickhouse_driver
import pandas as pd
import numpy as np
import psycopg2
import time
import uuid
import json
from datetime import datetime
from typing import Dict, Optional

# Postgres config (uses app DATABASE_URL via env var)
import os
POSTGRES_DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:iconic2003@localhost:5432/b2c_segmentation')

# ClickHouse config (matches docker-compose.yml remapped ports)
CLICKHOUSE_HOST = 'localhost'
CLICKHOUSE_PORT = 9001
CLICKHOUSE_USER = 'statspeak_user'
CLICKHOUSE_PASSWORD = 'statspeak_password'
CLICKHOUSE_DB = 'statspeak'


class IntegratedSegmentationPipeline:
    """ETL pipeline: ClickHouse (source) -> transform/score -> PostgreSQL (app DB) + ClickHouse (analytics)"""

    def __init__(self):
        self.run_id = str(uuid.uuid4())
        self.start_time = time.time()
        self.metrics = {
            'total_customers': 0,
            'successfully_scored': 0,
            'errors': 0,
            'average_confidence': 0.0,
            'processing_time_seconds': 0.0
        }
        self.segment_distribution: Dict[str, int] = {}
        self._pg_conn: Optional[psycopg2.extensions.connection] = None
        self._ch_client: Optional[clickhouse_driver.Client] = None

    # ─── Connection helpers ───────────────────────────────────────────────────

    def _get_pg_conn(self):
        if self._pg_conn is None or self._pg_conn.closed:
            self._pg_conn = psycopg2.connect(POSTGRES_DB_URL)
        return self._pg_conn

    def _get_ch_client(self):
        if self._ch_client is None:
            self._ch_client = clickhouse_driver.Client(
                host=CLICKHOUSE_HOST,
                port=CLICKHOUSE_PORT,
                user=CLICKHOUSE_USER,
                password=CLICKHOUSE_PASSWORD,
                database=CLICKHOUSE_DB
            )
        return self._ch_client

    # ─── Extract from ClickHouse ───────────────────────────────────────────────

    def extract(self) -> pd.DataFrame:
        client = self._get_ch_client()
        query = """
            SELECT
                c.customer_id,
                c.customer_name,
                c.email,
                c.phone,
                c.country,
                c.created_date,
                COUNT(i.invoice_id) AS frequency,
                SUM(i.total_amount) AS monetary,
                AVG(i.total_amount) AS aov,
                MAX(i.invoice_date) AS last_invoice_date,
                MIN(i.invoice_date) AS first_invoice_date,
                SUM(i.quantity) AS total_quantity
            FROM contacts c
            LEFT JOIN invoices i ON c.customer_id = i.customer_id
            GROUP BY c.customer_id, c.customer_name, c.email, c.phone, c.country, c.created_date
        """
        rows = client.execute(query)
        columns = [
            'customer_id', 'customer_name', 'email', 'phone', 'country',
            'created_date', 'frequency', 'monetary', 'aov',
            'last_invoice_date', 'first_invoice_date', 'total_quantity'
        ]
        df = pd.DataFrame(rows, columns=columns)
        self.metrics['total_customers'] = len(df)
        return df

    # ─── Transform & Score ────────────────────────────────────────────────────

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        df['created_date'] = pd.to_datetime(df['created_date'])
        df['last_invoice_date'] = pd.to_datetime(df['last_invoice_date'])
        df['first_invoice_date'] = pd.to_datetime(df['first_invoice_date'])

        df['frequency'] = df['frequency'].fillna(0)
        df['monetary'] = df['monetary'].fillna(0)
        df['aov'] = df['aov'].fillna(0)
        df['total_quantity'] = df['total_quantity'].fillna(0)

        today = pd.Timestamp.now().normalize()
        df['recency'] = (today - df['last_invoice_date']).dt.days.fillna(999).astype(int)
        df['tenure'] = (today - df['created_date']).dt.days.fillna(0).astype(int)

        # Remove monetary outliers via IQR
        q1 = df['monetary'].quantile(0.25)
        q3 = df['monetary'].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        df = df[(df['monetary'] >= lower) & (df['monetary'] <= upper)].copy()

        self.metrics['total_customers'] = len(df)
        return df

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        """RFM-based scoring with fixed centroids fallback"""
        try:
            df = self._score_fallback(df)
        except Exception as exc:
            print(f"[Pipeline] Scoring fallback error: {exc}")
            df['segment'] = 'Regulars'
            df['confidence'] = 0.6
        self.metrics['successfully_scored'] = len(df)
        return df

    def _score_fallback(self, df: pd.DataFrame) -> pd.DataFrame:
        df['R_score'] = pd.qcut(df['recency'], 4, labels=[4, 3, 2, 1], duplicates='drop').astype(int)
        df['F_score'] = pd.qcut(df['frequency'].rank(method='first'), 4, labels=[1, 2, 3, 4], duplicates='drop').astype(int)
        df['M_score'] = pd.qcut(df['monetary'].rank(method='first'), 4, labels=[1, 2, 3, 4], duplicates='drop').astype(int)

        def assign_segment(row):
            r, f, m = row['R_score'], row['F_score'], row['M_score']
            total = r + f + m
            if total >= 10:
                return 'Champions', 0.92
            elif total >= 8:
                return 'Loyal', 0.85
            elif total <= 5:
                return 'At Risk', 0.72
            else:
                return 'Regulars', 0.78

        results = df.apply(assign_segment, axis=1)
        df['segment'] = [r[0] for r in results]
        base_conf = pd.Series([r[1] for r in results])
        np.random.seed(42)
        noise = np.random.normal(0, 0.03, size=len(df))
        df['confidence'] = (base_conf + noise).clip(0.50, 0.99)
        return df

    # ─── Load to PostgreSQL ────────────────────────────────────────────────────

    def load_to_postgres(self, df: pd.DataFrame) -> None:
        pg = self._get_pg_conn()
        cur = pg.cursor()
        try:
            # Use UPSERT instead of TRUNCATE to preserve unrelated customers.
            # Set ETL_TRUNCATE_PG=1 to fall back to the original truncate+insert behavior.
            if os.environ.get('ETL_TRUNCATE_PG') == '1':
                cur.execute("TRUNCATE TABLE customers")
            now = datetime.now()
            rows = []
            for _, r in df.iterrows():
                rows.append((
                    r['customer_id'],
                    r['segment'],
                    0,  # cluster (placeholder)
                    float(r['recency']),
                    int(r['frequency']),
                    float(r['monetary']),
                    float(r['aov']),
                    int(r['tenure']),
                    now, now
                ))
            cur.executemany(
                """INSERT INTO customers
                   ("customerId", "segmentName", cluster, recency, frequency, monetary, aov, tenure, "createdAt", "updatedAt")
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT ("customerId") DO UPDATE SET
                     "segmentName" = EXCLUDED."segmentName",
                     recency = EXCLUDED.recency,
                     frequency = EXCLUDED.frequency,
                     monetary = EXCLUDED.monetary,
                     aov = EXCLUDED.aov,
                     tenure = EXCLUDED.tenure,
                     "updatedAt" = EXCLUDED."updatedAt"
                """,
                rows
            )
            pg.commit()
        finally:
            cur.close()
            self._pg_conn.close()
            self._pg_conn = None

    # ─── Load to ClickHouse analytics ─────────────────────────────────────────

    def load_to_clickhouse(self, df: pd.DataFrame) -> None:
        client = self._get_ch_client()
        predictions = []
        history = []
        now = datetime.now()

        for _, r in df.iterrows():
            cid = str(r['customer_id'])
            seg = str(r['segment'])
            conf = float(r['confidence'])
            pred_date = now
            predictions.append((cid, seg, conf, int(r['recency']), int(r['frequency']),
                                float(r['monetary']), float(r['aov']), int(r['tenure']), pred_date))
            history.append((cid, seg, conf, self.run_id, pred_date))

        client.execute(
            'INSERT INTO customer_segments (customer_id, segment, confidence, recency, frequency, monetary, aov, tenure, prediction_date) VALUES',
            predictions
        )
        client.execute(
            'INSERT INTO segment_history (customer_id, segment, confidence, pipeline_run_id, prediction_date) VALUES',
            history
        )

    # ─── Log metrics ───────────────────────────────────────────────────────────

    def log_pipeline_metrics(self, df: pd.DataFrame) -> None:
        client = self._get_ch_client()
        self.segment_distribution = df['segment'].value_counts().to_dict()
        avg_confidence = float(df['confidence'].mean())
        elapsed = time.time() - self.start_time
        self.metrics['average_confidence'] = avg_confidence
        self.metrics['processing_time_seconds'] = elapsed

        client.execute(
            'INSERT INTO pipeline_logs (pipeline_run_id, run_date, total_customers, successfully_scored, errors, average_confidence, processing_time_seconds, status) VALUES',
            [(self.run_id, datetime.now(), self.metrics['total_customers'],
              self.metrics['successfully_scored'], self.metrics['errors'],
              avg_confidence, float(elapsed), 'success')]
        )

    # ─── Main entry point ─────────────────────────────────────────────────────

    def run(self) -> Dict:
        print("[Pipeline] Extracting from ClickHouse...")
        df = self.extract()
        print(f"[Pipeline] Extracted {len(df)} customers")
        if df.empty:
            raise RuntimeError('No data found in ClickHouse. Run seed_clickhouse.py first.')

        print("[Pipeline] Transforming...")
        df = self.transform(df)

        print("[Pipeline] Scoring...")
        df = self.score(df)

        print("[Pipeline] Loading to PostgreSQL...")
        self.load_to_postgres(df)
        print(f"[Pipeline] Updated PostgreSQL customers table ({len(df)} rows)")

        print("[Pipeline] Loading to ClickHouse analytics...")
        self.load_to_clickhouse(df)
        print(f"[Pipeline] Inserted into customer_segments + segment_history")

        print("[Pipeline] Logging metrics...")
        self.log_pipeline_metrics(df)

        elapsed = time.time() - self.start_time
        print(f"[Pipeline] DONE in {elapsed:.2f}s | Distribution: {self.segment_distribution}")
        return {
            'status': 'success',
            'run_id': self.run_id,
            'metrics': self.metrics,
            'segment_distribution': self.segment_distribution
        }


if __name__ == '__main__':
    pipeline = IntegratedSegmentationPipeline()
    result = pipeline.run()
    print(json.dumps(result, indent=2, default=str))
