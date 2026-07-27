#!/usr/bin/env python3
"""Ingest RAW CSV datasets into ClickHouse and PostgreSQL."""
import os
from datetime import datetime

import pandas as pd
import psycopg2
from clickhouse_driver import Client

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", 9001))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "statspeak_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "statspeak_password")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "statspeak")

POSTGRES_URL = os.getenv("DATABASE_URL", "postgresql://postgres:iconic2003@localhost:5432/b2c_segmentation")

BASE_DIR = "/home/jabs101/Documents/B2C_APP/dataset"
CONTACTS_CSV = os.path.join(BASE_DIR, "Contacts_anonymized.csv")
INVOICES_CSV = os.path.join(BASE_DIR, "Raw_invoices_anonymized.csv")


def get_pg_conn():
    return psycopg2.connect(POSTGRES_URL)


def get_ch_client():
    return Client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        user=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD,
        database=CLICKHOUSE_DB,
    )


def escape_ch_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{s}'"


def batch_insert(client, table, rows, columns, batch_size=5000):
    cols_sql = ", ".join(columns)
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values_sql = ", ".join(
            "(" + ", ".join(escape_ch_literal(v) for v in row) + ")" for row in batch
        )
        query = f"INSERT INTO {table} ({cols_sql}) VALUES {values_sql}"
        client.execute(query)


def load_contacts_ch(client):
    print("Loading contacts to ClickHouse...")
    df = pd.read_csv(CONTACTS_CSV, usecols=["contact_number", "customer_name", "contact_name", "created_time"])
    df = df.rename(columns={"contact_number": "customer_id"})
    df["customer_id"] = df["customer_id"].astype(str)
    df["customer_name"] = df["customer_name"].fillna(df["contact_name"]).fillna("Unknown").astype(str)
    df["email"] = ""
    df["phone"] = ""
    df["country"] = ""
    df["created_date"] = pd.to_datetime(df["created_time"], errors="coerce").dt.date.fillna(datetime.utcnow().date())

    rows = df[["customer_id", "customer_name", "email", "phone", "country", "created_date"]].values.tolist()
    columns = ["customer_id", "customer_name", "email", "phone", "country", "created_date"]
    batch_insert(client, "contacts", rows, columns)
    print(f"Inserted {len(rows)} contacts into ClickHouse")


def load_invoices_ch(client):
    print("Loading invoices to ClickHouse...")
    df = pd.read_csv(INVOICES_CSV, usecols=["invoice_id", "contact_number", "date", "total"])
    df = df.rename(columns={"contact_number": "customer_id", "total": "total_amount"})
    df["invoice_id"] = df["invoice_id"].astype(str)
    df["customer_id"] = df["customer_id"].astype(str)
    df["invoice_date"] = pd.to_datetime(df["date"], errors="coerce").dt.date.fillna(datetime.utcnow().date())
    df["total_amount"] = pd.to_numeric(df["total_amount"], errors="coerce").fillna(0.0)
    df["line_total"] = df["total_amount"]
    df["product_id"] = ""
    df["quantity"] = 1

    rows = df[["invoice_id", "customer_id", "invoice_date", "total_amount", "line_total", "product_id", "quantity"]].values.tolist()
    columns = ["invoice_id", "customer_id", "invoice_date", "total_amount", "line_total", "product_id", "quantity"]
    batch_insert(client, "invoices", rows, columns)
    print(f"Inserted {len(rows)} invoices into ClickHouse")


def build_postgres_customers():
    print("Building RFM from CSV into PostgreSQL...")
    contacts = pd.read_csv(CONTACTS_CSV, usecols=["contact_number", "customer_name", "contact_name", "created_time"])
    contacts = contacts.rename(columns={"contact_number": "customer_id"})
    contacts["customer_id"] = contacts["customer_id"].astype(str)
    contacts["customer_name"] = contacts["customer_name"].fillna(contacts["contact_name"]).fillna("Unknown").astype(str)

    invoices = pd.read_csv(INVOICES_CSV, usecols=["contact_number", "date", "total"])
    invoices = invoices.rename(columns={"contact_number": "customer_id", "total": "total_amount"})
    invoices["customer_id"] = invoices["customer_id"].astype(str)
    invoices["invoice_date"] = pd.to_datetime(invoices["date"], errors="coerce").dt.tz_localize("UTC", ambiguous=False, nonexistent="NaT")
    invoices["total_amount"] = pd.to_numeric(invoices["total_amount"], errors="coerce").fillna(0.0)

    rfm = (
        invoices.groupby("customer_id")
        .agg(
            recency=("invoice_date", lambda x: int((pd.Timestamp.utcnow() - pd.Timestamp(x.max())).total_seconds() / 86400)),
            frequency=("invoice_date", "count"),
            monetary=("total_amount", "sum"),
            aov=("total_amount", "mean"),
            tenure=("invoice_date", lambda x: int((pd.Timestamp.utcnow() - pd.Timestamp(x.min())).total_seconds() / 86400)),
        )
        .reset_index()
    )
    rfm["customer_id"] = rfm["customer_id"].astype(str)
    rfm = rfm[rfm["customer_id"] != ""].fillna(0)

    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute('TRUNCATE TABLE customers')
        rows = []
        for r in rfm.itertuples(index=False):
            rows.append(
                (
                    r.customer_id,
                    "Regulars",
                    2,
                    int(r.recency or 0),
                    int(r.frequency or 0),
                    float(r.monetary or 0),
                    float(r.aov or 0),
                    int(r.tenure or 0),
                    datetime.utcnow(),
                    datetime.utcnow(),
                )
            )
        for i in range(0, len(rows), 1000):
            batch = rows[i : i + 1000]
            args_str = ",".join(
                cur.mogrify(
                    "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    row,
                ).decode()
                for row in batch
            )
            cur.execute('INSERT INTO customers ("customerId","segmentName",cluster,recency,frequency,monetary,aov,tenure,"createdAt","updatedAt") VALUES {values}'.replace("{values}", args_str))
        conn.commit()
        cur.execute('SELECT count(*) FROM customers')
        count = cur.fetchone()[0]
        print(f"Inserted {count} customers into PostgreSQL customers")
    finally:
        conn.close()


def main():
    ch = get_ch_client()
    load_contacts_ch(ch)
    load_invoices_ch(ch)
    build_postgres_customers()

    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute('SELECT count(*) FROM customers')
        print("Final PostgreSQL customers count:", cur.fetchone()[0])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
