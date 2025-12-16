export const MESSAGE_THROTTLE_MS = 2000;

export async function delayAfterSend() {
  await new Promise((resolve) => setTimeout(resolve, MESSAGE_THROTTLE_MS));
}
