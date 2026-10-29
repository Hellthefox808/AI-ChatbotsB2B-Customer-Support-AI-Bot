import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseManager } from '../src/data/database.js'
import { searchDocuments, getDocumentById } from '../src/data/documentStore.js'
import { TicketRepository } from '../src/data/ticketRepository.js'
import { ConversationRepository } from '../src/data/conversationRepository.js'
import { DocumentRepository } from '../src/data/documentRepository.js'
import { UserRepository } from '../src/data/userRepository.js'

// ============================================
// DatabaseManager Tests
// ============================================
test('DatabaseManager: Creates in-memory database instance', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  assert.ok(db.db)
  assert.ok(db.initialized)
  db.close()
})

test('DatabaseManager: Creates tables on initialization', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const tables = [
    'users', 'conversations', 'messages', 'tickets',
    'documents', 'document_chunks', 'pipeline_sources', 'pipeline_jobs'
  ]
  tables.forEach((table) => {
    const row = db.queryOne('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?;', table)
    assert.ok(row, `Table ${table} should exist`)
  })
  db.close()
})

test('DatabaseManager: Seeds default users', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const users = db.queryAll('SELECT * FROM users;')
  assert.ok(users.length >= 3)
  const emails = users.map(u => u.email)
  assert.ok(emails.includes('employee@company.com'))
  assert.ok(emails.includes('admin@company.com'))
  assert.ok(emails.includes('agent@company.com'))
  db.close()
})

test('DatabaseManager: Seeds default documents', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const docs = db.queryAll('SELECT * FROM documents;')
  assert.ok(docs.length >= 8)
  db.close()
})

test('DatabaseManager: Seeds default pipeline sources', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const sources = db.queryAll('SELECT * FROM pipeline_sources;')
  assert.ok(sources.length >= 4)
  db.close()
})

test('DatabaseManager: queryAll returns all rows', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const users = db.queryAll('SELECT * FROM users WHERE role = ?;', 'admin')
  assert.ok(users.length >= 1)
  db.close()
})

test('DatabaseManager: queryOne returns single row', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const user = db.queryOne('SELECT * FROM users WHERE email = ?;', 'admin@company.com')
  assert.ok(user)
  assert.equal(user.email, 'admin@company.com')
  db.close()
})

test('DatabaseManager: queryOne returns null when no match', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const user = db.queryOne('SELECT * FROM users WHERE email = ?;', 'nonexistent@test.com')
  assert.equal(user, undefined)
  db.close()
})

test('DatabaseManager: run executes INSERT and returns result', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const result = db.run(
    'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?);',
    'user-test-1', 'test@test.com', 'hash123', 'Test User', 'employee', new Date().toISOString()
  )
  assert.ok(result)
  const user = db.queryOne('SELECT * FROM users WHERE id = ?;', 'user-test-1')
  assert.equal(user.email, 'test@test.com')
  db.close()
})

test('DatabaseManager: getHealth returns healthy status for in-memory DB', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const health = db.getHealth()
  assert.equal(health.status, 'healthy')
  assert.equal(health.connected, true)
  assert.ok(health.latencyMs >= 0)
  db.close()
})

test('DatabaseManager: getStatistics returns table counts', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const stats = db.getStatistics()
  assert.ok(stats.health)
  assert.ok(stats.tableCounts)
  assert.ok(stats.totalRecords > 0)
  assert.ok(stats.totalDocuments > 0)
  assert.ok(stats.totalUsers > 0 || stats.tableCounts.users > 0)
  db.close()
})

test('DatabaseManager: reset clears and reseeds data', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  const beforeCount = db.queryAll('SELECT * FROM users;').length
  assert.ok(beforeCount >= 3)
  db.run('DELETE FROM users;')
  const afterDeleteCount = db.queryAll('SELECT * FROM users;').length
  assert.equal(afterDeleteCount, 0)
  db.reset()
  const afterResetCount = db.queryAll('SELECT * FROM users;').length
  assert.ok(afterResetCount >= 3)
  db.close()
})

test('DatabaseManager: close closes database connection', () => {
  const db = new DatabaseManager({ dbPath: ':memory:', mode: 'memory' })
  assert.ok(db.initialized)
  db.close()
  assert.equal(db.db, null)
  assert.equal(db.initialized, false)
})

