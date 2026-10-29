import { documentRepository } from '../data/documentRepository.js'
import { ticketRepository } from '../data/ticketRepository.js'
import { ticketService } from '../service/ticketService.js'

// Mock live enterprise system health status
const SYSTEM_HEALTH_REGISTRY = {
  vpn: { status: 'OPERATIONAL', latencyMs: 24, uptime: '99.98%', region: 'US-East & EU-West' },
  sso: { status: 'OPERATIONAL', latencyMs: 18, uptime: '99.99%', region: 'Global Auth Gateway' },
  workday: { status: 'OPERATIONAL', latencyMs: 45, uptime: '99.95%', region: 'HR Cloud' },
  concur: { status: 'DEGRADED', latencyMs: 310, uptime: '98.50%', note: 'Scheduled maintenance on receipt uploads', region: 'Finance ERP' },
  email: { status: 'OPERATIONAL', latencyMs: 15, uptime: '100%', region: 'Google Workspace' },
  cloud: { status: 'OPERATIONAL', latencyMs: 12, uptime: '99.99%', region: 'AWS / GCP Multi-region' }
}

export const TOOLS_SCHEMA = [
  {
    name: 'search_knowledge_base',
    description: 'Searches internal corporate policies, IT manuals, security standards, and HR guides.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or keywords to locate within corporate documentation.'
        },
        category: {
          type: 'string',
          description: 'Optional category filter: it, hr, security, finance.',
          enum: ['it', 'hr', 'security', 'finance', 'all']
        }
      },
      required: ['query']
    }
  },
  {
    name: 'check_ticket_status',
    description: 'Retrieves real-time status, severity, SLA deadline, and audit timeline for a specific support ticket.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID (e.g., ticket-xxxx-xxxx).'
        }
      },
      required: ['ticketId']
    }
  },
  {
    name: 'create_support_ticket',
    description: 'Opens a new IT, HR, or engineering support ticket with automated SLA triage and team assignment.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Brief, clear summary of the issue or request.'
        },
        description: {
          type: 'string',
          description: 'Detailed description including error messages, affected systems, and impact.'
        },
        severity: {
          type: 'string',
          description: 'Optional severity override: Sev 1, Sev 2, Sev 3, Sev 4. Defaults to auto-triage.',
          enum: ['Sev 1', 'Sev 2', 'Sev 3', 'Sev 4', 'Auto']
        }
      },
      required: ['subject', 'description']
    }
  },
  {
    name: 'check_system_status',
    description: 'Checks real-time operational status, latency, and uptime of internal enterprise platforms (VPN, SSO, Workday, Concur, Email, Cloud).',
    parameters: {
      type: 'object',
      properties: {
        serviceName: {
          type: 'string',
          description: 'Service identifier to inspect: vpn, sso, workday, concur, email, cloud, or all.',
          enum: ['vpn', 'sso', 'workday', 'concur', 'email', 'cloud', 'all']
        }
      },
      required: ['serviceName']
    }
  },
  {
    name: 'calculate_pto_balance',
    description: 'Calculates an employee accrued PTO balance, rollover days eligible, and remaining sick days.',
    parameters: {
      type: 'object',
      properties: {
        daysTaken: {
          type: 'number',
          description: 'Total PTO days taken so far in the current calendar year.'
        },
        monthsTenure: {
          type: 'number',
          description: 'Months employed at the company during the current calendar year (1-12).'
        }
      },
      required: ['daysTaken']
    }
  }
]

export class ToolRegistry {
  static getSchemas () {
    return TOOLS_SCHEMA
  }

  getSchemas () {
    return ToolRegistry.getSchemas()
  }

