export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function emit(level: LogLevel, agent: string, msg: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, agent, msg, ...data });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export interface Logger {
  info:  (msg: string, data?: Record<string, unknown>) => void;
  warn:  (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
  debug: (msg: string, data?: Record<string, unknown>) => void;
}

export function createLogger(agent: string): Logger {
  return {
    info:  (msg, data) => emit('info',  agent, msg, data),
    warn:  (msg, data) => emit('warn',  agent, msg, data),
    error: (msg, data) => emit('error', agent, msg, data),
    debug: (msg, data) => emit('debug', agent, msg, data),
  };
}
