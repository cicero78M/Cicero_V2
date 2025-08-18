// src/model/userModel.js

import { query } from '../repository/db.js';

async function addRole(userId, roleName) {
  await query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', [roleName]);
  await query(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, (SELECT role_id FROM roles WHERE role_name=$2)) ON CONFLICT DO NOTHING',
    [userId, roleName]
  );
}

async function removeRole(userId, roleName) {
  await query(
    'DELETE FROM user_roles WHERE user_id=$1 AND role_id=(SELECT role_id FROM roles WHERE role_name=$2)',
    [userId, roleName]
  );
}

// Helper to normalize text fields to uppercase
function normalizeUserFields(data) {
  if (!data) return;
  const fields = ['nama', 'title', 'divisi', 'jabatan', 'desa'];
  for (const key of fields) {
    if (data[key] && typeof data[key] === 'string') {
      data[key] = data[key].toUpperCase();
    }
  }
}

// Bangun klausa filter client dengan mempertimbangkan tipe client
async function buildClientFilter(clientId, alias = 'u', index = 1, roleFilter = null) {
  const { rows } = await query(
    'SELECT client_type FROM clients WHERE client_id = $1',
    [clientId]
  );
  const clientType = rows[0]?.client_type?.toLowerCase();
  const placeholder = `$${index}`;
  const params = [clientId];
  let clause;

  if (clientType === 'direktorat') {
    clause = `EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ${alias}.user_id AND r.role_name = ${placeholder}
      )`;
  } else {
    clause = `${alias}.client_id = ${placeholder}`;
    const allowedRoles = ['ditbinmas', 'ditlantas', 'bidhumas'];
    if (roleFilter && allowedRoles.includes(roleFilter.toLowerCase())) {
      const rolePlaceholder = `$${index + 1}`;
      clause += ` AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ${alias}.user_id AND r.role_name = ${rolePlaceholder}
      )`;
      params.push(roleFilter);
    }
  }

  return { clause, params };
}

// ========== QUERY DATABASE ==========

// Ambil daftar client_id berdasarkan role_name
export async function getClientsByRole(roleName) {
  const { rows } = await query(
    'SELECT DISTINCT LOWER(client_id) AS client_id FROM users WHERE LOWER(role_name) = LOWER($1)',
    [roleName]
  );
  return rows.map((r) => r.client_id);
}

// Ambil semua user aktif (status = true), tanpa filter insta
export async function getUsersByClient(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const res = await query(
    `SELECT user_id, nama, tiktok, insta, divisi, title, status, exception
     FROM "user" u
     WHERE ${clause} AND status = true`,
    params
  );
  return res.rows;
}

// Ambil semua user aktif (status = true/NULL), khusus absensi TikTok
export async function getUsersByClientFull(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const res = await query(
    `SELECT user_id, nama, tiktok, divisi, title, exception
     FROM "user" u
     WHERE ${clause} AND (status IS TRUE OR status IS NULL)`,
    params
  );
  // DEBUG: log hasilnya
  console.log('[DEBUG][getUsersByClientFull] TikTok, client_id:', client_id, '| user:', res.rows.length);
  return res.rows;
}

// [OPSI] Ambil user by Instagram (status = true)

// Ambil seluruh user dari semua client
export async function getAllUsers(client_id, roleFilter = null) {
  if (client_id) {
    const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
    const res = await query(
      `SELECT * FROM "user" u WHERE ${clause}`,
      params
    );
    return res.rows;
  } else {
    // Jika tanpa client_id, ambil semua user di seluruh client
    const res = await query('SELECT * FROM "user"');
    return res.rows;
  }
}

// Ambil user yang SUDAH mengisi Instagram (status true)
export async function getInstaFilledUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, insta
     FROM "user" u
     WHERE ${clause} AND insta IS NOT NULL AND insta <> '' AND status = true
     ORDER BY divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi Instagram (status true)
export async function getInstaEmptyUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user" u
     WHERE ${clause} AND (insta IS NULL OR insta = '') AND status = true
     ORDER BY divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang SUDAH mengisi TikTok (status true)
export async function getTiktokFilledUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, tiktok
     FROM "user" u
     WHERE ${clause} AND tiktok IS NOT NULL AND tiktok <> '' AND status = true
     ORDER BY divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi TikTok (status true)
export async function getTiktokEmptyUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user" u
     WHERE ${clause} AND (tiktok IS NULL OR tiktok = '') AND status = true
     ORDER BY divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil semua user aktif (status=true) beserta whatsapp
export async function getUsersWithWaByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, whatsapp
     FROM "user" u WHERE ${clause} AND status = true
     ORDER BY divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil seluruh user aktif dengan nomor WhatsApp
