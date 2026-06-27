const { Client } = require('pg');

(async () => {
  const client = new Client({
    user: 'postgres',
    password: 'iconic2003',
    host: 'localhost',
    port: 5432,
    database: 'b2c_segmentation',
  });

  try {
    await client.connect();
    
    // Check what tables exist
    const res = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    
    console.log('Tables in b2c_segmentation database:');
    if (res.rows.length === 0) {
      console.log('  (none) - Migration may have failed silently');
    } else {
      res.rows.forEach(row => console.log(`  ✓ ${row.tablename}`));
    }

    // Also check drizzle core tables
    const drizzleRes = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'drizzle' OR tablename LIKE 'drizzle_%'
      ORDER BY tablename;
    `);
    
    if (drizzleRes.rows.length > 0) {
      console.log('\nDrizzle internal tables:');
      drizzleRes.rows.forEach(row => console.log(`  ✓ ${row.tablename}`));
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
