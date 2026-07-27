"""
Custom block: notify_app
Notifies the application that the model training pipeline has completed.
This is called after the model is registered in PostgreSQL.
"""

import os
import json
import requests
from datetime import datetime, timezone

WEBHOOK_URL = os.getenv(
    "TRAINING_WEBHOOK_URL",
    "http://localhost:8080/api/webhooks/model-training-complete"
)


def execute(upstream_output, **kwargs):
    model_id = upstream_output.get("model_id")
    version = upstream_output.get("version", "unknown")
    silhouette_score = upstream_output.get("silhouette_score", 0.0)
    is_better = upstream_output.get("is_better_model", True)
    status = upstream_output.get("status", "unknown")

    payload = {
        "model_id": model_id,
        "version": version,
        "silhouette_score": silhouette_score,
        "is_better_model": is_better,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pipeline": "train_kmeans_model",
    }

    try:
        resp = requests.post(WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        print(f"[notify_app] Webhook failed: {exc}")

    return {
        "notified": True,
        "model_id": model_id,
        "payload": payload,
    }


if __name__ == "__main__":
    mock = {
        "model_id": 42,
        "version": "kmeans_rfm_20260720_020000",
        "silhouette_score": 0.651,
        "is_better_model": True,
        "status": "registered",
    }
    result = execute(mock)
    print(json.dumps(result, indent=2))
