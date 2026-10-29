import jwt from 'jsonwebtoken'
import { config } from '../../config.js'

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid authorization header')
    err.statusCode = 401
    return next(err)
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    req.user = { id: decoded.sub, email: decoded.email, role: decoded.role }
    next()
  } catch (err) {
    const error = new Error('Invalid or expired token')
    error.statusCode = 401
    next(error)
  }
}

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    const err = new Error('Insufficient permissions')
    err.statusCode = 403
    return next(err)
  }
  next()
}