  static getGeminiFunctionDeclarations () {
    return TOOLS_SCHEMA.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }))
  }

  getGeminiFunctionDeclarations () {
    return ToolRegistry.getGeminiFunctionDeclarations()
  }

  static getOpenAIToolDefinitions () {
    return TOOLS_SCHEMA.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }))
  }

  getOpenAIToolDefinitions () {
    return ToolRegistry.getOpenAIToolDefinitions()
  }

  static getClaudeToolDefinitions () {
    return TOOLS_SCHEMA.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }))
  }

  getClaudeToolDefinitions () {
    return ToolRegistry.getClaudeToolDefinitions()
  }

  async executeTool (name, args, context = {}) {
    return ToolRegistry.executeTool(name, args, context)
  }

  static async executeTool (name, args, context = {}) {
    switch (name) {
      case 'search_knowledge_base': {
        const query = args.query || ''
        const category = args.category && args.category !== 'all' ? args.category.toLowerCase() : null
        let results = documentRepository.search(query)
        if (category) {
          results = results.filter((r) => r.document.category.toLowerCase() === category)
        }
        return {
          foundCount: results.length,
          results: results.slice(0, 3).map((r) => ({
            id: r.document.id,
            title: r.document.title,
            category: r.document.category,
            content: r.document.content,
            score: r.score
          }))
        }
      }

      case 'check_ticket_status': {
        const ticketId = (args.ticketId || '').trim()
        const ticket = ticketRepository.getTicketById(ticketId)
        if (!ticket) {
          return { error: `Ticket '${ticketId}' was not found in the support database.` }
        }
        if (
          context.userId &&
          ticket.userId !== context.userId &&
          context.role !== 'admin' &&
          context.role !== 'support_agent'
        ) {
          return { error: 'Not authorized to view this ticket.' }
        }
        return {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          severity: ticket.severity,
          slaHours: ticket.slaHours,
          slaDeadline: ticket.slaDeadline,
          sentiment: ticket.sentiment,
          assignedTeam: ticket.assignedTeam,
          timeline: ticket.timeline
        }
      }

      case 'create_support_ticket': {
        const userId = context.userId || 'anonymous-user'
        const userEmail = context.userEmail || 'employee@company.com'
        const requestedSeverity = args.severity && args.severity !== 'Auto' ? args.severity : null

        const ticket = ticketService.createTicket({
          userId,
          userEmail,
          subject: args.subject,
          description: args.description,
          requestedSeverity
        })

        return {
          success: true,
          ticketId: ticket.id,
          subject: ticket.subject,
          severity: ticket.severity,
          slaDeadline: ticket.slaDeadline,
          assignedTeam: ticket.assignedTeam,
          message: `Ticket ${ticket.id} created successfully with severity ${ticket.severity}. Expected response SLA is ${ticket.slaHours}h.`
        }
      }

      case 'check_system_status': {
        const serviceName = (args.serviceName || 'all').toLowerCase()
        if (serviceName === 'all') {
          return { systems: SYSTEM_HEALTH_REGISTRY, checkedAt: new Date().toISOString() }
        }
        const info = SYSTEM_HEALTH_REGISTRY[serviceName]
        if (!info) {
          return { error: `Unknown service '${serviceName}'. Supported: ${Object.keys(SYSTEM_HEALTH_REGISTRY).join(', ')}` }
        }
        return { service: serviceName, ...info, checkedAt: new Date().toISOString() }
      }

      case 'calculate_pto_balance': {
        const daysTaken = Math.max(Number(args.daysTaken) || 0, 0)
        const monthsTenure = Math.min(Math.max(Number(args.monthsTenure) || 12, 1), 12)
        const annualAccrual = 15
        const accruedSoFar = Number(((annualAccrual / 12) * monthsTenure).toFixed(1))
        const remaining = Number((accruedSoFar - daysTaken).toFixed(1))
        const rolloverEligible = Math.min(Math.max(remaining, 0), 5)

        return {
          annualEntitlement: annualAccrual,
          accruedToDate: accruedSoFar,
          daysTaken,
          remainingBalance: remaining,
          maxRolloverEligible: rolloverEligible,
          separateSickLeaveDays: 10,
          policy: 'PTO requests require 5 business days advance notice in Workday. Up to 5 days can be rolled over.'
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}

export const toolRegistry = new ToolRegistry()
