import crypto from 'node:crypto'
import { dbManager } from './database.js'

export class TicketRepository {
  createTicket ({
    userId,
    userEmail,
    subject,
    description,
    severity = 'Sev 3',
    slaHours = 8,
    sentiment = 'neutral',
    assignedTeam = 'IT Helpdesk'
  }) {
    const id = `ticket-${crypto.randomUUID()}`
    const now = new Date()
    const deadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000)

    const timeline = [
      {
        timestamp: now.toISOString(),
        action: 'CREATED',
        note: `Ticket created with severity ${severity} (SLA target: ${slaHours}h)`
      }
    ]

    const ticket = {
      id,
      userId,
      userEmail,
      subject,
      description,
      severity,
      slaHours,
      slaDeadline: deadline.toISOString(),
      status: 'open',
      sentiment,
      assignedTeam,
      timeline,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    dbManager.run(
      `INSERT INTO tickets (
        id, user_id, user_email, subject, description, severity, sla_hours,
        sla_deadline, status, sentiment, assigned_team, timeline_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      userId,
      userEmail,
      subject,
      description,
      severity,
      slaHours,
      ticket.slaDeadline,
      ticket.status,
      ticket.sentiment,
      ticket.assignedTeam,
      JSON.stringify(timeline),
      ticket.createdAt,
      ticket.updatedAt
    )

    return ticket
  }

  getTicketById (id) {
    if (!id) return null
    const row = dbManager.queryOne(
      `SELECT
        id, user_id as userId, user_email as userEmail, subject, description,
        severity, sla_hours as slaHours, sla_deadline as slaDeadline,
        status, sentiment, assigned_team as assignedTeam,
        timeline_json, resolved_at as resolvedAt,
        created_at as createdAt, updated_at as updatedAt
      FROM tickets WHERE id = ?;`,
      id
    )
    if (!row) return null

    let timeline = []
    try {
      timeline = JSON.parse(row.timeline_json || '[]')
    } catch {
      timeline = []
    }

    return {
      ...row,
      timeline
    }
  }

  listTickets ({ userId, role } = {}) {
    let rows = []
    if (role === 'admin' || role === 'support_agent') {
      rows = dbManager.queryAll(
        `SELECT
          id, user_id as userId, user_email as userEmail, subject, description,
          severity, sla_hours as slaHours, sla_deadline as slaDeadline,
          status, sentiment, assigned_team as assignedTeam,
          timeline_json, resolved_at as resolvedAt,
          created_at as createdAt, updated_at as updatedAt
        FROM tickets ORDER BY datetime(created_at) DESC;`
      )
    } else {
      rows = dbManager.queryAll(
        `SELECT
          id, user_id as userId, user_email as userEmail, subject, description,
          severity, sla_hours as slaHours, sla_deadline as slaDeadline,
          status, sentiment, assigned_team as assignedTeam,
          timeline_json, resolved_at as resolvedAt,
          created_at as createdAt, updated_at as updatedAt
        FROM tickets WHERE user_id = ? ORDER BY datetime(created_at) DESC;`,
        userId
      )
    }

    return rows.map((r) => {
      let timeline = []
      try {
        timeline = JSON.parse(r.timeline_json || '[]')
      } catch {
        timeline = []
      }
      return {
        ...r,
        timeline
      }
    })
  }

  updateTicketStatus (id, { status, note, updatedBy }) {
    const ticket = this.getTicketById(id)
    if (!ticket) return null

    const now = new Date().toISOString()
    const updatedTimeline = [
      ...ticket.timeline,
      {
        timestamp: now,
        action: status.toUpperCase(),
        note: note || `Ticket status updated to ${status} by ${updatedBy}`
      }
    ]

    const resolvedAt = status === 'resolved' ? now : ticket.resolvedAt || null

    dbManager.run(
      `UPDATE tickets
       SET status = ?, timeline_json = ?, resolved_at = ?, updated_at = ?
       WHERE id = ?;`,
      status,
      JSON.stringify(updatedTimeline),
      resolvedAt,
      now,
      id
    )

    return this.getTicketById(id)
  }

  clear () {
    dbManager.run('DELETE FROM tickets;')
  }
}

export const ticketRepository = new TicketRepository()
