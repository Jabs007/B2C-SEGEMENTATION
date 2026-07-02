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
    console.log('Connected to b2c_segmentation');

    const tables = ['users', 'customers', 'predictions', 'pipeline_runs', 'scheduled_jobs'];
    for (const t of tables) {
      const res = await client.query('SELECT COUNT(*) as count FROM ' + t);
      console.log('  ' + t + ': ' + res.rows[0].count + ' rows');
    }

    const runRes = await client.query('SELECT * FROM pipeline_runs ORDER BY "startedAt" DESC LIMIT 1');
    console.log('pipeline_runs query OK, returned ' + runRes.rows.length + ' rows');

    await client.end();
    console.log('DB OK');
  } catch (err) {
    console.error('DB Error:', err.message);
    process.exit(1);
  }
})();
