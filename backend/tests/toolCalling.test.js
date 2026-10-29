import test from 'node:test'
import assert from 'node:assert/strict'
import { toolRegistry } from '../src/integration/toolRegistry.js'
import { aiService } from '../src/integration/aiService.js'
import { ticketService } from '../src/service/ticketService.js'

test('ToolRegistry: Exposes valid Gemini and OpenAI schemas', () => {
  const geminiDecls = toolRegistry.getGeminiFunctionDeclarations()
  assert.ok(geminiDecls.length >= 5, 'Should have at least 5 declared tools')
  assert.ok(geminiDecls.some((t) => t.name === 'check_system_status'))
  assert.ok(geminiDecls.some((t) => t.name === 'check_ticket_status'))
  assert.ok(geminiDecls.some((t) => t.name === 'create_support_ticket'))

  const openAiTools = toolRegistry.getOpenAIToolDefinitions()
  assert.equal(openAiTools.length, geminiDecls.length)
  assert.equal(openAiTools[0].type, 'function')
})

test('ToolRegistry: Can execute search_knowledge_base tool', async () => {
  const output = await toolRegistry.executeTool('search_knowledge_base', {
    query: 'vpn anyconnect remote',
    category: 'it'
  })
  assert.ok(output.foundCount > 0)
  assert.equal(output.results[0].category, 'it')
})

test('ToolRegistry: Can execute check_system_status tool for VPN and all services', async () => {
  const vpnStatus = await toolRegistry.executeTool('check_system_status', { serviceName: 'vpn' })
  assert.equal(vpnStatus.service, 'vpn')
  assert.equal(vpnStatus.status, 'OPERATIONAL')
  assert.ok(vpnStatus.latencyMs > 0)

  const allStatus = await toolRegistry.executeTool('check_system_status', { serviceName: 'all' })
  assert.ok(allStatus.systems.sso)
  assert.ok(allStatus.systems.concur)
})

test('ToolRegistry: Can execute calculate_pto_balance tool', async () => {
  const pto = await toolRegistry.executeTool('calculate_pto_balance', {
    daysTaken: 4,
    monthsTenure: 12
  })
  assert.equal(pto.annualEntitlement, 15)
  assert.equal(pto.daysTaken, 4)
  assert.equal(pto.remainingBalance, 11)
  assert.equal(pto.maxRolloverEligible, 5)
})

test('AIService: Executes tool calling automatically in local hybrid mode for system status inquiries', async () => {
  const response = await aiService.generateAnswer('Is VPN down right now? Check system status', [])
  assert.equal(response.provider, 'local-tool-agent')
  assert.ok(response.toolCalls.length > 0)
  assert.equal(response.toolCalls[0].name, 'check_system_status')
  assert.match(response.answer, /OPERATIONAL/i)
})

test('AIService: Executes tool calling automatically when checking ticket status', async () => {
  // First create a ticket
  const ticket = ticketService.createTicket({
    userId: 'user-lookup',
    userEmail: 'dev@company.com',
    subject: 'API Gateway Timeout',
    description: 'Endpoints returning 504 errors on auth route',
    requestedSeverity: 'Sev 2'
  })

  // Ask AI bot to check status of this ticket
  const response = await aiService.generateAnswer(`What is the progress and status of ${ticket.id}?`, [])
  assert.equal(response.provider, 'local-tool-agent')
  assert.ok(response.toolCalls.length > 0)
  assert.equal(response.toolCalls[0].name, 'check_ticket_status')
  assert.match(response.answer, new RegExp(ticket.id, 'i'))
  assert.match(response.answer, /OPEN/i)
})

test('ToolRegistry: Can create a support ticket directly via tool execution', async () => {
  const result = await toolRegistry.executeTool('create_support_ticket', {
    subject: 'VPN DNS Resolution Failure',
    description: 'Internal hostnames not resolving over corporate tunnel',
    severity: 'Sev 2'
  }, { userId: 'tool-test-user', userEmail: 'agent@company.com' })

  assert.equal(result.success, true)
  assert.ok(result.ticketId)
  assert.equal(result.subject, 'VPN DNS Resolution Failure')
  assert.equal(result.severity, 'Sev 2')
  assert.equal(result.assignedTeam, 'Level 2 Technical Support')
})

test('ToolRegistry: Enforces IDOR security - prevents unauthorized users from inspecting tickets', async () => {
  const ticket = ticketService.createTicket({
    userId: 'confidential-owner-1',
    userEmail: 'owner@company.com',
    subject: 'Executive Compensation Inquiry',
    description: 'Discrepancy in Q3 equity vesting',
    requestedSeverity: 'Sev 3'
  })

  // 1. Unauthorized employee attempt -> Rejected
  const unauthorizedOutput = await toolRegistry.executeTool('check_ticket_status', {
    ticketId: ticket.id
  }, { userId: 'unauthorized-employee-2', role: 'employee' })

  assert.ok(unauthorizedOutput.error)
  assert.match(unauthorizedOutput.error, /not authorized/i)

  // 2. Ticket owner attempt -> Allowed
  const ownerOutput = await toolRegistry.executeTool('check_ticket_status', {
    ticketId: ticket.id
  }, { userId: 'confidential-owner-1', role: 'employee' })

  assert.equal(ownerOutput.id, ticket.id)
  assert.equal(ownerOutput.subject, 'Executive Compensation Inquiry')

  // 3. Support agent attempt -> Allowed
  const agentOutput = await toolRegistry.executeTool('check_ticket_status', {
    ticketId: ticket.id
  }, { userId: 'tier2-agent', role: 'support_agent' })

  assert.equal(agentOutput.id, ticket.id)
})
