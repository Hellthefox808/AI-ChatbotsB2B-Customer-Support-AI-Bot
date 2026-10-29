import { ticketService } from '../../service/ticketService.js'
import { asyncHandler } from '../../utils/errors.js'

export const createTicket = asyncHandler(async (req, res) => {
  const { subject, description, severity } = req.body
  const userId = req.user.id
  const userEmail = req.user.email

  const ticket = ticketService.createTicket({
    userId,
    userEmail,
    subject,
    description,
    requestedSeverity: severity
  })

  res.status(201).json({
    status: 'success',
    data: { ticket }
  })
})

export const listTickets = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const role = req.user.role
  const tickets = ticketService.listTickets({ userId, role })
  res.status(200).json({
    status: 'success',
    data: { tickets }
  })
})

export const getTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params
  const userId = req.user.id
  const role = req.user.role
  const ticket = ticketService.getTicket(ticketId, userId, role)
  res.status(200).json({
    status: 'success',
    data: { ticket }
  })
})

export const resolveTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params
  const { note } = req.body
  const ticket = ticketService.resolveTicket(ticketId, {
    note,
    updatedBy: req.user.email,
    userRole: req.user.role
  })
  res.status(200).json({
    status: 'success',
    data: { ticket }
  })
})
