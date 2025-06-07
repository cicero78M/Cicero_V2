const clientRequestSessions = {}; // { chatId: {step, data, ...} }
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit timeout
const MENU_TIMEOUT = 2 * 60 * 1000; // 2 menit timeout


// Tambah di atas (global scope)
export const userMenuContext = {};
export const updateUsernameSession = {};
export const knownUserSet = new Set();

// --- Utility helper untuk session timeout ---
export function setMenuTimeout(chatId) {
  if (userMenuContext[chatId]?.timeout) {
    clearTimeout(userMenuContext[chatId].timeout);
  }
  userMenuContext[chatId].timeout = setTimeout(() => {
    delete userMenuContext[chatId];
  }, MENU_TIMEOUT);
}
export function setSession(chatId, data) {
  clientRequestSessions[chatId] = { ...data, time: Date.now() };
}
export function getSession(chatId) {
  const s = clientRequestSessions[chatId];
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TIMEOUT) {
    delete clientRequestSessions[chatId];
    return null;
  }
  return s;
}
export function clearSession(chatId) {
  delete clientRequestSessions[chatId];
}
