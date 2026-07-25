import sqlite3
conn = sqlite3.connect('/home/src/mage_data/b2c_segmentation/mage-ai.db')
c = conn.cursor()
c.execute("SELECT id, pipeline_uuid, name, status, start_time FROM pipeline_schedule")
for r in c.fetchall():
    print(r)
