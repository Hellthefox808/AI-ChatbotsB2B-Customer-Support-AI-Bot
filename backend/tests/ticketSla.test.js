import test from 'node:test'
import assert from 'node:assert/strict'
import { ticketService } from '../src/service/ticketService.js'

test('TicketService: Triages critical emergencies into Sev 1 with 15-minute SLA', () => {
  const ticket = ticketService.createTicket({
    userId: 'user-123',
    userEmail: 'ops@company.com',
    subject: 'Production Server Outage',
    description: 'We are experiencing an emergency production down critical outage!'
  })

  assert.equal(ticket.severity, 'Sev 1')
  assert.equal(ticket.slaHours, 0.25)
  assert.equal(ticket.sentiment, 'urgent')
  assert.match(ticket.assignedTeam, /Emergency/)

  // Check SLA deadline is ~15 minutes in future
  const diffMs = new Date(ticket.slaDeadline).getTime() - new Date(ticket.createdAt).getTime()
  assert.equal(diffMs, 15 * 60 * 1000)
})

test('TicketService: Triages infrastructure issues into Sev 2 with 2-hour SLA', () => {
  const ticket = ticketService.createTicket({
    userId: 'user-456',
    userEmail: 'dev@company.com',
    subject: 'Cannot connect to VPN',
    description: 'The corporate VPN down and I cannot login from home.'
  })

  assert.equal(ticket.severity, 'Sev 2')
  assert.equal(ticket.slaHours, 2)
})

test('TicketService: Detects frustrated sentiment from aggressive customer feedback', () => {
  const ticket = ticketService.createTicket({
    userId: 'user-789',
    userEmail: 'sales@company.com',
    subject: 'System broken again',
    description: 'This is completely unacceptable and ridiculous, the software is broken again and I am furious!'
  })

  assert.equal(ticket.sentiment, 'frustrated')
})

test('TicketService: Support agent can resolve ticket with audit trail', () => {
  const ticket = ticketService.createTicket({
    userId: 'user-101',
    userEmail: 'emp@company.com',
    subject: 'Keyboard replacement',
    description: 'My spacebar is sticky.',
    requestedSeverity: 'Sev 4'
  })

  const resolved = ticketService.resolveTicket(ticket.id, {
    note: 'Shipped replacement mechanical keyboard via FedEx tracking #12345',
    updatedBy: 'agent@company.com',
    userRole: 'support_agent'
  })

  assert.equal(resolved.status, 'resolved')
  assert.ok(resolved.resolvedAt)
  assert.equal(resolved.timeline.length, 2)
  assert.equal(resolved.timeline[1].action, 'RESOLVED')
})
