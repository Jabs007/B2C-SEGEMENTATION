import sqlite3
c = sqlite3.connect('/home/src/mage_data/b2c_segmentation/mage-ai.db')
print("pipeline_schedule columns:")
for r in c.execute("PRAGMA table_info(pipeline_schedule)").fetchall():
    print(" ", tuple(r))
print("Existing rows:")
for r in c.execute("SELECT * FROM pipeline_schedule").fetchall():
    print(" ", tuple(r))
