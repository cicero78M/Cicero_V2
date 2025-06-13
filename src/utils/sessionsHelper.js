// utils/sessionsHelper.js

// =======================
// KONSTANTA & GLOBAL SESSIONS
// =======================

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit
const MENU_TIMEOUT = 2 * 60 * 1000;    // 2 menit
const BIND_TIMEOUT = 2 * 60 * 1000;    // 2 menit

export const userMenuContext = {};         // { chatId: {step, ...} }
export const updateUsernameSession = {};   // { chatId: {step, ...} }
export const knownUserSet = new Set();     // Set of WA number or chatId (untuk first time/fallback)
export const waBindSessions = {};          // { chatId: {step, ...} }
export const operatorOptionSessions = {};  // { chatId: {timeout} }
const clientRequestSessions = {};          // { chatId: {step, data, ...} }

// =======================
// UTILITY UNTUK MENU USER (INTERAKTIF)
// =======================

/**
 * Set timeout auto-expire pada userMenuContext (menu interaktif user).
 * @param {string} chatId 
 */
export function setMenuTimeout(chatId) {
  if (userMenuContext[chatId]?.timeout) {
    clearTimeout(userMenuContext[chatId].timeout);
  }
  userMenuContext[chatId].timeout = setTimeout(() => {
    delete userMenuContext[chatId];
  }, MENU_TIMEOUT);
}

// Timeout untuk proses binding WhatsApp
export function setBindTimeout(chatId) {
  if (waBindSessions[chatId]?.timeout) {
    clearTimeout(waBindSessions[chatId].timeout);
  }
  waBindSessions[chatId].timeout = setTimeout(() => {
    delete waBindSessions[chatId];
  }, BIND_TIMEOUT);
}

// Timeout untuk pilihan operator/menu user
export function setOperatorOptionTimeout(chatId) {
  if (operatorOptionSessions[chatId]?.timeout) {
    clearTimeout(operatorOptionSessions[chatId].timeout);
  }
  operatorOptionSessions[chatId].timeout = setTimeout(() => {
    delete operatorOptionSessions[chatId];
  }, MENU_TIMEOUT);
}

// =======================
// UTILITY UNTUK SESSION CLIENTREQUEST
// =======================

/**
 * Set session untuk clientrequest.
 * @param {string} chatId 
 * @param {object} data 
 */
export function setSession(chatId, data) {
  clientRequestSessions[chatId] = { ...data, time: Date.now() };
}

/**
 * Get session untuk clientrequest. Otomatis auto-expire setelah timeout.
 * @param {string} chatId 
 * @returns {object|null}
 */
export function getSession(chatId) {
  const s = clientRequestSessions[chatId];
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TIMEOUT) {
    delete clientRequestSessions[chatId];
    return null;
  }
  return s;
}

/**
 * Hapus session clientrequest untuk chatId.
 * @param {string} chatId 
 */
export function clearSession(chatId) {
  delete clientRequestSessions[chatId];
}

// =======================
// END OF FILE
// =======================
