import axios from 'axios';

const baseURL = process.env.WA_SERVICE_URL || 'http://localhost:3001';

export async function sendMessage(to, message, options = {}) {
  try {
    await axios.post(`${baseURL}/send`, { to, message, options });
  } catch (err) {
    console.warn(`[WA API] Failed to send message to ${to}: ${err.message}`);
  }
}

export async function sendReport(message, chatIds = null) {
  try {
    await axios.post(`${baseURL}/broadcast`, { message, chatIds });
  } catch (err) {
    console.warn(`[WA API] Failed to broadcast message: ${err.message}`);
  }
}
