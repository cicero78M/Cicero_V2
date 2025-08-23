const originalLog = console.log;

console.log = (...args) => {
  const timestamp = new Date().toISOString();
  originalLog(`[${timestamp}]`, ...args);
};
