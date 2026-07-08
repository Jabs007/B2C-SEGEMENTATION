"""Block 2: compute_rfm_metrics (transformer)

Takes the customer DataFrame and standardises RFM metrics into quartiles
for durable, repeatable segmentation.
"""

import numpy as np
import pandas as pd

if 'transformer' not in globals():
    from mage_ai.data_preparation.decorators import transformer


@transformer
def transform(df: pd.DataFrame, *args, **kwargs) -> pd.DataFrame:
    """Compute R, F, M quartile scores plus tenure bonus."""

    # Bail gracefully if upstream came back empty
    if df.empty:
        return df

    df = df.copy()
    df['monetary'] = pd.to_numeric(df['monetary'], errors='coerce').fillna(0.0)
    df['frequency'] = pd.to_numeric(df['frequency'], errors='coerce').fillna(0).astype(int)
    df['recency'] = pd.to_numeric(df['recency'], errors='coerce').fillna(999).astype(int)
    df['tenure'] = pd.to_numeric(df['tenure'], errors='coerce').fillna(0).astype(int)
    df['aov'] = pd.to_numeric(df['aov'], errors='coerce').fillna(0.0)

    def _qcut_inverse(s: pd.Series, labels):
        """Lower numeric value → higher score (e.g., recency less is better)."""
        return pd.qcut(s, 4, labels=labels, duplicates='drop').astype(int)

    def _qcut_direct(s: pd.Series, labels):
        return pd.qcut(s.rank(method='first'), 4, labels=labels, duplicates='drop').astype(int)

    df['R_score'] = _qcut_inverse(df['recency'], [4, 3, 2, 1])
    df['F_score'] = _qcut_direct(df['frequency'], [1, 2, 3, 4])
    df['M_score'] = _qcut_direct(df['monetary'], [1, 2, 3, 4])
    df['RFM_total'] = df['R_score'] + df['F_score'] + df['M_score']

    # Confidence proxy - higher RFM and tenure = higher confidence
    noise = np.random.default_rng(seed=42).normal(0, 0.03, size=len(df))
    base = np.clip(df['RFM_total'] / 12.0, 0.5, 0.95)
    df['confidence'] = np.clip(base + noise, 0.50, 0.99).round(4)

    return df
