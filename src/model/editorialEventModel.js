import { query } from '../repository/db.js';
import { formatIsoTimestamp, formatDdMmYyyy } from '../utils/utilsHelper.js';

export async function getEvents(userId) {
  const res = await query(
    `SELECT e.*, u.username AS updated_by_username
     FROM editorial_event e
     LEFT JOIN penmas_user u ON u.user_id = e.updated_by
     WHERE e.created_by = $1
     ORDER BY e.event_date ASC`,
    [userId]
  );
  return res.rows.map((row) => ({
    ...row,
    last_updated: row.last_update,
    event_date: formatDdMmYyyy(row.event_date),
  }));
}

export async function findEventById(id) {
  const res = await query('SELECT * FROM editorial_event WHERE event_id = $1', [id]);
  return res.rows[0] || null;
}

export async function createEvent(data) {
  const eventDate = formatIsoTimestamp(data.event_date);
  const res = await query(
    `INSERT INTO editorial_event (
      event_date, topic, assignee, status, content, summary, image_path,
      created_by, updated_by, username, created_at, last_update
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, NOW()), COALESCE($12, NOW()))
     RETURNING *`,
    [
      eventDate,
      data.topic,
      data.assignee || null,
      data.status || 'draft',
      data.content || null,
      data.summary || null,
      data.image_path || null,
      data.created_by,
      data.updated_by || data.created_by,
      data.username || null,
      data.created_at || null,
      data.last_update || null
    ]
  );
  return res.rows[0];
}

export async function updateEvent(id, data) {
  const old = await findEventById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  merged.event_date = formatIsoTimestamp(merged.event_date);
  const res = await query(
    `UPDATE editorial_event SET
      event_date=$2,
      topic=$3,
      assignee=$4,
      status=$5,
      content=$6,
      summary=$7,
      image_path=$8,
      username=$9,
      updated_by=$10,
      last_update=COALESCE($11, NOW())
     WHERE event_id=$1 RETURNING *`,
    [
      id,
      merged.event_date,
      merged.topic,
      merged.assignee || null,
      merged.status,
      merged.content || null,
      merged.summary || null,
      merged.image_path || null,
      merged.username || null,
      data.updated_by || merged.updated_by || null,
      merged.last_update || null
    ]
  );
  return res.rows[0];
}

export async function deleteEvent(id) {
  const res = await query('DELETE FROM editorial_event WHERE event_id=$1 RETURNING *', [id]);
  return res.rows[0] || null;
}
