import test from 'node:test'
import assert from 'node:assert/strict'
import { dbManager } from '../src/data/database.js'
import { userRepository } from '../src/data/userRepository.js'
import { ticketRepository } from '../src/data/ticketRepository.js'
import { conversationRepository } from '../src/data/conversationRepository.js'
import { documentRepository } from '../src/data/documentRepository.js'
import { pipelineService } from '../src/service/pipelineService.js'

test('DatabaseManager: Connects and verifies healthy SQLite engine with WAL', () => {
  const health = dbManager.getHealth()
  assert.equal(health.status, 'healthy')
  assert.equal(health.connected, true)
  assert.ok(health.engine.includes('SQLite'))
  assert.ok(health.latencyMs >= 0)
  assert.ok(health.databasePath)
})

test('DatabaseManager: Gathers complete statistics across all 8 tables', () => {
  const stats = dbManager.getStatistics()
  assert.ok(stats.totalRecords >= 10, 'Should have initial seeded records')
  assert.ok(stats.tableCounts.users >= 1, 'Should have users')
  assert.ok(stats.tableCounts.documents >= 7, 'Should have corporate documents')
  assert.ok(stats.tableCounts.pipeline_sources >= 4, 'Should have default pipeline sources')
  assert.equal(stats.health.connected, true)
})

test('Database Persistence: Users, Tickets, and Conversations persist and query reliably', () => {
  // 1. User
  const testEmail = `pipelinetest-${Date.now()}@company.com`
  const user = userRepository.create({
    id: `user-test-${Date.now()}`,
    email: testEmail,
    passwordHash: 'hash:secret',
    name: 'Pipeline Tester',
    role: 'employee'
  })
  assert.ok(user.id)
  const foundUser = userRepository.findByEmail(testEmail)
  assert.equal(foundUser.email, testEmail)

  // 2. Conversation & Message
  const conv = conversationRepository.createConversation(user.id, 'Test Conversation')
  assert.ok(conv.id)
  const msg = conversationRepository.addMessage(conv.id, {
    role: 'user',
    content: 'How do I submit an expense report?'
  })
  assert.ok(msg.id)
  const messages = conversationRepository.getMessages(conv.id)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].content, 'How do I submit an expense report?')

  // 3. Ticket with Timeline
  const ticket = ticketRepository.createTicket({
    userId: user.id,
    userEmail: testEmail,
    subject: 'Laptop screen flickering after update',
    description: 'Screen flashes black every 10 seconds on MacBook Pro',
    severity: 'Sev 3',
    slaHours: 8,
    assignedTeam: 'Hardware Support'
  })
  assert.ok(ticket.id)
  assert.equal(ticket.status, 'open')

  const resolved = ticketRepository.updateTicketStatus(ticket.id, {
    status: 'resolved',
    note: 'Replaced display cable and updated macOS graphics drivers',
    updatedBy: 'agent@company.com'
  })
  assert.equal(resolved.status, 'resolved')
  assert.ok(resolved.resolvedAt)
  assert.equal(resolved.timeline.length, 2)
})

test('PipelineService: Executes Corporate Policy Ingestion ETL Pipeline', async () => {
  const job = await pipelineService.runPipeline('corporate_docs_sync', 'automated-test')
  assert.ok(job.id)
  assert.equal(job.pipelineName, 'corporate_docs_sync')
  assert.equal(job.status, 'COMPLETED')
  assert.ok(job.totalItems >= 7)
  assert.ok(job.processedItems >= 7)
  assert.equal(job.failedItems, 0)
  assert.ok(job.durationMs >= 0)
})

test('PipelineService: Distills Resolved Support Tickets into Knowledge Base', async () => {
  // Create and resolve a unique ticket to distill
  const uniqueSubject = `Kubernetes Pod CrashLoopBackOff Node OOM ${Date.now()}`
  const ticket = ticketRepository.createTicket({
    userId: 'user-oom-test',
    userEmail: 'devops@company.com',
    subject: uniqueSubject,
    description: 'Payment microservice worker pod killed with Exit Code 137 OOMKilled.',
    severity: 'Sev 2',
    slaHours: 2,
    assignedTeam: 'Infrastructure & SRE'
  })

  ticketRepository.updateTicketStatus(ticket.id, {
    status: 'resolved',
    note: 'Increased container memory limits from 512Mi to 2Gi in Helm values.',
    updatedBy: 'sre-lead@company.com'
  })

  // Run knowledge distillation pipeline
  const job = await pipelineService.runPipeline('resolved_tickets_distillation', 'test-runner')
  assert.equal(job.status, 'COMPLETED')
  assert.ok(job.processedItems >= 1)

  // Verify the distilled document is searchable in RAG
  const searchResults = documentRepository.search('Kubernetes Pod CrashLoopBackOff OOM')
  assert.ok(searchResults.length > 0)
  const topMatch = searchResults[0]
  assert.ok(topMatch.document.title.includes(uniqueSubject) || topMatch.document.content.includes('CrashLoopBackOff'))
})

test('PipelineService: Ingests custom knowledge document and verifies instant RAG retrieval', () => {
  const customTitle = `Zero Trust Microsegmentation Architecture Policy ${Date.now()}`
  const customContent = 'All production database connections require mutual TLS (mTLS) with Istio Envoy sidecars. Direct cleartext database access is denied by policy.'

  const ingested = pipelineService.ingestDocument({
    title: customTitle,
    category: 'security',
    content: customContent,
    keywords: ['mtls', 'istio', 'envoy', 'database', 'microsegmentation']
  })

  assert.ok(ingested.id)
  assert.equal(ingested.title, customTitle)

  // Verify retrieval
  const searchResults = documentRepository.search('mTLS Istio Envoy sidecar database policy')
  assert.ok(searchResults.length > 0)
  assert.equal(searchResults[0].document.id, ingested.id)
})
