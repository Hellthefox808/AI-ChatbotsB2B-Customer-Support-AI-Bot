import test from 'node:test'
import assert from 'node:assert/strict'
import { AppError, asyncHandler, errorHandler } from '../src/utils/errors.js'
import { logger } from '../src/utils/logger.js'
import { validate } from '../src/utils/validation.js'
import { config } from '../src/config.js'

// ============================================
// AppError Class Tests
// ============================================
test('AppError: Creates error with default statusCode 500', () => {
  const err = new AppError('Server error')
  assert.equal(err.message, 'Server error')
  assert.equal(err.statusCode, 500)
  assert.equal(err.isOperational, true)
  assert.ok(err.stack)
  assert.ok(err instanceof Error)
})

test('AppError: Creates error with custom statusCode and isOperational flag', () => {
  const err = new AppError('Bad request', 400, false)
  assert.equal(err.message, 'Bad request')
  assert.equal(err.statusCode, 400)
  assert.equal(err.isOperational, false)
})

test('AppError: Creates error with statusCode 404', () => {
  const err = new AppError('Not found', 404)
  assert.equal(err.statusCode, 404)
})

test('AppError: Creates error with statusCode 403', () => {
  const err = new AppError('Forbidden', 403)
  assert.equal(err.statusCode, 403)
})

test('AppError: Creates error with statusCode 401', () => {
  const err = new AppError('Unauthorized', 401)
  assert.equal(err.statusCode, 401)
})

test('AppError: Error.captureStackTrace is called', () => {
  const err = new AppError('Test error')
  assert.ok(err.stack)
  assert.ok(err.stack.includes('Test error'))
})

// ============================================
// asyncHandler Tests
// ============================================
test('asyncHandler: Returns a function that wraps async route handlers', () => {
  const mockFn = async (req, res, next) => {
    res.json({ status: 'success' })
  }
  const handler = asyncHandler(mockFn)
  assert.equal(typeof handler, 'function')
})

test('asyncHandler: Calls next() with error when async function throws', async () => {
  const mockFn = async () => {
    throw new Error('Async error')
  }
  const handler = asyncHandler(mockFn)

  const req = {}
  const res = {}
  let nextCalledWith = null
  const next = (err) => { nextCalledWith = err }

  await handler(req, res, next)
  assert.ok(nextCalledWith)
  assert.equal(nextCalledWith.message, 'Async error')
})

test('asyncHandler: Catches sync throws and forwards them to next()', async () => {
  const mockFn = () => {
    throw new Error('Sync error')
  }
  const handler = asyncHandler(mockFn)

  const req = {}
  const res = {}
  let nextErr = null
  await handler(req, res, (err) => { nextErr = err })
  assert.ok(nextErr)
  assert.equal(nextErr.message, 'Sync error')
})

// ============================================
// errorHandler Tests
// ============================================
test('errorHandler: Responds with error status code and message', () => {
  const err = new AppError('Test error', 400)
  const req = {}
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.equal(obj.error, 'Test error')
          assert.equal(obj.status, 'fail')
        }
      }
    }
  }
  const next = () => {}
  errorHandler(err, req, res, next)
})

test('errorHandler: Responds with 500 for errors without statusCode', () => {
  const err = new Error('Generic error')
  const req = {}
  const res = {
    status: (code) => {
      assert.equal(code, 500)
      return {
        json: (obj) => {
          assert.equal(obj.error, 'Generic error')
          assert.equal(obj.status, 'error')
        }
      }
    }
  }
  const next = () => {}
  errorHandler(err, req, res, next)
})

test('errorHandler: Includes stack trace in development mode', () => {
  const origEnv = config.nodeEnv
  config.nodeEnv = 'development'
  const err = new AppError('Dev error', 500)
  const req = {}
  const res = {
    status: (code) => {
      return {
        json: (obj) => {
          assert.ok(obj.stack)
          assert.ok(obj.stack.includes('Error'))
        }
      }
    }
  }
  const next = () => {}
  errorHandler(err, req, res, next)
  config.nodeEnv = origEnv
})

test('errorHandler: Does not include stack trace in production mode', () => {
  const origEnv = config.nodeEnv
  config.nodeEnv = 'production'
  const err = new AppError('Prod error', 500)
  const req = {}
  const res = {
    status: (code) => {
      return {
        json: (obj) => {
          assert.ok(!obj.stack)
        }
      }
    }
  }
  const next = () => {}
  errorHandler(err, req, res, next)
  config.nodeEnv = origEnv
})

test('errorHandler: Uses default message for errors without message', () => {
  const err = new Error()
  err.message = ''
  const req = {}
  const res = {
    status: (code) => {
      return {
        json: (obj) => {
          assert.equal(obj.error, 'Internal Server Error')
        }
      }
    }
  }
  const next = () => {}
  errorHandler(err, req, res, next)
})