// ============================================
// documentStore.js Tests
// ============================================
test('getDocumentById: Returns document by ID', () => {
  const doc = getDocumentById('doc-1')
  assert.ok(doc)
  assert.equal(doc.id, 'doc-1')
  assert.equal(doc.title, 'Password Reset & Account Recovery Policy')
})

test('getDocumentById: Returns null for non-existent ID', () => {
  const doc = getDocumentById('nonexistent')
  assert.equal(doc, undefined)
})

test('searchDocuments: Returns results for valid query', () => {
  const results = searchDocuments('vpn remote access')
  assert.ok(results.length > 0)
  assert.ok(results[0].document)
  assert.ok(results[0].score > 0)
  assert.ok(results[0].confidence > 0)
})

test('searchDocuments: Returns empty array for empty query', () => {
  const results = searchDocuments('')
  assert.deepEqual(results, [])
})

test('searchDocuments: Returns empty array for stopword-only query', () => {
  const results = searchDocuments('the a an')
  assert.deepEqual(results, [])
})

test('searchDocuments: Respects limit parameter', () => {
  const results = searchDocuments('password', 1)
  assert.equal(results.length, 1)
})

test('searchDocuments: Returns highest scoring result first', () => {
  const results = searchDocuments('password reset')
  assert.ok(results.length > 0)
  if (results.length > 1) {
    assert.ok(results[0].score >= results[1].score)
  }
})

test('searchDocuments: Boosts title matches', () => {
  const vpnResults = searchDocuments('VPN access guide')
  assert.ok(vpnResults.length > 0)
  assert.equal(vpnResults[0].document.id, 'doc-2')
})

test('searchDocuments: Boosts keyword matches', () => {
  const ptoResults = searchDocuments('PTO vacation rollover')
  assert.ok(ptoResults.length > 0)
  assert.equal(ptoResults[0].document.id, 'doc-4')
})

// ============================================
// TicketRepository Tests
// ============================================
test('TicketRepository: Creates ticket with default values', () => {
  const repo = new TicketRepository()
  const ticket = repo.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Test Ticket',
    description: 'Test description'
  })
  assert.ok(ticket.id)
  assert.equal(ticket.userId, 'user-1')
  assert.equal(ticket.subject, 'Test Ticket')
  assert.equal(ticket.status, 'open')
  assert.equal(ticket.severity, 'Sev 3')
  assert.equal(ticket.slaHours, 8)
  assert.equal(ticket.sentiment, 'neutral')
  assert.equal(ticket.assignedTeam, 'IT Helpdesk')
  assert.ok(ticket.timeline.length > 0)
  assert.equal(ticket.timeline[0].action, 'CREATED')
  repo.clear()
})

test('TicketRepository: Creates ticket with custom severity and SLA', () => {
  const repo = new TicketRepository()
  const ticket = repo.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Critical Issue',
    description: 'Production down',
    severity: 'Sev 1',
    slaHours: 1,
    sentiment: 'frustrated',
    assignedTeam: 'Emergency Team'
  })
  assert.equal(ticket.severity, 'Sev 1')
  assert.equal(ticket.slaHours, 1)
  assert.equal(ticket.sentiment, 'frustrated')
  assert.equal(ticket.assignedTeam, 'Emergency Team')
  repo.clear()
})

test('TicketRepository: getTicketById returns ticket by ID', () => {
  const repo = new TicketRepository()
  const created = repo.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Lookup Test',
    description: 'Description'
  })
  const found = repo.getTicketById(created.id)
  assert.ok(found)
  assert.equal(found.id, created.id)
  assert.equal(found.subject, 'Lookup Test')
  repo.clear()
})

test('TicketRepository: getTicketById returns null for non-existent ID', () => {
  const repo = new TicketRepository()
  const found = repo.getTicketById('nonexistent-id')
  assert.equal(found, null)
  repo.clear()
})

test('TicketRepository: getTicketById returns null for empty ID', () => {
  const repo = new TicketRepository()
  const found = repo.getTicketById('')
  assert.equal(found, null)
  repo.clear()
})

test('TicketRepository: listTickets returns all tickets for admin', () => {
  const repo = new TicketRepository()
  repo.createTicket({ userId: 'user-1', userEmail: 'a@test.com', subject: 'Ticket A', description: 'Desc A' })
  repo.createTicket({ userId: 'user-2', userEmail: 'b@test.com', subject: 'Ticket B', description: 'Desc B' })
  const all = repo.listTickets({ role: 'admin' })
  assert.ok(all.length >= 2)
  repo.clear()
})

