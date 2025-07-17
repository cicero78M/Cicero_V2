import { query } from '../repository/db.js';
import { formatIsoDate } from '../utils/utilsHelper.js';

export async function getEvents(userId) {
  const res = await query(
    'SELECT * FROM editorial_event WHERE created_by = $1 ORDER BY event_date ASC',
    [userId]
  );
  return res.rows;
}

export async function findEventById(id) {
  const res = await query('SELECT * FROM editorial_event WHERE event_id = $1', [id]);
  return res.rows[0] || null;
}

export async function createEvent(data) {
  const eventDate = formatIsoDate(data.event_date);
  const res = await query(
    `INSERT INTO editorial_event (
      event_date, topic, assignee, status, content, summary, image_path, created_by, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, NOW()))
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
      data.created_at || null
    ]
  );
  return res.rows[0];
}

export async function updateEvent(id, data) {
  const old = await findEventById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  merged.event_date = formatIsoDate(merged.event_date);
  const res = await query(
    `UPDATE editorial_event SET
      event_date=$2,
      topic=$3,
      assignee=$4,
      status=$5,
      content=$6,
      summary=$7,
      image_path=$8
     WHERE event_id=$1 RETURNING *`,
    [
      id,
      merged.event_date,
      merged.topic,
      merged.assignee || null,
      merged.status,
      merged.content || null,
      merged.summary || null,
      merged.image_path || null
    ]
  );
  return res.rows[0];
}

export async function deleteEvent(id) {
  const res = await query('DELETE FROM editorial_event WHERE event_id=$1 RETURNING *', [id]);
  return res.rows[0] || null;
}
