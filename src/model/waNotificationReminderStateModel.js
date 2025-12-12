import { query } from '../repository/db.js';

export async function getReminderStateMapForDate(dateKey) {
  if (!dateKey) return new Map();
  const res = await query(
    `SELECT chat_id, last_stage, is_complete
     FROM wa_notification_reminder_state
     WHERE date_key = $1`,
    [dateKey]
  );

  const stateMap = new Map();
  res.rows.forEach((row) => {
    stateMap.set(row.chat_id, {
      lastStage: row.last_stage,
      isComplete: row.is_complete,
    });
  });

  return stateMap;
}

export async function upsertReminderState({ dateKey, chatId, lastStage, isComplete }) {
  if (!dateKey || !chatId) return null;
  const stage = lastStage || 'initial';
  const completeFlag = Boolean(isComplete);

  await query(
    `INSERT INTO wa_notification_reminder_state (date_key, chat_id, last_stage, is_complete)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date_key, chat_id) DO UPDATE
       SET last_stage = EXCLUDED.last_stage,
           is_complete = EXCLUDED.is_complete,
           updated_at = NOW()`,
    [dateKey, chatId, stage, completeFlag]
  );

  return { chatId, lastStage: stage, isComplete: completeFlag };
}

export async function deleteReminderStateForDate(dateKey) {
  if (!dateKey) return 0;
  const res = await query(
    'DELETE FROM wa_notification_reminder_state WHERE date_key = $1',
    [dateKey]
  );
  return res.rowCount || 0;
}
