let sqlite;
let db;

async function init() {
  if (!sqlite) {
    sqlite = await import('sqlite3');
    const Database = sqlite.Database;
    db = new Database(process.env.SQLITE_PATH || ':memory:');
  }
}

export async function query(text, params = []) {
  await init();
  return new Promise((resolve, reject) => {
    db.all(text, params, (err, rows) => {
      if (err) return reject(err);
      resolve({ rows });
    });
  });
}

export function close() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close(err => (err ? reject(err) : resolve()));
  });
}
