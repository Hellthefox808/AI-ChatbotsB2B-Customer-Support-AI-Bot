import test from 'node:test'
import assert from 'node:assert/strict'
import { authService } from '../src/service/authService.js'

test('AuthService: Seed employee can login with valid credentials', async () => {
  const result = await authService.login({
    email: 'employee@company.com',
    password: 'password123'
  })

  assert.ok(result.token, 'Token should be returned')
  assert.equal(result.user.email, 'employee@company.com')
  assert.equal(result.user.role, 'employee')

  // Verify token
  const payload = authService.verifyToken(result.token)
  assert.equal(payload.email, 'employee@company.com')
})

test('AuthService: Login rejects invalid password', async () => {
  await assert.rejects(
    async () => {
      await authService.login({
        email: 'employee@company.com',
        password: 'wrong-password'
      })
    },
    (err) => {
      assert.equal(err.statusCode, 401)
      assert.match(err.message, /invalid credentials/i)
      return true
    }
  )
})

test('AuthService: Can register new user and hash password securely', async () => {
  const user = await authService.register({
    email: 'newhire@company.com',
    password: 'SecurePassword!99',
    name: 'Alex Rivera',
    role: 'employee'
  })

  assert.equal(user.email, 'newhire@company.com')
  assert.equal(user.name, 'Alex Rivera')
  assert.ok(user.id)

  // Can log in with new user
  const loginResult = await authService.login({
    email: 'newhire@company.com',
    password: 'SecurePassword!99'
  })
  assert.ok(loginResult.token)
})

test('AuthService: Self-registration rejects elevated roles (privilege escalation)', async () => {
  await assert.rejects(
    async () => {
      await authService.register({
        email: 'escalator@company.com',
        password: 'SecurePassword!99',
        name: 'Escalator User',
        role: 'admin'
      })
    },
    (err) => {
      assert.equal(err.statusCode, 400)
      assert.match(err.message, /self-registration is limited to the employee role/i)
      return true
    }
  )
})

test('AuthService: Rejects duplicate email registration', async () => {
  await assert.rejects(
    async () => {
      await authService.register({
        email: 'newhire@company.com',
        password: 'AnotherPassword123',
        name: 'Alex Duplicate'
      })
    },
    (err) => {
      assert.equal(err.statusCode, 409)
      assert.match(err.message, /already registered/i)
      return true
    }
  )
})
