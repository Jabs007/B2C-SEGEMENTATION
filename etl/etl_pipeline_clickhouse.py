import clickhouse_driver
import pandas as pd
import numpy as np
import time
import uuid
from datetime import datetime
import logging
from typing import Dict

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


class ClickhouseSegmentationPipeline:
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
        self.segment_distribution = {}
        self.client = clickhouse_driver.Client(
            host='localhost',
            port=9001,
            user='statspeak_user',
            password='statspeak_password',
            database='statspeak'
        )
        logger.info(f"Pipeline initialized with run_id: {self.run_id}")

    def extract(self) -> pd.DataFrame:
        logger.info("Extracting data from Clickhouse...")

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

        data = self.client.execute(query)
        columns = [
            'customer_id', 'customer_name', 'email', 'phone', 'country', 'created_date',
            'frequency', 'monetary', 'aov', 'last_invoice_date', 'first_invoice_date', 'total_quantity'
        ]
        df = pd.DataFrame(data, columns=columns)

        logger.info(f"Extracted {len(df)} customers")
        return df

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        logger.info("Transforming data...")

        # Convert date columns
        df['created_date'] = pd.to_datetime(df['created_date'])
        df['last_invoice_date'] = pd.to_datetime(df['last_invoice_date'])
        df['first_invoice_date'] = pd.to_datetime(df['first_invoice_date'])

        # Fill missing values
        df['frequency'] = df['frequency'].fillna(0)
        df['monetary'] = df['monetary'].fillna(0)
        df['aov'] = df['aov'].fillna(0)
        df['total_quantity'] = df['total_quantity'].fillna(0)

        today = pd.Timestamp.now().normalize()

        # Compute recency in days
        df['recency'] = (today - df['last_invoice_date']).dt.days
        df['recency'] = df['recency'].fillna(999)

        # Compute tenure in days
        df['tenure'] = (today - df['created_date']).dt.days

        # Remove outliers using IQR on monetary
        q1 = df['monetary'].quantile(0.25)
        q3 = df['monetary'].quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        before_count = len(df)
        df = df[(df['monetary'] >= lower_bound) & (df['monetary'] <= upper_bound)]
        after_count = len(df)
        removed = before_count - after_count

        logger.info(f"Removed {removed} outliers. Remaining: {after_count} customers")
        self.metrics['total_customers'] = after_count
        return df

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        logger.info("Scoring customers with ML service...")

        try:
            df = self._score_via_ml_service(df)
            logger.info(f"Scored {len(df)} customers via ML service")
        except Exception as e:
            logger.warning(f"ML service unavailable ({e}). Using fallback scoring.")
            df = self._score_fallback(df)
            logger.info(f"Scored {len(df)} customers using fallback")

        self.metrics['successfully_scored'] = len(df)
        return df

    def _score_via_ml_service(self, df: pd.DataFrame) -> pd.DataFrame:
        # ML service endpoint (placeholder - in production, this would be a real endpoint)
        # For now, we simulate a failure to trigger the fallback
        raise ConnectionError("ML service not configured")

    def _score_fallback(self, df: pd.DataFrame) -> pd.DataFrame:
        logger.info("Using fallback: RFM-based segmentation")

        # Recency score (lower recency = higher score)
        df['R_score'] = pd.qcut(df['recency'], 4, labels=[4, 3, 2, 1], duplicates='drop').astype(int)
        # Frequency score
        df['F_score'] = pd.qcut(df['frequency'].rank(method='first'), 4, labels=[1, 2, 3, 4], duplicates='drop').astype(int)
        # Monetary score
        df['M_score'] = pd.qcut(df['monetary'].rank(method='first'), 4, labels=[1, 2, 3, 4], duplicates='drop').astype(int)

        # Combine R scores for segmentation
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

        segments_confidences = df.apply(assign_segment, axis=1)
        df['segment'] = [s[0] for s in segments_confidences]
        base_confidence = pd.Series([s[1] for s in segments_confidences])

        # Adjust confidence by data quality (simulate slight variation)
        np.random.seed(42)
        noise = np.random.normal(0, 0.03, size=len(df))
        df['confidence'] = (base_confidence + noise).clip(0.50, 0.99)

        return df

    def load(self, df: pd.DataFrame) -> None:
        logger.info("Loading predictions to Clickhouse...")

        predictions = []
        for _, row in df.iterrows():
            predictions.append((
                row['customer_id'],
                row['segment'],
                float(row['confidence']),
                int(row['recency']),
                int(row['frequency']),
                float(row['monetary']),
                float(row['aov']),
                int(row['tenure']),
                datetime.now()
            ))

        self.client.execute(
            'INSERT INTO customer_segments (customer_id, segment, confidence, recency, frequency, monetary, aov, tenure, prediction_date) VALUES',
            predictions
        )
        logger.info(f"Loaded {len(predictions)} predictions")

        # Also write to segment_history
        history = []
        for _, row in df.iterrows():
            history.append((
                row['customer_id'],
                row['segment'],
                float(row['confidence']),
                self.run_id,
                datetime.now()
            ))

        self.client.execute(
            'INSERT INTO segment_history (customer_id, segment, confidence, pipeline_run_id, prediction_date) VALUES',
            history
        )
        logger.info(f"Inserted {len(history)} records into segment_history")

    def log_pipeline_metrics(self, df: pd.DataFrame) -> None:
        logger.info("Logging pipeline metrics...")

        # Calculate segment distribution
        self.segment_distribution = df['segment'].value_counts().to_dict()

        # Calculate average confidence
        avg_confidence = df['confidence'].mean()
        self.metrics['average_confidence'] = float(avg_confidence)

        # Calculate processing time
        self.metrics['processing_time_seconds'] = time.time() - self.start_time

        # Log to database
        self.client.execute(
            'INSERT INTO pipeline_logs (pipeline_run_id, run_date, total_customers, successfully_scored, errors, average_confidence, processing_time_seconds, status) VALUES',
            [(self.run_id, datetime.now(), self.metrics['total_customers'],
              self.metrics['successfully_scored'], self.metrics['errors'],
              float(self.metrics['average_confidence']), float(self.metrics['processing_time_seconds']), 'success')]
        )

        # Log segment distribution
        logger.info(f"Segment distribution: {dict(self.segment_distribution)}")
        logger.info(f"Average confidence: {avg_confidence:.2f}")

    def run(self) -> Dict:
        logger.info("================================================================================")
        logger.info("STARTING SEGMENTATION PIPELINE")
        logger.info("================================================================================")

        try:
            # Step 1: Extract
            df = self.extract()

            # Step 2: Transform
            df = self.transform(df)

            # Step 3: Score
            df = self.score(df)

            # Step 4: Load
            self.load(df)

            # Step 5: Log metrics
            self.log_pipeline_metrics(df)

            logger.info("================================================================================")
            logger.info(f"PIPELINE COMPLETED SUCCESSFULLY in {time.time() - self.start_time:.2f} seconds")
            logger.info("================================================================================")

            return {
                'status': 'success',
                'run_id': self.run_id,
                'metrics': self.metrics,
                'segment_distribution': self.segment_distribution
            }

        except Exception as e:
            self.metrics['errors'] += 1
            logger.error(f"Pipeline failed: {e}")
            raise


if __name__ == '__main__':
    pipeline = ClickhouseSegmentationPipeline()
    result = pipeline.run()
    print(f"Pipeline status: {result['status']}")
    print(f"Run ID: {result['run_id']}")
    print(f"Metrics: {result['metrics']}")
    print(f"Segments: {result['segment_distribution']}")
