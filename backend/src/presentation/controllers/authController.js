import { authService } from '../../service/authService.js'
import { asyncHandler, AppError } from '../../utils/errors.js'

export const register = asyncHandler(async (req, res) => {
  const { email, password, name, role } = req.body
  if (!email || !password || !name) {
    throw new AppError('Email, password, and name are required', 400)
  }
  const user = await authService.register({ email, password, name, role })
  res.status(201).json({ status: 'success', data: { user } })
})

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    throw new AppError('Email and password are required', 400)
  }
  const result = await authService.login({ email, password })
  res.status(200).json({ status: 'success', data: result })
})

export const me = asyncHandler(async (req, res) => {
  const user = authService.getUser(req.user.id)
  if (!user) {
    throw new AppError('User not found', 404)
  }
  res.status(200).json({ status: 'success', data: { user } })
})

export const listUsers = asyncHandler(async (req, res) => {
  const users = authService.listUsers()
  res.status(200).json({ status: 'success', data: { users } })
})
