function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

export const Logger = {
  info(...args) {
    console.log(`[${timestamp()}] INFO `, ...args);
  },
  warn(...args) {
    console.warn(`[${timestamp()}] WARN `, ...args);
  },
  error(...args) {
    console.error(`[${timestamp()}] ERROR`, ...args);
  },
};
