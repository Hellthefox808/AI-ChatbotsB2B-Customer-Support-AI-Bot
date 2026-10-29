import { ticketRepository } from '../data/ticketRepository.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/errors.js'

export class TicketService {
  /**
   * Automatically triages and creates a customer support ticket with SLA parameters
   */
  createTicket ({ userId, userEmail, subject, description, requestedSeverity }) {
    if (!subject || !description) {
      throw new AppError('Subject and description are required to create a ticket', 400)
    }

    const { severity, slaHours, assignedTeam } = this.triageSla(description, requestedSeverity)
    const sentiment = this.analyzeSentiment(description)

    const ticket = ticketRepository.createTicket({
      userId,
      userEmail,
      subject: subject.trim(),
      description: description.trim(),
      severity,
      slaHours,
      sentiment,
      assignedTeam
    })

    logger.audit('ticket.created', userId, {
      ticketId: ticket.id,
      severity,
      slaDeadline: ticket.slaDeadline,
      sentiment
    })

    return ticket
  }

  /**
   * Automated triage according to enterprise support SLA matrices
   */
  triageSla (text, requestedSeverity) {
    if (requestedSeverity && ['Sev 1', 'Sev 2', 'Sev 3', 'Sev 4'].includes(requestedSeverity)) {
      const hoursMap = { 'Sev 1': 0.25, 'Sev 2': 2, 'Sev 3': 8, 'Sev 4': 24 }
      const teamMap = {
        'Sev 1': 'Critical Response Team',
        'Sev 2': 'Level 2 Technical Support',
        'Sev 3': 'Department Operations',
        'Sev 4': 'General Support Queue'
      }
      return {
        severity: requestedSeverity,
        slaHours: hoursMap[requestedSeverity],
        assignedTeam: teamMap[requestedSeverity]
      }
    }

    const lower = text.toLowerCase()

    // Sev 1: Critical outage / security breach / production failure
    if (/(emergency|critical outage|production down|data breach|system crash|9111)/.test(lower)) {
      return { severity: 'Sev 1', slaHours: 0.25, assignedTeam: 'Emergency Incident Response (24/7)' }
    }

    // Sev 2: High priority business disruption / multiple users
    if (/(vpn down|cannot login|authentication failure|urgent|payroll issue|service outage)/.test(lower)) {
      return { severity: 'Sev 2', slaHours: 2, assignedTeam: 'Tier 2 Infrastructure Support' }
    }

    // Sev 3: Medium operational tasks / individual blocker
    if (/(expense|reimbursement|pto error|laptop request|software license|concur)/.test(lower)) {
      return { severity: 'Sev 3', slaHours: 8, assignedTeam: 'Corporate Services & IT' }
    }

    // Sev 4: General inquiry / low impact
    return { severity: 'Sev 4', slaHours: 24, assignedTeam: 'Standard Helpdesk Queue' }
  }

  /**
   * Lightweight sentiment analysis
   */
  analyzeSentiment (text) {
    const lower = text.toLowerCase()
    if (/(furious|unacceptable|broken again|awful|ridiculous|disaster|angry|frustrated)/.test(lower)) {
      return 'frustrated'
    }
    if (/(asap|urgently|immediate|critical|blocked|right now)/.test(lower)) {
      return 'urgent'
    }
    if (/(thanks|great|appreciate|helpful|good)/.test(lower)) {
      return 'positive'
    }
    return 'neutral'
  }

  getTicket (id, userId, role) {
    const ticket = ticketRepository.getTicketById(id)
    if (!ticket) {
      throw new AppError('Ticket not found', 404)
    }
    if (ticket.userId !== userId && role !== 'admin' && role !== 'support_agent') {
      throw new AppError('Not authorized to view this ticket', 403)
    }
    return ticket
  }

  listTickets ({ userId, role }) {
    return ticketRepository.listTickets({ userId, role })
  }

  resolveTicket (id, { note, updatedBy, userRole }) {
    if (userRole !== 'admin' && userRole !== 'support_agent') {
      throw new AppError('Only support agents or administrators can resolve tickets', 403)
    }
    const ticket = ticketRepository.updateTicketStatus(id, {
      status: 'resolved',
      note,
      updatedBy
    })
    if (!ticket) {
      throw new AppError('Ticket not found', 404)
    }
    logger.audit('ticket.resolved', updatedBy, { ticketId: id })
    return ticket
  }
}

export const ticketService = new TicketService()
