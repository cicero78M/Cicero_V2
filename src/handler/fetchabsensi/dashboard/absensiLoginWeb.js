import { query } from '../../../db/index.js';
import { getWebLoginCountsByActor } from '../../../model/loginLogModel.js';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function resolveRange({ mode, startTime, endTime }) {
  const normalizedMode = mode === 'mingguan' ? 'mingguan' : 'harian';
  let start = startTime ? new Date(startTime) : null;
  let end = endTime ? new Date(endTime) : null;

  if (startTime && Number.isNaN(start?.getTime())) {
    throw new Error('startTime tidak valid');
  }

  if (endTime && Number.isNaN(end?.getTime())) {
    throw new Error('endTime tidak valid');
  }

  if (!start && !end) {
    const now = new Date();
    if (normalizedMode === 'mingguan') {
      const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
      start = startOfDay(addDays(now, -day));
      end = endOfDay(addDays(start, 6));
    } else {
      start = startOfDay(now);
      end = endOfDay(now);
    }
  } else {
    start = start ? startOfDay(start) : startOfDay(end);
    end = end ? endOfDay(end) : endOfDay(start);
  }

  return { start, end, mode: normalizedMode };
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });
}

async function fetchActorDetails(actorIds = []) {
  if (!actorIds.length) {
    return new Map();
  }
  const uniqueIds = Array.from(new Set(actorIds.filter(Boolean)));

  const [dashboardRes, penmasRes] = await Promise.all([
    query(
      `SELECT du.dashboard_user_id AS actor_id, du.username, r.role_name AS role
       FROM dashboard_user du
       LEFT JOIN roles r ON du.role_id = r.role_id
       WHERE du.dashboard_user_id = ANY($1)`,
      [uniqueIds]
    ),
    query(
      'SELECT user_id AS actor_id, username, role FROM penmas_user WHERE user_id = ANY($1)',
      [uniqueIds]
    ),
  ]);

  const details = new Map();
  (dashboardRes.rows || []).forEach((row) => {
    details.set(row.actor_id, { ...row, source: 'dashboard' });
  });
  (penmasRes.rows || []).forEach((row) => {
    if (!details.has(row.actor_id)) {
      details.set(row.actor_id, { ...row, source: 'penmas' });
    }
  });
  return details;
}

export async function absensiLoginWeb({ mode = 'harian', startTime, endTime } = {}) {
  const { start, end, mode: normalizedMode } = resolveRange({ mode, startTime, endTime });
  const recapRows = await getWebLoginCountsByActor({ startTime: start, endTime: end });
  const actorIds = recapRows.map((row) => row.actor_id).filter(Boolean);
  const detailMap = await fetchActorDetails(actorIds);

  const totalParticipants = recapRows.length;
  const totalLogin = recapRows.reduce((sum, row) => sum + (Number(row.login_count) || 0), 0);

  const header = normalizedMode === 'mingguan'
    ? '🗓️ Rekap Login Web (Mingguan)'
    : '🗓️ Rekap Login Web (Harian)';
  const lines = [
    header,
    `Periode: ${formatDate(start)} - ${formatDate(end)}`,
    `Total hadir: ${totalParticipants} user (${totalLogin} login)`
  ];

  if (!recapRows.length) {
    lines.push('Tidak ada login web pada periode ini.');
    return lines.join('\n');
  }

  const sortedRows = [...recapRows].sort((a, b) => {
    const diff = (Number(b.login_count) || 0) - (Number(a.login_count) || 0);
    if (diff !== 0) return diff;
    return String(a.actor_id || '').localeCompare(String(b.actor_id || ''), 'id-ID', {
      sensitivity: 'base'
    });
  });

  sortedRows.forEach((row, idx) => {
    const detail = detailMap.get(row.actor_id) || {};
    const name = detail.username || detail.nama || row.actor_id || '-';
    const roleLabel = detail.role ? ` - ${String(detail.role).toUpperCase()}` : '';
    const sourceLabel = detail.source ? detail.source : 'unknown';
    lines.push(`${idx + 1}. ${name} (${sourceLabel}${roleLabel}) — ${Number(row.login_count) || 0} kali`);
  });

  return lines.join('\n');
}

export default absensiLoginWeb;
