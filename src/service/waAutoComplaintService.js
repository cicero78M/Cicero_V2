import {
  clientRequestHandlers,
  parseComplaintMessage,
} from '../handler/menu/clientRequestHandlers.js';
import { normalizeUserId } from '../utils/utilsHelper.js';

function hasComplaintHeader(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const [firstLine] = lines;
  if (!/^pesan\s+komplain/i.test(firstLine)) {
    return false;
  }
  const hasKendalaSection = lines.some((line) =>
    /^kendala\b/.test(line.toLowerCase().replace(/[:：]/g, ''))
  );
  if (!hasKendalaSection) {
    return false;
  }
  const parsed = parseComplaintMessage(text);
  const nrp = normalizeUserId(parsed?.nrp || '');
  return Boolean(nrp);
}

export function shouldHandleComplaintMessage({
  text,
  allowUserMenu,
  session,
  isAdmin,
  initialIsMyContact,
}) {
  if (allowUserMenu) return false;
  if (session?.menu === 'clientrequest') return false;
  const isVerified = isAdmin || initialIsMyContact === true;
  if (!isVerified) return false;
  return hasComplaintHeader(text);
}

export async function handleComplaintMessageIfApplicable({
  text,
  allowUserMenu,
  session,
  isAdmin,
  initialIsMyContact,
  chatId,
  adminOptionSessions,
  setSession,
  getSession,
  waClient,
  pool,
  userModel,
}) {
  if (
    !shouldHandleComplaintMessage({
      text,
      allowUserMenu,
      session,
      isAdmin,
      initialIsMyContact,
    })
  ) {
    return false;
  }

  const adminSession = adminOptionSessions?.[chatId];
  if (adminSession?.timeout) {
    clearTimeout(adminSession.timeout);
  }
  if (adminOptionSessions) {
    delete adminOptionSessions[chatId];
  }

  setSession(chatId, {
    menu: 'clientrequest',
    step: 'respondComplaint_message',
    respondComplaint: {},
  });
  const updatedSession = getSession(chatId);
  await clientRequestHandlers.respondComplaint_message(
    updatedSession,
    chatId,
    text,
    waClient,
    pool,
    userModel
  );
  return true;
}
