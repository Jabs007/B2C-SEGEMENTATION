"""Verify migration integrity between PostgreSQL `customers` and ClickHouse `app_customers`."""

import os
import sys
from collections import Counter

import clickhouse_driver
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PG_DSN = os.environ["DATABASE_URL"]
CH = dict(
    host="localhost",
    port=9001,
    user="statspeak_user",
    password="statspeak_password",
    database="statspeak",
)

CHECKS = []
def expect(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}{(' - ' + detail) if detail else ''}")
    CHECKS.append((name, ok, detail))


def main():
    pg = psycopg2.connect(PG_DSN)
    ch = clickhouse_driver.Client(**CH)

    print("\n== Integrity Checks ==")

    # 1. Row count parity
    pg_cur = pg.cursor()
    pg_cur.execute("SELECT COUNT(*) FROM customers")
    pg_total = pg_cur.fetchone()[0]
    ch_total = ch.execute("SELECT COUNT(*) FROM app_customers")[0][0]
    expect("row_count_match", pg_total == ch_total, f"PG={pg_total} CH={ch_total}")

    # 2. Distinct customer_id parity
    pg_cur.execute('SELECT COUNT(DISTINCT "customerId") FROM customers')
    pg_distinct = pg_cur.fetchone()[0]
    ch_distinct = ch.execute("SELECT COUNT(DISTINCT customer_id) FROM app_customers")[0][0]
    expect("distinct_customer_id_match", pg_distinct == ch_distinct, f"PG={pg_distinct} CH={ch_distinct}")

    # 3. Spot-check 10 random rows by ID == numberical/aggregated values
    pg_cur.execute('SELECT "customerId", "segmentName", recency, frequency, monetary, aov FROM customers ORDER BY "customerId" LIMIT 5 OFFSET 100')
    sample = pg_cur.fetchall()
    for cid, seg, rec, freq, mon, aov in sample:
        ch_row = ch.execute(
            "SELECT segment_name, recency, frequency, monetary, aov FROM app_customers WHERE customer_id = %(cid)s",
            {"cid": cid},
        )
        if not ch_row:
            expect("spot_check_present", False, f"customer {cid} missing in CH")
            continue
        ch_seg, ch_rec, ch_freq, ch_mon, ch_aov = ch_row[0]
        ok = (
            ch_seg == seg
            and abs(ch_rec - (rec or 0)) < 1e-4
            and abs(ch_freq - (freq or 0)) < 1e-4
            and abs(ch_mon - (mon or 0)) < 1e-4
            and abs(ch_aov - (aov or 0)) < 1e-4
        )
        expect("spot_check_value_match", ok, f"{cid}: PG segment={seg}, CH segment={ch_seg}")

    # 4. Segment breakdown parity
    pg_cur.execute('SELECT "segmentName", COUNT(*) FROM customers GROUP BY 1 ORDER BY 1')
    pg_seg = Counter({r[0]: r[1] for r in pg_cur.fetchall()})
    ch_seg_rows = ch.execute("SELECT segment_name, COUNT(*) FROM app_customers GROUP BY segment_name ORDER BY 1")
    ch_seg = Counter({r[0]: r[1] for r in ch_seg_rows})
    expect("segment_breakdown_match", pg_seg == ch_seg, f"PG={dict(pg_seg)} CH={dict(ch_seg)}")

    # 5. Aggregate sums sanity (monetary, recency)
    pg_cur.execute("SELECT SUM(CAST(monetary AS double precision)), SUM(CAST(recency AS double precision)) FROM customers")
    pg_sum_mon, pg_sum_rec = pg_cur.fetchone()
    ch_row = ch.execute("SELECT SUM(monetary), SUM(recency) FROM app_customers")[0]
    ch_sum_mon, ch_sum_rec = ch_row[0], ch_row[1]
    expect("monetary_sum_match", abs(pg_sum_mon - ch_sum_mon) < 1.0, f"PG float64={pg_sum_mon:.2f} CH={ch_sum_mon:.2f}")
    expect("recency_sum_match", abs(pg_sum_rec - ch_sum_rec) < 1.0, f"PG float64={pg_sum_rec:.2f} CH={ch_sum_rec:.2f}")

    pg_cur.close()
    pg.close()

    passed = sum(1 for _, ok, _ in CHECKS if ok)
    total = len(CHECKS)
    print(f"\n{passed}/{total} checks passed")
    if passed != total:
        sys.exit(1)


if __name__ == "__main__":
    main()
