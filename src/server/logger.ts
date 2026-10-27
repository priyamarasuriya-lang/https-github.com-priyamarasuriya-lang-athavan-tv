/** Minimal structured JSON logger (one line per event, stdout/stderr). */

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const l = (process.env.LOG_LEVEL as Level) ?? 'info';
  return order[l] ?? order.info;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < threshold() || process.env.VITEST_SILENT_LOGS) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...serialise(fields) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

function serialise(fields?: Record<string, unknown>) {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => emit('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit('error', msg, f),
};
