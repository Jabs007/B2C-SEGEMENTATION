const { Client } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:iconic2003@localhost:5432/b2c_segmentation';
const CH_URL = 'http://localhost:8124';
const CH_USER = 'statspeak_user';
const CH_PASS = 'statspeak_password';
const CH_DB = 'statspeak';

const contactsPath = '/home/jabs101/Documents/B2C_APP/dataset/Contacts_anonymized.csv';
const invoicesPath = '/home/jabs101/Documents/B2C_APP/dataset/Raw_invoices_anonymized.csv';

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function clickHouseQuery(query, params = []) {
  const url = new URL('/' + CH_DB, CH_URL);
  url.searchParams.set('query', query);
  if (params.length) {
    params.forEach((p, i) => url.searchParams.set('param_' + (i + 1), p));
  }
  const res = await fetch(url.toString(), {
    headers: { 'X-ClickHouse-User': CH_USER, 'X-ClickHouse-Key': CH_PASS },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse error ${res.status}: ${text}`);
  }
  return res.text();
}

async function clickHouseInsert(table, rows, columns) {
  const values = rows.map(r => `(${columns.map(c => `'${String(r[c] || '').replace(/'/g, "\\'")}'`).join(',')})`).join(',');
  const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values}`;
  await clickHouseQuery(query);
}

async function main() {
  console.log('Loading datasets...');
  const [contactsRaw, invoicesRaw] = await Promise.all([parseCsv(contactsPath), parseCsv(invoicesPath)]);

  console.log(`Loaded ${contactsRaw.length} contacts, ${invoicesRaw.length} invoices`);

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  try {
    console.log('Truncating tables...');
    await pg.query('TRUNCATE TABLE customers');
    await clickHouseQuery('TRUNCATE TABLE statspeak.contacts');
    await clickHouseQuery('TRUNCATE TABLE statspeak.invoices');

    console.log('Inserting into ClickHouse contacts...');
    const contactsRows = [];
    for (const row of contactsRaw) {
      const createdTime = row.created_time || row.created_time_formatted || '';
      const createdDate = createdTime.split(' ')[0] || new Date().toISOString().split('T')[0];
      contactsRows.push({
        customer_id: row.contact_number || row.contact_id,
        customer_name: row.customer_name || row.contact_name || 'Unknown',
        email: row.email || '',
        phone: row.mobile || row.phone || row.contact_number || '',
        country: '',
        created_date: createdDate,
      });
    }

    const contactColumns = ['customer_id', 'customer_name', 'email', 'phone', 'country', 'created_date'];
    const contactBatchSize = 1000;
    for (let i = 0; i < contactsRows.length; i += contactBatchSize) {
      const batch = contactsRows.slice(i, i + contactBatchSize);
      await clickHouseInsert('statspeak.contacts', batch, contactColumns);
      console.log(`Inserted contacts batch ${Math.floor(i / contactBatchSize) + 1}/${Math.ceil(contactsRows.length / contactBatchSize)}`);
    }

    console.log('Inserting into ClickHouse invoices...');
    const invoiceRows = [];
    for (const row of invoicesRaw) {
      const invoiceDate = row.date || row.created_time?.split(' ')[0] || new Date().toISOString().split('T')[0];
      invoiceRows.push({
        invoice_id: row.invoice_id || row.invoice_number,
        customer_id: row.contact_number || row.customer_id,
        invoice_date: invoiceDate,
        total_amount: parseFloat(row.total || row.bcy_total || 0) || 0,
        line_total: parseFloat(row.total || row.bcy_total || 0) || 0,
        product_id: '',
        quantity: 1,
      });
    }

    const invoiceColumns = ['invoice_id', 'customer_id', 'invoice_date', 'total_amount', 'line_total', 'product_id', 'quantity'];
    const invoiceBatchSize = 5000;
    for (let i = 0; i < invoiceRows.length; i += invoiceBatchSize) {
      const batch = invoiceRows.slice(i, i + invoiceBatchSize);
      await clickHouseInsert('statspeak.invoices', batch, invoiceColumns);
      console.log(`Inserted invoices batch ${Math.floor(i / invoiceBatchSize) + 1}/${Math.ceil(invoiceRows.length / invoiceBatchSize)}`);
    }

    console.log('Computing RFM and inserting into PostgreSQL customers...');
    const rfmRes = await pg.query(`
      WITH invoice_agg AS (
        SELECT 
          customer_id,
          COUNT(*) AS frequency,
          SUM(total_amount) AS monetary,
          AVG(total_amount) AS aov,
          MAX(invoice_date) AS last_invoice_date,
          MIN(invoice_date) AS first_invoice_date
        FROM (
          SELECT customer_id, invoice_date, total_amount 
          FROM statspeak.invoices 
          WHERE customer_id != '' AND customer_id IS NOT NULL
        ) agg
        GROUP BY customer_id
      )
      SELECT 
        i.customer_id,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(i.invoice_date))) / 86400 AS recency,
        COALESCE(a.frequency, 0) AS frequency,
        COALESCE(a.monetary, 0) AS monetary,
        COALESCE(a.aov, 0) AS aov,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(i.invoice_date))) / 86400 AS tenure
      FROM statspeak.invoices i
      LEFT JOIN invoice_agg a ON a.customer_id = i.customer_id
      WHERE i.customer_id != '' AND i.customer_id IS NOT NULL
      GROUP BY i.customer_id, a.frequency, a.monetary, a.aov
    `);

    const now = new Date();
    const customerRows = rfmRes.rows.map(r => ({
      customerId: r.customer_id,
      recency: Math.round(parseFloat(r.recency) || 0),
      frequency: Math.round(parseFloat(r.frequency) || 0),
      monetary: parseFloat(r.monetary) || 0,
      aov: parseFloat(r.aov) || 0,
      tenure: Math.round(parseFloat(r.tenure) || 0),
      segmentName: 'Regulars',
      cluster: 2,
      createdAt: now,
      updatedAt: now,
    }));

    console.log(`Inserting ${customerRows.length} customers into PostgreSQL...`);
    const batchSize = 1000;
    for (let i = 0; i < customerRows.length; i += batchSize) {
      const batch = customerRows.slice(i, i + batchSize);
      const values = batch.map(r => `('${r.customerId}', '${r.segmentName}', ${r.cluster}, ${r.recency}, ${r.frequency}, ${r.monetary}, ${r.aov}, ${r.tenure}, '${r.createdAt.toISOString()}', '${r.updatedAt.toISOString()}')`).join(',');
      await pg.query(`INSERT INTO customers ("customerId", "segmentName", cluster, recency, frequency, monetary, aov, tenure, "createdAt", "updatedAt") VALUES ${values}`);
      console.log(`Inserted customers batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customerRows.length / batchSize)}`);
    }

    console.log('Data ingestion complete!');
    console.log('PostgreSQL customers:', (await pg.query('SELECT count(*) FROM customers')).rows[0].count);
    console.log('ClickHouse contacts:', (await clickHouseQuery('SELECT count() FROM statspeak.contacts')).trim());
    console.log('ClickHouse invoices:', (await clickHouseQuery('SELECT count() FROM statspeak.invoices')).trim());
  } catch (err) {
    console.error('Ingestion failed:', err);
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main();
