"""Block 3: assign_segments (transformer)

Maps RFM total + cluster to one of four head segments:
Champions, Loyal, At Risk, Regulars.
"""

import numpy as np
import pandas as pd

if 'transformer' not in globals():
    from mage_ai.data_preparation.decorators import transformer

SEGMENT_LABELS = ['Champions', 'Loyal', 'At Risk', 'Regulars']


def _label(row):
    total = int(row['RFM_total'])
    if total >= 10:
        return 'Champions', 0
    if total >= 8:
        return 'Loyal', 1
    if total <= 5:
        return 'At Risk', 2
    return 'Regulars', 3


@transformer
def transform(df: pd.DataFrame, *args, **kwargs) -> pd.DataFrame:
    if df.empty:
        return df

    df = df.copy()
    seg_frame = df.apply(_label, axis=1)
    df['segment'] = [s[0] for s in seg_frame]
    df['cluster'] = [s[1] for s in seg_frame]

    # Provide descriptions for analytics
    desc_map = {
        'Champions': 'High spend, high frequency, high recency.',
        'Loyal': 'Recent, frequent, strong spend.',
        'At Risk': 'Disconnect showing - needs win-back.',
        'Regulars': 'Moderate engagement, occasional purchases.',
    }
    df['segment_description'] = df['segment'].map(desc_map)

    return df