// ============================================
// Logger Tests
// ============================================
test('logger: info method logs JSON with level info', () => {
  const origLog = console.log
  let loggedOutput = null
  console.log = (msg) => { loggedOutput = msg }

  logger.info('Test info message', { key: 'value' })
  const parsed = JSON.parse(loggedOutput)
  assert.equal(parsed.level, 'info')
  assert.equal(parsed.message, 'Test info message')
  assert.equal(parsed.key, 'value')
  assert.ok(parsed.timestamp)

  console.log = origLog
})

test('logger: warn method logs JSON with level warn', () => {
  const origWarn = console.warn
  let loggedOutput = null
  console.warn = (msg) => { loggedOutput = msg }

  logger.warn('Test warn message', { key: 'value' })
  const parsed = JSON.parse(loggedOutput)
  assert.equal(parsed.level, 'warn')
  assert.equal(parsed.message, 'Test warn message')
  assert.equal(parsed.key, 'value')

  console.warn = origWarn
})

test('logger: error method logs JSON with level error', () => {
  const origError = console.error
  let loggedOutput = null
  console.error = (msg) => { loggedOutput = msg }

  logger.error('Test error message', { key: 'value' })
  const parsed = JSON.parse(loggedOutput)
  assert.equal(parsed.level, 'error')
  assert.equal(parsed.message, 'Test error message')
  assert.equal(parsed.key, 'value')

  console.error = origError
})

test('logger: audit method logs JSON with level audit and actor', () => {
  const origLog = console.log
  let loggedOutput = null
  console.log = (msg) => { loggedOutput = msg }

  logger.audit('test.action', 'user-123', { detail: 'test' })
  const parsed = JSON.parse(loggedOutput)
  assert.equal(parsed.level, 'audit')
  assert.equal(parsed.action, 'test.action')
  assert.equal(parsed.actor, 'user-123')
  assert.equal(parsed.detail, 'test')
  assert.ok(parsed.timestamp)

  console.log = origLog
})

test('logger: audit method defaults actor to system', () => {
  const origLog = console.log
  let loggedOutput = null
  console.log = (msg) => { loggedOutput = msg }

  logger.audit('test.action')
  const parsed = JSON.parse(loggedOutput)
  assert.equal(parsed.actor, 'system')

  console.log = origLog
})

// ============================================
// validate Middleware Tests
// ============================================
test('validate: Calls next() when all required fields are present', () => {
  const rules = {
    email: { required: true, type: 'string' },
    name: { required: true, type: 'string' }
  }
  const middleware = validate(rules)
  const req = { body: { email: 'test@test.com', name: 'Test User' } }
  const res = {
    status: () => ({ json: () => {} }),
    json: () => {}
  }
  let nextCalled = false
  const next = () => { nextCalled = true }

  middleware(req, res, next)
  assert.ok(nextCalled)
})

test('validate: Returns 400 when required field is missing', () => {
  const rules = {
    email: { required: true, type: 'string' }
  }
  const middleware = validate(rules)
  const req = { body: {} }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.equal(obj.error, 'Validation failed')
          assert.equal(obj.status, 'fail')
          assert.ok(obj.details.length > 0)
          assert.equal(obj.details[0].field, 'email')
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})

test('validate: Returns 400 when field has wrong type', () => {
  const rules = {
    age: { required: true, type: 'number' }
  }
  const middleware = validate(rules)
  const req = { body: { age: 'not-a-number' } }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.ok(obj.details.some((d) => d.field === 'age'))
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})

test('validate: Returns 400 when field is below minLength', () => {
  const rules = {
    password: { required: true, type: 'string', minLength: 8 }
  }
  const middleware = validate(rules)
  const req = { body: { password: 'short' } }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.ok(obj.details.some((d) => d.field === 'password'))
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})

test('validate: Returns 400 when custom validator fails', () => {
  const rules = {
    email: {
      required: true,
      type: 'string',
      validator: (val) => val.includes('@'),
      message: 'Invalid email format'
    }
  }
  const middleware = validate(rules)
  const req = { body: { email: 'invalid-email' } }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.ok(obj.details.some((d) => d.message === 'Invalid email format'))
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})

test('validate: Handles function-style rules', () => {
  const rules = (body) => {
    if (!body.customField) return 'customField is required'
    return null
  }
  const middleware = validate(rules)
  const req = { body: {} }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.equal(obj.error, 'Validation failed')
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})

test('validate: Function-style rules pass validation when no error returned', () => {
  const rules = (body) => {
    if (!body.customField) return 'customField is required'
    return null
  }
  const middleware = validate(rules)
  const req = { body: { customField: 'present' } }
  const res = {}
  let nextCalled = false
  const next = () => { nextCalled = true }

  middleware(req, res, next)
  assert.ok(nextCalled)
})

test('validate: Handles object rules with validate method (Joi-style)', () => {
  const rules = {
    validate: (body, options) => {
      const error = { details: [] }
      if (!body.username) {
        error.details.push({ path: ['username'], message: 'Username is required' })
      }
      return error
    }
  }
  const middleware = validate(rules)
  const req = { body: {} }
  const res = {
    status: (code) => {
      assert.equal(code, 400)
      return {
        json: (obj) => {
          assert.ok(obj.details.length > 0)
        }
      }
    }
  }
  const next = () => {}

  middleware(req, res, next)
})
