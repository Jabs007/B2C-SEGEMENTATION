"""Block 6: notify_app (custom block)

Triggers the B2C app to refresh its dashboard.
"""

import os
import json
import urllib.request
from mage_ai.data_preparation.decorators import custom


@custom
def notify_app(*args, **kwargs):
    """Hit B2C app's tRPC endpoint so UI reflects fresh data."""

    app_url = os.getenv('B2C_APP_URL', 'http://host.docker.internal:3000')

    payload = {
        '0': {'json': None, 'meta': {'values': ['undefined']}},
    }
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url=f"{app_url.rstrip('/')}/api/trpc/pipeline.triggerPython?batch=1",
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return {'http_status': resp.status, 'response': resp.read().decode('utf-8')[:500]}
    except Exception as exc:
        return {'http_status': None, 'response': str(exc)}
