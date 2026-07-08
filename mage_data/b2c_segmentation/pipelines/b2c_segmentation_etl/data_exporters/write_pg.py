"""Block 4: write_to_postgres (data_exporter)

UPSERTs fresh segment labels + RFM features into the B2C app's
PostgreSQL `customers` table. Uses INSERT ... ON CONFLICT DO UPDATE
to preserve unrelated rows.
"""

from datetime import datetime

from mage_ai.data_preparation.shared.secrets import get_secret_value

if 'data_exporter' not in globals():
    from mage_ai.data_preparation.decorators import data_exporter


@data_exporter
def export_data(df, *args, **kwargs):
    """Idempotent UPSERT into PostgreSQL `customers`."""
    import psycopg2

    dsn = (
        get_secret_value('POSTGRES_DSN')
        or 'postgresql://postgres:iconic2003@host.docker.internal:5432/b2c_segmentation'
    )
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    now = datetime.utcnow()

    payload = []
    for _, r in df.iterrows():
        payload.append({
            'customerId': str(r['customer_id']),
            'segmentName': str(r['segment']),
            'cluster': int(r['cluster']),
            'recency': float(r['recency']),
            'frequency': int(r['frequency']),
            'monetary': float(r['monetary']),
            'aov': float(r['aov']),
            'spendTrend': float(r.get('spend_trend') or 0),
            'interPurchaseInterval': float(r.get('inter_purchase_interval_days') or 0),
            'spendConcentration': float(r.get('spend_concentration') or 0),
            'categoryBreadth': int(r.get('category_breadth') or 0),
            'channelConsistency': int(r.get('channel_consistency') or 0),
            'latePaymentRate': float(r.get('late_payment_rate') or 0),
            'defaultFlag': int(r.get('default_flag') or 0),
            'tenure': float(r['tenure']),
            'tenureAdjFreq': float(r.get('tenure_adj_freq') or 0),
            'preferredCategory': str(r.get('preferred_category') or '')[:128],
            'region': str(r.get('region') or '')[:128],
            'createdAt': now,
            'updatedAt': now,
        })

    cur.executemany(
        """
        INSERT INTO customers (
            "customerId", "segmentName", cluster,
            recency, frequency, monetary, aov,
            "spendTrend", "interPurchaseInterval",
            "spendConcentration",
            "categoryBreadth", "channelConsistency",
            "latePaymentRate", "defaultFlag",
            tenure, "tenureAdjFreq",
            "preferredCategory", region,
            "createdAt", "updatedAt"
        )
        VALUES (
            %(customerId)s, %(segmentName)s, %(cluster)s,
            %(recency)s, %(frequency)s, %(monetary)s, %(aov)s,
            %(spendTrend)s, %(interPurchaseInterval)s,
            %(spendConcentration)s,
            %(categoryBreadth)s, %(channelConsistency)s,
            %(latePaymentRate)s, %(defaultFlag)s,
            %(tenure)s, %(tenureAdjFreq)s,
            %(preferredCategory)s, %(region)s,
            %(createdAt)s, %(updatedAt)s
        )
        ON CONFLICT ("customerId") DO UPDATE SET
            "segmentName" = EXCLUDED."segmentName",
            cluster = EXCLUDED.cluster,
            recency = EXCLUDED.recency,
            frequency = EXCLUDED.frequency,
            monetary = EXCLUDED.monetary,
            aov = EXCLUDED.aov,
            "spendTrend" = EXCLUDED."spendTrend",
            "interPurchaseInterval" = EXCLUDED."interPurchaseInterval",
            "spendConcentration" = EXCLUDED."spendConcentration",
            "categoryBreadth" = EXCLUDED."categoryBreadth",
            "channelConsistency" = EXCLUDED."channelConsistency",
            "latePaymentRate" = EXCLUDED."latePaymentRate",
            "defaultFlag" = EXCLUDED."defaultFlag",
            tenure = EXCLUDED.tenure,
            "tenureAdjFreq" = EXCLUDED."tenureAdjFreq",
            "preferredCategory" = EXCLUDED."preferredCategory",
            region = EXCLUDED.region,
            "updatedAt" = EXCLUDED."updatedAt"
        """,
        payload,
    )
    conn.commit()
    cur.close()
    conn.close()
    return {'rows_written': len(payload)}
