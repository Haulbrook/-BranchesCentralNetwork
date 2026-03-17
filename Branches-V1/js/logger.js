/**
 * Structured Logger — all output goes through tagged Logger calls.
 * In production (no ?debug), only Logger.error() produces output.
 */
class Logger {
  static debug(tag, ...args) { if (window.DR_DEBUG) console.debug(`[${tag}]`, ...args); }
  static info(tag, ...args)  { if (window.DR_DEBUG) console.log(`[${tag}]`, ...args); }
  static warn(tag, ...args)  { if (window.DR_DEBUG) console.warn(`[${tag}]`, ...args); }
  static error(tag, ...args) { console.error(`[${tag}]`, ...args); } // ALWAYS logs
}
window.Logger = Logger;
