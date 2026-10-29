import { config } from '../config.js'

export class AppError extends Error {
  constructor (message, statusCode = 500, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next)
}

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const response = {
    error: err.message || 'Internal Server Error',
    status: statusCode >= 500 ? 'error' : 'fail'
  }

  if (config.nodeEnv === 'development' && err.stack) {
    response.stack = err.stack
  }

  res.status(statusCode).json(response)
}
