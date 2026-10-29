import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { userRepository } from '../data/userRepository.js'

export class AuthService {
  async register ({ email, password, name, role = 'employee' }) {
    const normalizedEmail = email.trim().toLowerCase()
    const existing = userRepository.findByEmail(normalizedEmail)
    if (existing) {
      const err = new Error('Email already registered')
      err.statusCode = 409
      throw err
    }

    // Self-registration is limited to the employee role. Elevated roles
    // (support_agent / admin) must be assigned by an administrator to prevent
    // privilege escalation via self-registration.
    if (role && role !== 'employee') {
      const err = new Error('Self-registration is limited to the employee role')
      err.statusCode = 400
      throw err
    }

    const id = `user-${crypto.randomUUID()}`
    const passwordHash = await bcrypt.hash(password, 10)
    userRepository.create({
      id,
      email: normalizedEmail,
      passwordHash,
      role,
      name,
      createdAt: new Date().toISOString()
    })

    logger.audit('user.register', id, { email: normalizedEmail, role })
    return { id, email: normalizedEmail, role, name }
  }

  async login ({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase()
    const user = userRepository.findByEmail(normalizedEmail)
    if (!user) {
      const err = new Error('Invalid credentials')
      err.statusCode = 401
      throw err
    }

    const matches = await bcrypt.compare(password, user.passwordHash)
    if (!matches) {
      const err = new Error('Invalid credentials')
      err.statusCode = 401
      throw err
    }

    const token = this.signToken(user)
    logger.audit('user.login', user.id, { email: user.email })
    return { token, user: { id: user.id, email: user.email, role: user.role, name: user.name } }
  }

  signToken (user) {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    )
  }

  verifyToken (token) {
    try {
      return jwt.verify(token, config.jwtSecret)
    } catch {
      const error = new Error('Invalid or expired token')
      error.statusCode = 401
      throw error
    }
  }

  getUser (id) {
    const user = userRepository.findById(id)
    if (!user) return null
    return { id: user.id, email: user.email, role: user.role, name: user.name }
  }

  listUsers () {
    return userRepository.listUsers()
  }
}

export const authService = new AuthService()