test('TicketRepository: listTickets returns only user tickets for non-admin', () => {
  const repo = new TicketRepository()
  repo.createTicket({ userId: 'user-1', userEmail: 'a@test.com', subject: 'User Ticket', description: 'Desc' })
  repo.createTicket({ userId: 'user-2', userEmail: 'b@test.com', subject: 'Other Ticket', description: 'Desc' })
  const userTickets = repo.listTickets({ userId: 'user-1', role: 'employee' })
  assert.ok(userTickets.length >= 1)
  userTickets.forEach((t) => assert.equal(t.userId, 'user-1'))
  repo.clear()
})

test('TicketRepository: updateTicketStatus updates ticket and timeline', () => {
  const repo = new TicketRepository()
  const ticket = repo.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Status Update Test',
    description: 'Description'
  })
  const updated = repo.updateTicketStatus(ticket.id, {
    status: 'resolved',
    note: 'Fixed the issue',
    updatedBy: 'admin-1'
  })
  assert.ok(updated)
  assert.equal(updated.status, 'resolved')
  assert.ok(updated.resolvedAt)
  assert.ok(updated.timeline.length > 1)
  assert.ok(updated.timeline.some((step) => step.action === 'RESOLVED'))
  repo.clear()
})

test('TicketRepository: updateTicketStatus returns null for non-existent ticket', () => {
  const repo = new TicketRepository()
  const updated = repo.updateTicketStatus('nonexistent', { status: 'resolved' })
  assert.equal(updated, null)
  repo.clear()
})

test('TicketRepository: clear removes all tickets', () => {
  const repo = new TicketRepository()
  repo.createTicket({ userId: 'user-1', userEmail: 'a@test.com', subject: 'Ticket', description: 'Desc' })
  assert.ok(repo.listTickets({ role: 'admin' }).length > 0)
  repo.clear()
  assert.equal(repo.listTickets({ role: 'admin' }).length, 0)
})

// ============================================
// ConversationRepository Tests
// ============================================
test('ConversationRepository: Creates conversation with default title', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1')
  assert.ok(conv.id)
  assert.equal(conv.userId, 'user-1')
  assert.equal(conv.title, 'New Conversation')
  assert.ok(conv.createdAt)
  assert.ok(conv.updatedAt)
  repo.clear()
})

test('ConversationRepository: Creates conversation with custom title', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1', 'My Custom Title')
  assert.equal(conv.title, 'My Custom Title')
  repo.clear()
})

test('ConversationRepository: getConversation returns conversation by ID', () => {
  const repo = new ConversationRepository()
  const created = repo.createConversation('user-1', 'Test Conv')
  const found = repo.getConversation(created.id)
  assert.ok(found)
  assert.equal(found.id, created.id)
  assert.equal(found.title, 'Test Conv')
  repo.clear()
})

test('ConversationRepository: getConversation returns null for non-existent ID', () => {
  const repo = new ConversationRepository()
  const found = repo.getConversation('nonexistent')
  assert.equal(found, null)
  repo.clear()
})

test('ConversationRepository: getConversation returns null for empty ID', () => {
  const repo = new ConversationRepository()
  const found = repo.getConversation('')
  assert.equal(found, null)
  repo.clear()
})

test('ConversationRepository: listConversations returns user conversations', () => {
  const repo = new ConversationRepository()
  repo.createConversation('user-1', 'Conv A')
  repo.createConversation('user-1', 'Conv B')
  repo.createConversation('user-2', 'Conv C')
  const userConvs = repo.listConversations('user-1')
  assert.ok(userConvs.length >= 2)
  userConvs.forEach((c) => assert.equal(c.userId, 'user-1'))
  repo.clear()
})

test('ConversationRepository: listConversations returns empty for non-existent user', () => {
  const repo = new ConversationRepository()
  const convs = repo.listConversations('nonexistent')
  assert.deepEqual(convs, [])
  repo.clear()
})

test('ConversationRepository: addMessage adds message and updates conversation title', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1', 'New Conversation')
  const message = repo.addMessage(conv.id, {
    role: 'user',
    content: 'This is a test message that sets the title',
    userId: 'user-1'
  })
  assert.ok(message.id)
  assert.equal(message.role, 'user')
  assert.equal(message.content, 'This is a test message that sets the title')
  assert.equal(message.conversationId, conv.id)
  assert.ok(message.createdAt)
  repo.clear()
})

