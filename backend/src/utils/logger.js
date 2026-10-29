export const logger = {
  info: (message, meta = {}) => {
    const entry = {
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    }
    console.log(JSON.stringify(entry))
  },
  warn: (message, meta = {}) => {
    const entry = {
      level: 'warn',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    }
    console.warn(JSON.stringify(entry))
  },
  error: (message, meta = {}) => {
    const entry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    }
    console.error(JSON.stringify(entry))
  },
  audit: (action, actor, meta = {}) => {
    const entry = {
      level: 'audit',
      timestamp: new Date().toISOString(),
      action,
      actor: actor || 'system',
      ...meta
    }
    console.log(JSON.stringify(entry))
  }
}
