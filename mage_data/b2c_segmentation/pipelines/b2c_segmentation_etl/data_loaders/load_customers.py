"""Block 1: load_customers_from_clickhouse (data_loader)

Reads all customers from the ClickHouse `app_customers` table.
Returns a pandas DataFrame.
"""

import os
import pandas as pd
from mage_ai.data_preparation.decorators import data_loader


@data_loader
def load_data(*args, **kwargs):
    """Return a pandas DataFrame of all customers."""
    import clickhouse_driver

    host = os.getenv('CLICKHOUSE_NATIVE_HOST', 'clickhouse')
    port = int(os.getenv('CLICKHOUSE_NATIVE_PORT', 9000))
    user = os.getenv('CLICKHOUSE_USER', 'statspeak_user')
    password = os.getenv('CLICKHOUSE_PASSWORD', 'statspeak_password')
    database = os.getenv('CLICKHOUSE_DB', 'statspeak')

    client = clickhouse_driver.Client(
        host=host, port=port, user=user, password=password, database=database
    )

    query = """
    SELECT
        customer_id,
        segment_name,
        cluster,
        recency,
        frequency,
        monetary,
        aov,
        spend_trend,
        inter_purchase_interval AS inter_purchase_interval_days,
        spend_concentration,
        category_breadth,
        channel_consistency,
        late_payment_rate,
        default_flag,
        tenure,
        tenure_adj_freq,
        preferred_category,
        region
    FROM app_customers
    """

    rows = client.execute(query)
    columns = [
        'customer_id', 'segment_name', 'cluster', 'recency', 'frequency',
        'monetary', 'aov', 'spend_trend', 'inter_purchase_interval_days',
        'spend_concentration', 'category_breadth', 'channel_consistency',
        'late_payment_rate', 'default_flag', 'tenure', 'tenure_adj_freq',
        'preferred_category', 'region',
    ]
    return pd.DataFrame(rows, columns=columns)
