/**
 * ClickHouse client over HTTP (port 8124).
 * Used to read analytics data written by the Python ETL pipeline.
 */

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? 'http://localhost:8124';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? 'statspeak_user';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? 'statspeak_password';

export type SegmentDistributionRow = {
  segment: string;
  count: number;
};

export type PipelineLogRow = {
  pipeline_run_id: string;
  run_date: string;
  total_customers: number;
  successfully_scored: number;
  errors: number;
  average_confidence: number;
  processing_time_seconds: number;
  status: string;
};

export type CustomerSegmentRow = {
  customer_id: string;
  segment: string;
  confidence: number;
  recency: number;
  frequency: number;
  monetary: number;
  aov: number;
  tenure: number;
  prediction_date: string;
};

const basicAuth = `Basic ${Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')}`;

/**
 * Run a SQL query against ClickHouse via GET-style form params (path `?`).
 *
 * ClickHouse 26.x supports HTTP form params in the URL via GET. We use:
 *   ?query=<sql>&database=statspeak&default_format=JSON
 *
 * For named-param binding (`{name:Type}`), each param is encoded as `param_<name>=value`.
 */
async function chQuery<T>(sql: string): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('query', sql);
  url.searchParams.set('database', 'statspeak');
  url.searchParams.set('default_format', 'JSON');

  // Bind any {name:Type} placeholders by reading their values from the SQL.
  // For ordinary (no-bind) queries there are no placeholders to bind.
  const placeholders = [...sql.matchAll(/\{\s*(\w+)\s*:[^}]+\}/g)].map(m => m[1]);
  for (const name of placeholders) {
    url.searchParams.set(`param_${name}`, sql);
    // (Caller must supply values externally — this function variant doesn't take params.
    // use `chQueryWithParams` for parametrized queries.)
    void name;
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: basicAuth,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse query failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  return (json.data ?? []) as T[];
}

/**
 * Run a parameterised SQL query against ClickHouse.
 *
 * Values for `{name:Type}` placeholders are passed as URL query params
 * (`?param_<name>=value`).  Always pass strings; ClickHouse will cast
 * to the placeholder type.
 */
async function chQueryWithParams<T>(sql: string, params: Record<string, string | number>): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('query', sql);
  url.searchParams.set('database', 'statspeak');
  url.searchParams.set('default_format', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(`param_${k}`, String(v));
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: basicAuth },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse query failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  return (json.data ?? []) as T[];
}

export async function getSegmentDistribution(): Promise<SegmentDistributionRow[]> {
  const sql = `
    SELECT segment, COUNT(*) AS count
    FROM customer_segments
    WHERE prediction_date >= now() - INTERVAL 30 DAY
    GROUP BY segment
    ORDER BY count DESC
  `;
  return chQuery<SegmentDistributionRow>(sql);
}

export async function getPipelineLogs(limit: number = 20): Promise<PipelineLogRow[]> {
  const sql = `
    SELECT
      pipeline_run_id,
      run_date,
      total_customers,
      successfully_scored,
      errors,
      average_confidence,
      processing_time_seconds,
      status
    FROM pipeline_logs
    ORDER BY run_date DESC
    LIMIT {limit:UInt32}
  `;
  return chQueryWithParams<PipelineLogRow>(sql, { limit });
}

export async function getCustomerSegment(customerId: string): Promise<CustomerSegmentRow | null> {
  const sql = `
    SELECT
      customer_id, segment, confidence,
      recency, frequency, monetary, aov, tenure,
      prediction_date
    FROM customer_segments
    WHERE customer_id = {cid:String}
    ORDER BY prediction_date DESC
    LIMIT 1
  `;
  const rows = await chQueryWithParams<CustomerSegmentRow>(sql, { cid: customerId });
  return rows.length > 0 ? rows[0] : null;
}

export async function searchCustomers(query: string, limit: number = 50): Promise<CustomerSegmentRow[]> {
  const sql = `
    SELECT
      customer_id, segment, confidence,
      recency, frequency, monetary, aov, tenure,
      prediction_date
    FROM customer_segments
    WHERE customer_id LIKE {pat:String}
    ORDER BY prediction_date DESC
    LIMIT {limit:UInt32}
  `;
  return chQueryWithParams<CustomerSegmentRow>(sql, { pat: `%${query}%`, limit });
}
