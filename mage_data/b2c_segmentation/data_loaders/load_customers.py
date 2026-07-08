"""Block 1: load_customers_from_clickhouse (data_loader)

Reads all customers from the ClickHouse `app_customers` table (migrated from
PostgreSQL in Part A). Returns a pandas DataFrame.
"""

import pandas as pd
from mage_ai.data_preparation.shared.secrets import get_secret_value

if 'data_loader' not in globals():
    from mage_ai.data_preparation.decorators import data_loader


@data_loader
def load_data(*args, **kwargs):
    """
    Return a pandas DataFrame of all customers.
    """
    import clickhouse_driver

    host = get_secret_value('CLICKHOUSE_NATIVE_HOST') or 'clickhouse-local'
    port = int(get_secret_value('CLICKHOUSE_NATIVE_PORT') or 9000)
    user = get_secret_value('CLICKHOUSE_USER') or 'statspeak_user'
    password = get_secret_value('CLICKHOUSE_PASSWORD') or 'statspeak_password'
    database = get_secret_value('CLICKHOUSE_DB') or 'statspeak'

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
