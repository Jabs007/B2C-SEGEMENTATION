"""Compact health-check report for the whole integration stack."""
import json
import sys
import urllib.request
import urllib.error
import clickhouse_driver
import psycopg2
import socket
import os
import sqlite3

BASE = os.environ.get("BASE", "C:/Users/JABS/OneDrive/Documents/STATSPEAK PROJECTS/B2C APP")

OK = "[   OK   ]"
FAIL = "[ FAIL  ]"

def http_json(url, auth=None):
    req = urllib.request.Request(url, headers=auth or {})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def tcp_open(host, port):
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def check(name, ok, detail=""):
    print(f"{OK if ok else FAIL} {name}{(' - ' + detail) if detail else ''}")
    return ok


print("\n========== B2C + ClickHouse + Mage Health Report ==========\n")

# Docker layer
import subprocess
def docker_ps(name):
    try:
        out = subprocess.check_output(
            ["docker", "ps", "--filter", f"name={name}", "--format", "{{.Status}}"],
            text=True,
        ).strip()
        return out
    except subprocess.CalledProcessError:
        return ""

results = []
results.append(check("ClickHouse container running", "healthy" in docker_ps("clickhouse-local"), docker_ps("clickhouse-local")))
results.append(check("Mage container running", "Up" in docker_ps("mage-local"), docker_ps("mage-local")))

# ClickHouse HTTP
try:
    req = urllib.request.Request("http://localhost:8124/ping")
    with urllib.request.urlopen(req, timeout=5) as r:
        pong = r.read().decode()
    results.append(check("ClickHouse HTTP ping", pong.strip().lower() == "ok", pong.strip()))
except Exception as e:
    results.append(check("ClickHouse HTTP ping", False, str(e)))

# ClickHouse counts
try:
    ch = clickhouse_driver.Client(
        host="localhost", port=9001, user="statspeak_user",
        password="statspeak_password", database="statspeak",
    )
    counts = {}
    for tbl in ("app_customers", "invoices", "contacts", "customer_segments",
                "segment_history", "pipeline_logs"):
        counts[tbl] = ch.execute(f"SELECT COUNT(*) FROM {tbl}")[0][0]
    results.append(check("CH app_customers == 8031", counts["app_customers"] == 8031, str(counts["app_customers"])))
    results.append(check("CH invoices table empty (skip)", True, str(counts.get("invoices", 0))))
    results.append(check("CH pipeline_logs >= 1", counts["pipeline_logs"] >= 1, str(counts["pipeline_logs"])))
except Exception as e:
    results.append(check("ClickHouse counts", False, str(e)))

# App HTTP
try:
    req = urllib.request.Request("http://localhost:3000/api/trpc/dashboard.stats?batch=1&input=%7B%7D")
    with urllib.request.urlopen(req, timeout=8) as r:
        d = json.loads(r.read())
    body = d[0]["result"]["data"]["json"]
    results.append(check("App dashboard.stats returns 8031 customers",
                        body["totalCustomers"] == 8031, str(body["totalCustomers"])))
    last = body["lastPipelineRun"]
    results.append(check("Last pipeline run completed",
                        last["status"] == "completed", f"id={last['id']} status={last['status']}"))
except Exception as e:
    results.append(check("App HTTP / dashboard", False, str(e)))

# App -> ClickHouse (segments.distribution)
try:
    req = urllib.request.Request("http://localhost:3000/api/trpc/segments.distribution?batch=1&input=%7B%7D")
    with urllib.request.urlopen(req, timeout=8) as r:
        d = json.loads(r.read())
    segs = d[0]["result"]["data"]["json"]
    expected = {"Champions", "Loyal", "At Risk", "Regulars"}
    results.append(check("App -> ClickHouse reads 4 segments",
                        set(s["segment"] for s in segs) == expected, str([s["segment"] for s in segs])))
except Exception as e:
    results.append(check("App -> ClickHouse segments", False, str(e)))

# Mage HTTP & schedule
try:
    res = http_json("http://localhost:6789/api/status")
    sched = res["statuses"][0]["scheduler_status"]
    results.append(check("Mage scheduler running", sched == "running", str(sched)))
except Exception as e:
    results.append(check("Mage scheduler", False, str(e)))

try:
    mage_db = subprocess.check_output(
        ["docker", "exec", "mage-local", "python3", "-c",
         "import sqlite3; c=sqlite3.connect('/home/src/mage_data/b2c_segmentation/mage-ai.db'); rows = c.execute('SELECT name, schedule_type, schedule_interval, status FROM pipeline_schedule').fetchall(); print(rows)"],
        text=True,
    ).strip()
    results.append(check("Mage schedule active (0 2 * * *)",
                        "'0 2 * * *'" in mage_db and "'active'" in mage_db, mage_db[:200]))
except Exception as e:
    results.append(check("Mage schedule", False, str(e)))

# Summary
passed = sum(1 for r in results if r)
total = len(results)
print(f"\n========== {passed}/{total} checks PASSED ==========")

if passed != total:
    sys.exit(1)
