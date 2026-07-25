const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  password: 'iconic2003',
  host: 'localhost',
  port: 5432,
  database: 'b2c_segmentation',
});
(async () => {
  try {
    await client.connect();
    await client.query('ALTER TABLE IF EXISTS "pipelineRuns" RENAME TO pipeline_runs;');
    await client.query('ALTER TABLE IF EXISTS "scheduledJobs" RENAME TO scheduled_jobs;');
    console.log('Tables renamed successfully.');
    const res = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' ORDER BY tablename;');
    console.log('Current tables:', res.rows.map(r => r.tablename).join(', '));
    const test = await client.query('SELECT COUNT(*) as count FROM pipeline_runs');
    console.log('pipeline_runs row count:', test.rows[0].count);
    const test2 = await client.query('SELECT COUNT(*) as count FROM scheduled_jobs');
    console.log('scheduled_jobs row count:', test2.rows[0].count);
    await client.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
