"""Create Mage pipeline_schedule for daily 02:00 UTC."""
import sqlite3
import json
import time

DB = '/home/src/mage_data/b2c_segmentation/mage-ai.db'
PIPELINE_UUID = 'b2c_segmentation_etl_pipeline_v1'
TOKEN = 'b2c-daily-2am-etl'

now = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Remove any prior duplicate
cur.execute("DELETE FROM pipeline_schedule WHERE name = ?", ('daily_2am_etl',))

cur.execute(
    """
    INSERT INTO pipeline_schedule (
        name, pipeline_uuid, schedule_type, start_time,
        schedule_interval, status, variables, token, settings, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        'daily_2am_etl',
        PIPELINE_UUID,
        'cron',
        now,
        '0 2 * * *',
        'active',
        json.dumps({}),
        TOKEN,
        json.dumps({'timezone': 'utc'}),
        'Daily B2C re-segmentation at 02:00 UTC',
    ),
)
conn.commit()

rows = cur.execute("SELECT id, name, pipeline_uuid, schedule_type, schedule_interval, status FROM pipeline_schedule").fetchall()
print("Schedules now:")
for r in rows:
    print(" ", r)
cur.close()
conn.close()
