import clickhouse_driver

# Connect to Clickhouse
client = clickhouse_driver.Client(
    host='localhost',
    port=9001,
    user='statspeak_user',
    password='statspeak_password',
    database='statspeak'
)

print("================================================================================")
print("PIPELINE VALIDATION REPORT")
print("================================================================================")

# 1. SEGMENT DISTRIBUTION
print("\n1. SEGMENT DISTRIBUTION")
print("-" * 80)
segment_query = """
SELECT segment, COUNT(*) AS count, AVG(confidence) AS avg_confidence
FROM customer_segments
GROUP BY segment
ORDER BY count DESC
"""
segments = client.execute(segment_query)
for segment, count, avg_conf in segments:
    print(f"  {segment:<15} | Count: {count:>3} | Avg Confidence: {avg_conf:.3f}")

# 2. LATEST PIPELINE RUN
print("\n2. LATEST PIPELINE RUN")
print("-" * 80)
latest_run = client.execute("""
SELECT pipeline_run_id, run_date, total_customers, successfully_scored, errors, average_confidence, status
FROM pipeline_logs
ORDER BY run_date DESC
LIMIT 1
""")
if latest_run:
    run = latest_run[0]
    print(f"  Run ID: {run[0]}")
    print(f"  Date: {run[1]}")
    print(f"  Total Customers: {run[2]}")
    print(f"  Successfully Scored: {run[3]}")
    print(f"  Errors: {run[4]}")
    print(f"  Average Confidence: {run[5]:.3f}")
    print(f"  Status: {run[6]}")
else:
    print("  No pipeline runs found.")

# 3. DATA QUALITY
print("\n3. DATA QUALITY")
print("-" * 80)
dq = client.execute("""
SELECT COUNT(*) AS total_records,
       COUNT(DISTINCT customer_id) AS unique_customers,
       MIN(confidence) AS min_confidence,
       MAX(confidence) AS max_confidence,
       AVG(confidence) AS avg_confidence
FROM customer_segments
""")
if dq:
    row = dq[0]
    print(f"  Total Records: {row[0]}")
    print(f"  Unique Customers: {row[1]}")
    print(f"  Confidence Range: {row[2]:.3f} - {row[3]:.3f}")
    print(f"  Average Confidence: {row[4]:.3f}")

# 4. SEGMENT MIGRATION TRACKING
print("\n4. SEGMENT MIGRATION TRACKING")
print("-" * 80)
history_count = client.execute("SELECT COUNT(*) FROM segment_history")[0][0]
print(f"  Total Historical Records: {history_count}")

print("\n================================================================================")
print("VALIDATION COMPLETE")
print("================================================================================")