export async function getActiveUsersWithWhatsapp() {
  const { rows } = await query(
    `SELECT nama, whatsapp
     FROM "user"
     WHERE status = true AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );
  return rows;
}

// Ambil user aktif yang belum melengkapi data (insta/tiktok/whatsapp)
export async function getUsersMissingDataByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const res = await query(
    `SELECT user_id, nama, insta, tiktok, whatsapp
     FROM "user" u
     WHERE ${clause} AND status = true
       AND (insta IS NULL OR insta='' OR
            tiktok IS NULL OR tiktok='' OR
            whatsapp IS NULL OR whatsapp='')
     ORDER BY nama`,
    params
  );
  return res.rows;
}

export async function findUserById(user_id) {
  const { rows } = await query(
    `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id=$1\n     GROUP BY u.user_id`,
    [user_id]
  );
  return rows[0];
}

// Ambil user berdasarkan user_id dan client_id
export async function findUserByIdAndClient(user_id, client_id, roleFilter = null) {
  const { clause, params: clientParams } = await buildClientFilter(client_id, 'u', 2, roleFilter);
  const { rows } = await query(
    `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id=$1 AND ${clause}\n     GROUP BY u.user_id`,
    [user_id, ...clientParams]
  );
  return rows[0];
}

export async function updatePremiumStatus(userId, status, endDate) {
  const { rows } = await query(
    'UPDATE "user" SET premium_status=$2, premium_end_date=$3 WHERE user_id=$1 RETURNING *',
    [userId, status, endDate]
  );
  return rows[0] || null;
}

/**
 * Update field user (termasuk insta/tiktok/whatsapp/exception/status/nama/title/divisi/jabatan)
 */
export async function updateUserField(user_id, field, value) {
  const allowed = [
    "insta",
    "tiktok",
    "whatsapp",
    "exception",
    "status",
    "nama",
    "title",
    "divisi",
    "jabatan",
    "desa",
    "premium_status",
    "premium_end_date",
  ];
  const roleFields = ["ditbinmas", "ditlantas", "bidhumas", "operator"];
  if (!allowed.includes(field) && !roleFields.includes(field)) throw new Error("Field tidak diizinkan!");
  if (["nama", "title", "divisi", "jabatan", "desa"].includes(field) && typeof value === 'string') {
    value = value.toUpperCase();
  }
  if (roleFields.includes(field)) {
    if (value) await addRole(user_id, field);
    else await removeRole(user_id, field);
    return findUserById(user_id);
  }
  await query(
    `UPDATE "user" SET ${field}=$1 WHERE user_id=$2`,
    [value, user_id]
  );
  return findUserById(user_id);
}

// Ambil user dengan exception per client
export async function getExceptionUsersByClient(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const { rows } = await query(
    `SELECT * FROM "user" u WHERE exception = true AND ${clause}`,
    params
  );
  return rows;
}

// Ambil user dengan flag direktorat binmas atau lantas
export async function getDirektoratUsers(clientId = null) {
  let sql = `SELECT u.*,\n    bool_or(r.role_name='ditbinmas') AS ditbinmas,\n    bool_or(r.role_name='ditlantas') AS ditlantas,\n    bool_or(r.role_name='bidhumas') AS bidhumas\n  FROM "user" u\n  JOIN user_roles ur ON u.user_id = ur.user_id\n  JOIN roles r ON ur.role_id = r.role_id\n  WHERE r.role_name IN ('ditbinmas','ditlantas','bidhumas')`;
  const params = [];
  if (clientId) {
    sql += ' AND u.client_id = $1';
    params.push(clientId);
  }
  sql += ' GROUP BY u.user_id';
  const { rows } = await query(sql, params);
  return rows;
}

// Ambil user berdasarkan flag direktorat tertentu (ditbinmas/ditlantas/bidhumas)
// Jika clientId berupa array, filter berdasarkan list tersebut.
// Selalu memastikan user memiliki role yang sama dengan client_id-nya.
export async function getUsersByDirektorat(flag, clientId = null) {
  if (!['ditbinmas', 'ditlantas', 'bidhumas'].includes(flag)) {
    throw new Error('Direktorat flag tidak valid');
  }

  let sql = `SELECT u.*,\n    bool_or(r.role_name='ditbinmas') AS ditbinmas,\n    bool_or(r.role_name='ditlantas') AS ditlantas,\n    bool_or(r.role_name='bidhumas') AS bidhumas\n  FROM "user" u\n  JOIN user_roles ur ON u.user_id = ur.user_id\n  JOIN roles r ON ur.role_id = r.role_id\n  WHERE r.role_name = $1\n    AND EXISTS (\n      SELECT 1 FROM user_roles ur2\n      JOIN roles r2 ON ur2.role_id = r2.role_id\n      WHERE ur2.user_id = u.user_id AND LOWER(r2.role_name) = LOWER(u.client_id)\n    )`;
  const params = [flag];

  if (clientId) {
    if (Array.isArray(clientId)) {
      sql += ' AND LOWER(u.client_id) = ANY($2)';
      params.push(clientId.map((c) => c.toLowerCase()));
    } else {
      sql += ' AND LOWER(u.client_id) = LOWER($2)';
      params.push(clientId);
    }
  }

  sql += ' GROUP BY u.user_id';
  const { rows } = await query(sql, params);
  return rows;
}

export async function findUserByWhatsApp(wa) {
  if (!wa) return null;
  const { rows } = await query(
    `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.whatsapp = $1\n     GROUP BY u.user_id`,
    [wa]
  );
  return rows[0];
}

export async function findUserByIdAndWhatsApp(userId, wa) {
  if (!userId || !wa) return null;
  const { rows } = await query(
    `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id = $1 AND u.whatsapp = $2\n     GROUP BY u.user_id`,
    [userId, wa]
  );
  return rows[0];
}

// Ambil semua pangkat/title unik (distinct)

// Mendapatkan daftar pangkat unik dari tabel user (atau dari tabel/enum khusus jika ada)
export async function getAvailableTitles() {
  // Jika ada table titles: return await query('SELECT DISTINCT title FROM titles');
  const res = await query(
    'SELECT DISTINCT title FROM "user" WHERE title IS NOT NULL ORDER BY title'
  );
  return res.rows.map((r) => r.title).filter(Boolean);
}

// Ambil daftar Satfung unik dari database
export async function getAvailableSatfung(clientId = null, roleFilter = null) {
  // Gunakan "user" (pakai kutip dua) karena user adalah reserved word di Postgres
  let res;
  if (clientId) {
    const { clause, params } = await buildClientFilter(clientId, '"user"', 1, roleFilter);
    res = await query(
      `SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL AND ${clause} ORDER BY divisi`,
      params
    );
  } else {
    res = await query(
      'SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL ORDER BY divisi'
    );
  }
  return res.rows.map((r) => r.divisi).filter(Boolean);
}

// --- Tambahkan fungsi createUser ---
export async function createUser(userData) {
  // Contoh userData: {user_id, nama, title, divisi, jabatan, ...}
  // Sesuaikan dengan struktur dan database-mu!
  normalizeUserFields(userData);
  const roles = ['ditbinmas', 'ditlantas', 'bidhumas', 'operator'].filter(
    (r) => userData[r]
  );
  const q = `
    INSERT INTO "user" (user_id, nama, title, divisi, jabatan, desa, status, whatsapp, insta, tiktok, client_id, exception)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `;
  const params = [
    userData.user_id,
    userData.nama,
    userData.title,
    userData.divisi,
    userData.jabatan,
    userData.desa,
    userData.status ?? true, // default true
    userData.whatsapp || "",
    userData.insta || "",
    userData.tiktok || "",
    userData.client_id || null,
    userData.exception ?? false
  ];
  await query(q, params);
  for (const r of roles) {
    await addRole(userData.user_id, r);
  }
  return findUserById(userData.user_id);
}

export async function updateUser(userId, userData) {
  normalizeUserFields(userData);
  const roleFields = ['ditbinmas', 'ditlantas', 'bidhumas', 'operator'];
  const roles = {};
  for (const rf of roleFields) {
    if (rf in userData) {
      roles[rf] = userData[rf];
      delete userData[rf];
    }
  }
  const columns = Object.keys(userData);
  if (columns.length > 0) {
    const setClause = columns.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const params = columns.map((c) => userData[c]);
    params.push(userId);
    await query(
      `UPDATE "user" SET ${setClause} WHERE user_id=$${columns.length + 1}`,
      params
    );
  }
  for (const [r, val] of Object.entries(roles)) {
    if (val) await addRole(userId, r);
    else await removeRole(userId, r);
  }
  return findUserById(userId);
}

export async function deleteUser(userId) {
  const { rows } = await query(
    'DELETE FROM "user" WHERE user_id=$1 RETURNING *',
    [userId]
  );
  return rows[0];
}

// Hapus field WhatsApp untuk semua user yang nomornya terdapat pada adminWAList
export async function clearUsersWithAdminWA(adminWAList) {
  if (!adminWAList || adminWAList.length === 0) return [];
  const { rows } = await query(
    "UPDATE \"user\" SET whatsapp = '' WHERE whatsapp = ANY($1::text[]) RETURNING user_id",
    [adminWAList]
  );
  return rows;
}

// --- Alias for backward compatibility ---
export const findUsersByClientId = getUsersByClient;
export const findUserByWA = findUserByWhatsApp;
