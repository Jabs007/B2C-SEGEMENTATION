"""Block 6: notify_app (custom block)

After both writes succeed, alert the B2C app to refresh its dashboard by
hitting the tRPC pipeline.triggerPython endpoint over HTTP. This makes the
new segments visible immediately to end users on the next page load.

Note: this is a "best effort" notification. A failure here does not mean
the pipeline run failed - the segments are already in ClickHouse and
PostgreSQL.
"""

import os
import json
import urllib.request

if 'custom' not in globals():
    from mage_ai.data_preparation.decorators import custom


@custom
def notify_app(*args, **kwargs):
    """Hit B2C app's tRPC endpoint so UI reflects fresh data."""

    app_url = (
        os.getenv('B2C_APP_URL')
        or 'http://host.docker.internal:3000'
    )

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
