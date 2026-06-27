const { Client } = require('pg');

(async () => {
  const client = new Client({
    user: 'postgres',
    password: 'iconic2003',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
  });

  try {
    await client.connect();
    await client.query('CREATE DATABASE b2c_segmentation;');
    console.log('Database b2c_segmentation created successfully');
  } catch (err) {
    console.error('Failed to create database:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
