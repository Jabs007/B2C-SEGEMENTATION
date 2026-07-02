const { Client } = require('pg');

async function main() {
  const client = new Client({
    user: 'postgres',
    password: 'iconic2003',
    host: 'localhost',
    port: 5432,
    database: 'b2c_segmentation',
  });

  try {
    await client.connect();
    await client.query('ALTER TABLE IF EXISTS "pipelineRuns" RENAME TO pipeline_runs;');
    await client.query('ALTER TABLE IF EXISTS "scheduledJobs" RENAME TO scheduled_jobs;');
    console.log('DB tables renamed');

    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
    console.log('Tables:', res.rows.map((x) => x.tablename).join(', '));

    const r2 = await client.query('SELECT COUNT(*) FROM pipeline_runs');
    console.log('pipeline_runs count:', r2.rows[0].count);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
