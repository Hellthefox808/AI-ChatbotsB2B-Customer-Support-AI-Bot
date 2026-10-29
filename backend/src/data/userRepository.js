import { dbManager } from './database.js'

export class UserRepository {
  findByEmail (email) {
    if (!email) return null
    const row = dbManager.queryOne(
      'SELECT id, email, password_hash as passwordHash, name, role, created_at as createdAt FROM users WHERE LOWER(email) = LOWER(?);',
      email.trim()
    )
    return row || null
  }

  findById (id) {
    if (!id) return null
    const row = dbManager.queryOne(
      'SELECT id, email, password_hash as passwordHash, name, role, created_at as createdAt FROM users WHERE id = ?;',
      id
    )
    return row || null
  }

  create ({ id, email, passwordHash, name, role = 'employee', createdAt }) {
    const now = createdAt || new Date().toISOString()
    dbManager.run(
      'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?);',
      id,
      email.trim().toLowerCase(),
      passwordHash,
      name,
      role,
      now
    )
    return { id, email: email.trim().toLowerCase(), passwordHash, name, role, createdAt: now }
  }

  listUsers () {
    return dbManager.queryAll(
      'SELECT id, email, name, role, created_at as createdAt FROM users ORDER BY created_at ASC;'
    )
  }

  clear () {
    dbManager.run('DELETE FROM users;')
    dbManager.seedDefaults()
  }
}

export const userRepository = new UserRepository()