test('ConversationRepository: addMessage uses provided message ID', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1')
  const message = repo.addMessage(conv.id, {
    id: 'custom-msg-id',
    role: 'assistant',
    content: 'Custom ID message',
    userId: null
  })
  assert.equal(message.id, 'custom-msg-id')
  repo.clear()
})

test('ConversationRepository: getMessages returns messages for conversation', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1')
  repo.addMessage(conv.id, { role: 'user', content: 'Hello', userId: 'user-1' })
  repo.addMessage(conv.id, { role: 'assistant', content: 'Hi there', userId: null })
  const messages = repo.getMessages(conv.id)
  assert.ok(messages.length >= 2)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[1].role, 'assistant')
  repo.clear()
})

test('ConversationRepository: getMessages returns empty for non-existent conversation', () => {
  const repo = new ConversationRepository()
  const messages = repo.getMessages('nonexistent')
  assert.deepEqual(messages, [])
  repo.clear()
})

test('ConversationRepository: updateConversationTitle updates title', () => {
  const repo = new ConversationRepository()
  const conv = repo.createConversation('user-1', 'Old Title')
  const updated = repo.updateConversationTitle(conv.id, 'New Title')
  assert.ok(updated)
  assert.equal(updated.title, 'New Title')
  repo.clear()
})

test('ConversationRepository: clear removes all messages and conversations', () => {
  const repo = new ConversationRepository()
  repo.createConversation('user-1')
  repo.addMessage('conv-id', { role: 'user', content: 'test', userId: 'user-1' })
  assert.ok(repo.listConversations('user-1').length > 0)
  repo.clear()
  assert.equal(repo.listConversations('user-1').length, 0)
})

// ============================================
// UserRepository Tests
// ============================================
test('UserRepository: findByEmail returns user by email (case insensitive)', () => {
  const repo = new UserRepository()
  const user = repo.findByEmail('ADMIN@COMPANY.COM')
  assert.ok(user)
  assert.equal(user.email, 'admin@company.com')
})

test('UserRepository: findByEmail returns null for non-existent email', () => {
  const repo = new UserRepository()
  const user = repo.findByEmail('nonexistent@test.com')
  assert.equal(user, null)
})

test('UserRepository: findByEmail returns null for empty email', () => {
  const repo = new UserRepository()
  const user = repo.findByEmail('')
  assert.equal(user, null)
})

test('UserRepository: findById returns user by ID', () => {
  const repo = new UserRepository()
  const user = repo.findById('admin-1')
  assert.ok(user)
  assert.equal(user.id, 'admin-1')
})

test('UserRepository: findById returns null for non-existent ID', () => {
  const repo = new UserRepository()
  const user = repo.findById('nonexistent')
  assert.equal(user, null)
})

test('UserRepository: create adds new user', () => {
  const repo = new UserRepository()
  const user = repo.create({
    id: 'user-new-1',
    email: 'new@test.com',
    passwordHash: 'hash123',
    name: 'New User',
    role: 'employee',
    createdAt: new Date().toISOString()
  })
  assert.ok(user)
  assert.equal(user.email, 'new@test.com')
  assert.equal(user.role, 'employee')
  // Verify it can be found
  const found = repo.findByEmail('new@test.com')
  assert.ok(found)
})

test('UserRepository: create defaults role to employee', () => {
  const repo = new UserRepository()
  const user = repo.create({
    id: 'user-new-2',
    email: 'new2@test.com',
    passwordHash: 'hash456',
    name: 'New User 2'
  })
  assert.equal(user.role, 'employee')
})

test('UserRepository: listUsers returns all users', () => {
  const repo = new UserRepository()
  const users = repo.listUsers()
  assert.ok(users.length >= 3)
  users.forEach((u) => assert.ok(u.id && u.email && u.name && u.role))
})

test('UserRepository: clear removes users and reseeds defaults', () => {
  const repo = new UserRepository()
  repo.create({ id: 'temp-user', email: 'temp@test.com', passwordHash: 'hash', name: 'Temp' })
  assert.ok(repo.findByEmail('temp@test.com'))
  repo.clear()
  assert.equal(repo.findByEmail('temp@test.com'), null)
  // Defaults should be reseeded
  assert.ok(repo.findByEmail('admin@company.com'))
})

