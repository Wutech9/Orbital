const fs = require('fs');
const path = require('path');
const db = require('./index');

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await db.query(sql);
    console.log('Database schema initialised.');
  } catch (err) {
    console.error('Failed to initialise schema:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

init();
