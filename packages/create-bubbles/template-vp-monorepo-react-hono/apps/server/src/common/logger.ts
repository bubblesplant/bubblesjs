type LogContext = Record<string, unknown>

function write(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  }

  const serialized = JSON.stringify(entry)

  if (level === 'error') {
    console.error(serialized)
    return
  }

  if (level === 'warn') {
    console.warn(serialized)
    return
  }

  console.info(serialized)
}

export const appLogger = {
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
}