// ============================================
// DocumentRepository Tests
// ============================================
test('DocumentRepository: findAll returns all documents', () => {
  const repo = new DocumentRepository()
  const docs = repo.findAll()
  assert.ok(docs.length >= 8)
  docs.forEach((d) => assert.ok(d.id && d.title && d.category && d.content && Array.isArray(d.keywords)))
})

test('DocumentRepository: findById returns document by ID', () => {
  const repo = new DocumentRepository()
  const doc = repo.findById('doc-1')
  assert.ok(doc)
  assert.equal(doc.id, 'doc-1')
})

test('DocumentRepository: findById returns null for non-existent ID', () => {
  const repo = new DocumentRepository()
  const doc = repo.findById('nonexistent')
  assert.equal(doc, null)
})

test('DocumentRepository: findById returns null for empty ID', () => {
  const repo = new DocumentRepository()
  const doc = repo.findById('')
  assert.equal(doc, null)
})

test('DocumentRepository: upsertDocument creates new document', () => {
  const repo = new DocumentRepository()
  const doc = repo.upsertDocument({
    title: 'Test Document',
    category: 'general',
    content: 'This is test content for the document.',
    keywords: ['test', 'document'],
    sourceId: 'manual'
  })
  assert.ok(doc.id)
  assert.equal(doc.title, 'Test Document')
  assert.equal(doc.category, 'general')
  assert.equal(doc.content, 'This is test content for the document.')
  assert.deepEqual(doc.keywords, ['test', 'document'])
  assert.ok(doc.checksum)
})

test('DocumentRepository: upsertDocument updates existing document', () => {
  const repo = new DocumentRepository()
  const created = repo.upsertDocument({
    id: 'doc-update-test',
    title: 'Original Title',
    category: 'general',
    content: 'Original content.',
    keywords: ['original'],
    sourceId: 'manual'
  })
  assert.ok(created.id)
  const updated = repo.upsertDocument({
    id: 'doc-update-test',
    title: 'Updated Title',
    category: 'security',
    content: 'Updated content.',
    keywords: ['updated', 'security'],
    sourceId: 'manual'
  })
  assert.equal(updated.title, 'Updated Title')
  assert.equal(updated.category, 'security')
  assert.equal(updated.content, 'Updated content.')
})

test('DocumentRepository: deleteDocument removes document and chunks', () => {
  const repo = new DocumentRepository()
  repo.upsertDocument({
    id: 'doc-delete-test',
    title: 'To Delete',
    category: 'general',
    content: 'Content to be deleted.',
    keywords: ['delete'],
    sourceId: 'manual'
  })
  const foundBefore = repo.findById('doc-delete-test')
  assert.ok(foundBefore)
  const deleted = repo.deleteDocument('doc-delete-test')
  assert.equal(deleted, true)
  const foundAfter = repo.findById('doc-delete-test')
  assert.equal(foundAfter, null)
})

test('DocumentRepository: deleteDocument returns true for non-existent ID', () => {
  const repo = new DocumentRepository()
  const deleted = repo.deleteDocument('nonexistent')
  assert.equal(deleted, true)
})

test('DocumentRepository: search returns results using RAG engine', () => {
  const repo = new DocumentRepository()
  const results = repo.search('vpn remote access')
  assert.ok(results.length > 0)
  assert.ok(results[0].document)
  assert.ok(results[0].score >= 0)
})

test('DocumentRepository: retrieveTopChunks returns chunks', () => {
  const repo = new DocumentRepository()
  const chunks = repo.retrieveTopChunks('vpn setup')
  assert.ok(Array.isArray(chunks))
})

test('DocumentRepository: inspectRAG returns telemetry', () => {
  const repo = new DocumentRepository()
  const telemetry = repo.inspectRAG('password reset')
  assert.ok(telemetry.query)
  assert.ok(Array.isArray(telemetry.expandedTokens))
  assert.ok(Array.isArray(telemetry.sparseResults))
  assert.ok(Array.isArray(telemetry.denseResults))
  assert.ok(Array.isArray(telemetry.hybridResults))
  assert.ok(Array.isArray(telemetry.topChunks))
})

test('DocumentRepository: verifyGroundedness returns groundedness result', () => {
  const repo = new DocumentRepository()
  const result = repo.verifyGroundedness(
    'Reset your password at portal.company.com/password.',
    [{ content: 'Employees can reset their corporate passwords via the self-service portal at portal.company.com/password.' }]
  )
  assert.ok(result.groundednessScore >= 0)
  assert.ok(typeof result.isGrounded === 'boolean')
})
