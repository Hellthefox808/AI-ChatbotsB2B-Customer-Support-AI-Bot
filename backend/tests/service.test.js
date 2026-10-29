import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthService } from '../src/service/authService.js'
import { FineTuningService } from '../src/service/fineTuningService.js'
import { PipelineService } from '../src/service/pipelineService.js'
import { RAGEngine } from '../src/service/ragEngine.js'
import { TicketService } from '../src/service/ticketService.js'
import { DOCUMENTS } from '../src/data/documentStore.js'

// ============================================
// AuthService Tests
// ============================================
test('AuthService: Register creates new user and returns user data', async () => {
  // Use a unique email to avoid conflicts
  const authService = new AuthService()
  const result = await authService.register({
    email: 'newuser-reg@test.com',
    password: 'securePassword123',
    name: 'New Reg User',
    role: 'employee'
  })
  assert.ok(result.id)
  assert.equal(result.email, 'newuser-reg@test.com')
  assert.equal(result.role, 'employee')
  assert.equal(result.name, 'New Reg User')
})

test('AuthService: Register throws error for duplicate email', async () => {
  const authService = new AuthService()
  // First registration
  await authService.register({
    email: 'dup-reg@test.com',
    password: 'password123',
    name: 'Dup User'
  })
  // Second registration with same email should throw
  let threw = false
  try {
    await authService.register({
      email: 'dup-reg@test.com',
      password: 'password123',
      name: 'Dup User 2'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 409)
    assert.equal(err.message, 'Email already registered')
  }
  assert.ok(threw, 'Should have thrown for duplicate email')
})

test('AuthService: Register normalizes email to lowercase', async () => {
  const authService = new AuthService()
  const result = await authService.register({
    email: 'UPPERCASE@TEST.COM',
    password: 'password123',
    name: 'Upper User'
  })
  assert.equal(result.email, 'uppercase@test.com')
})

test('AuthService: Register trims email whitespace', async () => {
  const authService = new AuthService()
  const result = await authService.register({
    email: '  spaced@test.com  ',
    password: 'password123',
    name: 'Spaced User'
  })
  assert.equal(result.email, 'spaced@test.com')
})

test('AuthService: Register defaults role to employee', async () => {
  const authService = new AuthService()
  const result = await authService.register({
    email: 'default-role@test.com',
    password: 'password123',
    name: 'Default Role User'
  })
  assert.equal(result.role, 'employee')
})

test('AuthService: Login succeeds with correct credentials', async () => {
  const authService = new AuthService()
  await authService.register({
    email: 'login-test@test.com',
    password: 'correctPassword',
    name: 'Login User'
  })
  const result = await authService.login({
    email: 'login-test@test.com',
    password: 'correctPassword'
  })
  assert.ok(result.token)
  assert.ok(result.user)
  assert.equal(result.user.email, 'login-test@test.com')
  assert.equal(result.user.role, 'employee')
})

test('AuthService: Login is case-insensitive for email', async () => {
  const authService = new AuthService()
  await authService.register({
    email: 'CaseInsensitive@TEST.com',
    password: 'password123',
    name: 'Case User'
  })
  const result = await authService.login({
    email: 'caseinsensitive@test.com',
    password: 'password123'
  })
  assert.ok(result.token)
})

test('AuthService: Login throws error for non-existent user', async () => {
  const authService = new AuthService()
  let threw = false
  try {
    await authService.login({
      email: 'nonexistent@test.com',
      password: 'password123'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 401)
    assert.equal(err.message, 'Invalid credentials')
  }
  assert.ok(threw)
})

test('AuthService: Login throws error for wrong password', async () => {
  const authService = new AuthService()
  await authService.register({
    email: 'wrong-pass@test.com',
    password: 'correctPassword',
    name: 'Wrong Pass User'
  })
  let threw = false
  try {
    await authService.login({
      email: 'wrong-pass@test.com',
      password: 'wrongPassword'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 401)
  }
  assert.ok(threw)
})

test('AuthService: signToken generates JWT with user payload', () => {
  const authService = new AuthService()
  const token = authService.signToken({
    id: 'user-1',
    email: 'test@test.com',
    role: 'admin'
  })
  assert.ok(token)
  assert.equal(typeof token, 'string')
  // JWT should have 3 parts separated by dots
  const parts = token.split('.')
  assert.equal(parts.length, 3)
})

test('AuthService: verifyToken returns decoded payload for valid token', () => {
  const authService = new AuthService()
  const token = authService.signToken({
    id: 'user-1',
    email: 'test@test.com',
    role: 'admin'
  })
  const decoded = authService.verifyToken(token)
  assert.equal(decoded.sub, 'user-1')
  assert.equal(decoded.email, 'test@test.com')
  assert.equal(decoded.role, 'admin')
})

test('AuthService: verifyToken throws error for invalid token', () => {
  const authService = new AuthService()
  let threw = false
  try {
    authService.verifyToken('invalid.token.string')
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 401)
    assert.equal(err.message, 'Invalid or expired token')
  }
  assert.ok(threw)
})

test('AuthService: verifyToken throws error for expired token', async () => {
  const authService = new AuthService()
  // Create an expired token using jwt directly via dynamic import
  const jwtModule = await import('jsonwebtoken')
  const jwt = jwtModule.default || jwtModule
  const expiredToken = jwt.sign(
    { sub: 'user-1', email: 'test@test.com', role: 'employee' },
    'wrong-secret',
    { expiresIn: '-1h' }
  )
  let threw = false
  try {
    authService.verifyToken(expiredToken)
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 401)
  }
  assert.ok(threw)
})

test('AuthService: getUser returns user data by ID', () => {
  const authService = new AuthService()
  const user = authService.getUser('admin-1')
  assert.ok(user)
  assert.equal(user.id, 'admin-1')
  assert.equal(user.role, 'admin')
})

test('AuthService: getUser returns null for non-existent ID', () => {
  const authService = new AuthService()
  const user = authService.getUser('nonexistent-id')
  assert.equal(user, null)
})

test('AuthService: listUsers returns all users', () => {
  const authService = new AuthService()
  const users = authService.listUsers()
  assert.ok(users.length >= 3)
  users.forEach((u) => assert.ok(u.id && u.email && u.role && u.name))
})

// ============================================
// TicketService Tests
// ============================================
test('TicketService: createTicket creates ticket with triage', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'VPN Connection Issue',
    description: 'I cannot connect to VPN from home. This is urgent.'
  })
  assert.ok(ticket.id)
  assert.equal(ticket.subject, 'VPN Connection Issue')
  assert.equal(ticket.severity, 'Sev 2') // VPN down matches Sev 2 pattern
  assert.equal(ticket.slaHours, 2)
  assert.equal(ticket.assignedTeam, 'Tier 2 Infrastructure Support')
  assert.ok(ticket.sentiment)
})

test('TicketService: createTicket throws error for missing subject', () => {
  const ticketService = new TicketService()
  let threw = false
  try {
    ticketService.createTicket({
      userId: 'user-1',
      userEmail: 'test@test.com',
      subject: '',
      description: 'Description'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 400)
  }
  assert.ok(threw)
})

test('TicketService: createTicket throws error for missing description', () => {
  const ticketService = new TicketService()
  let threw = false
  try {
    ticketService.createTicket({
      userId: 'user-1',
      userEmail: 'test@test.com',
      subject: 'Subject',
      description: ''
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 400)
  }
  assert.ok(threw)
})

test('TicketService: triageSla uses requested severity when valid', () => {
  const ticketService = new TicketService()
  const result = ticketService.triageSla('General inquiry', 'Sev 1')
  assert.equal(result.severity, 'Sev 1')
  assert.equal(result.slaHours, 0.25)
  assert.equal(result.assignedTeam, 'Critical Response Team')
})

test('TicketService: triageSla auto-detects Sev 1 for emergency keywords', () => {
  const ticketService = new TicketService()
  const result = ticketService.triageSla('Production down emergency', null)
  assert.equal(result.severity, 'Sev 1')
  assert.equal(result.slaHours, 0.25)
})

test('TicketService: triageSla auto-detects Sev 2 for VPN/auth issues', () => {
  const ticketService = new TicketService()
  const result = ticketService.triageSla('VPN down cannot login', null)
  assert.equal(result.severity, 'Sev 2')
  assert.equal(result.slaHours, 2)
})

test('TicketService: triageSla auto-detects Sev 3 for expense/reimbursement', () => {
  const ticketService = new TicketService()
  const result = ticketService.triageSla('Expense reimbursement request', null)
  assert.equal(result.severity, 'Sev 3')
  assert.equal(result.slaHours, 8)
})

test('TicketService: triageSla defaults to Sev 4 for general inquiries', () => {
  const ticketService = new TicketService()
  const result = ticketService.triageSla('General question about policy', null)
  assert.equal(result.severity, 'Sev 4')
  assert.equal(result.slaHours, 24)
})

test('TicketService: analyzeSentiment detects frustrated', () => {
  const ticketService = new TicketService()
  const sentiment = ticketService.analyzeSentiment('This is absolutely furious and unacceptable!')
  assert.equal(sentiment, 'frustrated')
})

test('TicketService: analyzeSentiment detects urgent', () => {
  const ticketService = new TicketService()
  const sentiment = ticketService.analyzeSentiment('I need this fixed asap urgently right now')
  assert.equal(sentiment, 'urgent')
})

test('TicketService: analyzeSentiment detects positive', () => {
  const ticketService = new TicketService()
  const sentiment = ticketService.analyzeSentiment('Thanks, this is great and helpful')
  assert.equal(sentiment, 'positive')
})

test('TicketService: analyzeSentiment defaults to neutral', () => {
  const ticketService = new TicketService()
  const sentiment = ticketService.analyzeSentiment('I have a question about the policy')
  assert.equal(sentiment, 'neutral')
})

test('TicketService: getTicket returns ticket for owner', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Get Ticket Test',
    description: 'Description'
  })
  const found = ticketService.getTicket(ticket.id, 'user-1', 'employee')
  assert.ok(found)
  assert.equal(found.id, ticket.id)
})

test('TicketService: getTicket throws 404 for non-existent ticket', () => {
  const ticketService = new TicketService()
  let threw = false
  try {
    ticketService.getTicket('nonexistent-id', 'user-1', 'employee')
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 404)
  }
  assert.ok(threw)
})

test('TicketService: getTicket throws 403 for non-owner non-admin', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Auth Test',
    description: 'Description'
  })
  let threw = false
  try {
    ticketService.getTicket(ticket.id, 'user-2', 'employee')
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 403)
  }
  assert.ok(threw)
})

test('TicketService: getTicket allows admin to view any ticket', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Admin View',
    description: 'Description'
  })
  const found = ticketService.getTicket(ticket.id, 'user-999', 'admin')
  assert.ok(found)
})

test('TicketService: getTicket allows support_agent to view any ticket', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Agent View',
    description: 'Description'
  })
  const found = ticketService.getTicket(ticket.id, 'user-999', 'support_agent')
  assert.ok(found)
})

test('TicketService: resolveTicket resolves ticket with proper role', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Resolve Test',
    description: 'Description'
  })
  const resolved = ticketService.resolveTicket(ticket.id, {
    note: 'Issue fixed',
    updatedBy: 'agent-1',
    userRole: 'support_agent'
  })
  assert.equal(resolved.status, 'resolved')
  assert.ok(resolved.resolvedAt)
})

test('TicketService: resolveTicket throws 403 for non-agent non-admin', () => {
  const ticketService = new TicketService()
  const ticket = ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'Resolve Auth',
    description: 'Description'
  })
  let threw = false
  try {
    ticketService.resolveTicket(ticket.id, {
      note: 'Trying to resolve',
      updatedBy: 'user-1',
      userRole: 'employee'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 403)
  }
  assert.ok(threw)
})

test('TicketService: resolveTicket throws 404 for non-existent ticket', () => {
  const ticketService = new TicketService()
  let threw = false
  try {
    ticketService.resolveTicket('nonexistent', {
      note: 'Test',
      updatedBy: 'agent-1',
      userRole: 'admin'
    })
  } catch (err) {
    threw = true
    assert.equal(err.statusCode, 404)
  }
  assert.ok(threw)
})

test('TicketService: listTickets delegates to repository', () => {
  const ticketService = new TicketService()
  ticketService.createTicket({
    userId: 'user-1',
    userEmail: 'test@test.com',
    subject: 'List Test',
    description: 'Description'
  })
  const tickets = ticketService.listTickets({ userId: 'user-1', role: 'employee' })
  assert.ok(tickets.length >= 1)
})

// ============================================
// RAGEngine Tests
// ============================================
test('RAGEngine: Initializes with default documents', () => {
  const engine = new RAGEngine()
  assert.ok(engine.documents.length > 0)
  assert.ok(engine.docVectors.size > 0)
  assert.ok(engine.chunks.length > 0)
  assert.ok(engine.avgDocLength > 0)
})

test('RAGEngine: Initializes with custom documents', () => {
  const customDocs = [
    { id: 'custom-1', title: 'Custom Doc', category: 'test', content: 'Custom content for testing.', keywords: ['test', 'custom'] }
  ]
  const engine = new RAGEngine(customDocs)
  assert.equal(engine.documents.length, 1)
  assert.equal(engine.documents[0].id, 'custom-1')
})

test('RAGEngine: tokenize returns empty array for non-string input', () => {
  const engine = new RAGEngine()
  assert.deepEqual(engine.tokenize(null), [])
  assert.deepEqual(engine.tokenize(undefined), [])
  assert.deepEqual(engine.tokenize(''), [])
  assert.deepEqual(engine.tokenize(123), [])
})

test('RAGEngine: tokenize filters stopwords', () => {
  const engine = new RAGEngine()
  const tokens = engine.tokenize('The quick brown fox jumps over the lazy dog')
  assert.ok(!tokens.includes('the'))
  assert.ok(!tokens.includes('over'))
  assert.ok(tokens.includes('quick'))
  assert.ok(tokens.includes('brown'))
  assert.ok(tokens.includes('fox'))
})

test('RAGEngine: embedText returns normalized vector', () => {
  const engine = new RAGEngine()
  const vector = engine.embedText('test text')
  assert.ok(vector instanceof Float32Array)
  assert.equal(vector.length, 256)
  // L2 norm should be approximately 1
  let norm = 0
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i]
  }
  norm = Math.sqrt(norm)
  assert.ok(Math.abs(norm - 1) < 0.01 || norm === 0)
})

test('RAGEngine: embedText returns zero vector for short text', () => {
  const engine = new RAGEngine()
  const vector = engine.embedText('ab')
  let sum = 0
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i]
  }
  assert.equal(sum, 0)
})

test('RAGEngine: cosineSimilarity returns 1 for identical vectors', () => {
  const engine = new RAGEngine()
  const vecA = new Float32Array(256)
  const vecB = new Float32Array(256)
  vecA[0] = 1
  vecB[0] = 1
  const sim = engine.cosineSimilarity(vecA, vecB)
  assert.equal(sim, 1)
})

test('RAGEngine: cosineSimilarity returns 0 for orthogonal vectors', () => {
  const engine = new RAGEngine()
  const vecA = new Float32Array(256)
  const vecB = new Float32Array(256)
  vecA[0] = 1
  vecB[1] = 1
  const sim = engine.cosineSimilarity(vecA, vecB)
  assert.equal(sim, 0)
})

test('RAGEngine: expandQuery adds domain synonyms', () => {
  const engine = new RAGEngine()
  const expanded = engine.expandQuery('vpn')
  assert.ok(expanded.includes('vpn'))
  assert.ok(expanded.some((t) => t === 'anyconnect' || t === 'wireguard' || t === 'remote'))
})

test('RAGEngine: expandQuery returns original tokens for unknown terms', () => {
  const engine = new RAGEngine()
  const expanded = engine.expandQuery('xyzunknownterm')
  assert.ok(expanded.length > 0)
})

test('RAGEngine: scoreBM25 returns results for valid tokens', () => {
  const engine = new RAGEngine()
  const results = engine.scoreBM25(['vpn', 'remote'])
  assert.ok(results.length > 0)
  results.forEach((r) => assert.ok(r.document && r.bm25Score >= 0))
})

test('RAGEngine: scoreDense returns results for valid query', () => {
  const engine = new RAGEngine()
  const results = engine.scoreDense('vpn setup')
  assert.ok(results.length > 0)
  results.forEach((r) => assert.ok(r.document && r.denseScore >= 0))
})

test('RAGEngine: hybridSearch combines BM25 and dense results', () => {
  const engine = new RAGEngine()
  const results = engine.hybridSearch('vpn remote access', 5)
  assert.ok(results.length > 0)
  results.forEach((r) => {
    assert.ok(r.document)
    assert.ok(r.score >= 0)
    assert.ok(r.confidence >= 0)
    assert.ok(r.telemetry)
    assert.ok(r.telemetry.rrfScore >= 0)
  })
})

test('RAGEngine: retrieveTopChunks returns relevant chunks', () => {
  const engine = new RAGEngine()
  const chunks = engine.retrieveTopChunks('password reset portal', 4)
  assert.ok(Array.isArray(chunks))
  chunks.forEach((c) => {
    assert.ok(c.chunkId)
    assert.ok(c.content)
    assert.ok(c.score >= 0)
  })
})

test('RAGEngine: verifyGroundedness detects grounded answer', () => {
  const engine = new RAGEngine()
  const result = engine.verifyGroundedness(
    'Reset your password at the portal.',
    [{ content: 'Employees can reset their corporate passwords via the self-service portal.' }]
  )
  assert.ok(result.groundednessScore >= 0.6)
  assert.equal(result.isGrounded, true)
})

test('RAGEngine: verifyGroundedness detects ungrounded answer', () => {
  const engine = new RAGEngine()
  const result = engine.verifyGroundedness(
    'The secret recipe involves quantum mechanics on Jupiter.',
    [{ content: 'Employees can reset their corporate passwords via the self-service portal.' }]
  )
  assert.ok(result.groundednessScore < 0.6)
  assert.equal(result.isGrounded, false)
})

test('RAGEngine: verifyGroundedness returns zero score for empty answer', () => {
  const engine = new RAGEngine()
  const result = engine.verifyGroundedness('', [{ content: 'Some context' }])
  assert.equal(result.groundednessScore, 0)
  assert.equal(result.isGrounded, false)
})

test('RAGEngine: verifyGroundedness returns zero score for empty context', () => {
  const engine = new RAGEngine()
  const result = engine.verifyGroundedness('Some answer', [])
  assert.equal(result.groundednessScore, 0)
  assert.equal(result.isGrounded, false)
})

test('RAGEngine: inspectRAG returns full telemetry', () => {
  const engine = new RAGEngine()
  const telemetry = engine.inspectRAG('vpn setup')
  assert.equal(telemetry.query, 'vpn setup')
  assert.ok(Array.isArray(telemetry.expandedTokens))
  assert.ok(Array.isArray(telemetry.sparseResults))
  assert.ok(Array.isArray(telemetry.denseResults))
  assert.ok(Array.isArray(telemetry.hybridResults))
  assert.ok(Array.isArray(telemetry.topChunks))
  assert.ok(telemetry.latencyMs >= 0)
})

test('RAGEngine: refreshIndex reinitializes with new documents', () => {
  const engine = new RAGEngine()
  const newDocs = [
    { id: 'refresh-1', title: 'Refresh Doc', category: 'test', content: 'Refresh content for testing reindex.', keywords: ['refresh'] }
  ]
  engine.refreshIndex(newDocs)
  assert.equal(engine.documents.length, 1)
  assert.equal(engine.documents[0].id, 'refresh-1')
})

test('RAGEngine: chunkDocument creates chunks from document', () => {
  const engine = new RAGEngine()
  const doc = {
    id: 'chunk-test',
    title: 'Chunk Test',
    category: 'test',
    content: 'First sentence. Second sentence here. Third sentence for testing chunks.'
  }
  const chunks = engine.chunkDocument(doc)
  assert.ok(chunks.length > 0)
  chunks.forEach((c) => {
    assert.ok(c.chunkId)
    assert.equal(c.parentDocId, 'chunk-test')
    assert.equal(c.parentTitle, 'Chunk Test')
    assert.equal(c.category, 'test')
    assert.ok(c.content)
    assert.ok(Array.isArray(c.embedding))
    assert.ok(c.score >= 0)
  })
})

// ============================================
// FineTuningService Tests
// ============================================
test('FineTuningService: Initializes with synthetic dataset', () => {
  const service = new FineTuningService()
  assert.ok(service.syntheticDataset.length > 0)
  assert.ok(service.rehearsalBuffer.length > 0)
})

test('FineTuningService: generateSyntheticDataset creates entries for all documents', () => {
  const service = new FineTuningService()
  // Each document generates at least 3 entries (factual, troubleshooting if applicable, tool_use)
  const docCount = DOCUMENTS.length
  const expectedMin = docCount * 2 // factual + tool_use for each
  assert.ok(service.syntheticDataset.length >= expectedMin)
})

test('FineTuningService: Dataset entries have required fields', () => {
  const service = new FineTuningService()
  service.syntheticDataset.forEach((entry) => {
    assert.ok(entry.id)
    assert.ok(entry.category)
    assert.ok(entry.question)
    assert.ok(entry.answer)
    assert.ok(entry.type)
    assert.ok(entry.trainingRegime)
    assert.ok(entry.difficulty)
    assert.ok(entry.domain)
  })
})

test('FineTuningService: exportDataset returns Gemini format', () => {
  const service = new FineTuningService()
  const data = service.exportDataset('gemini', 'train')
  assert.ok(data.length > 0)
  const first = data[0]
  assert.ok(Array.isArray(first.contents))
  assert.equal(first.contents[0].role, 'user')
  assert.equal(first.contents[1].role, 'model')
  assert.ok(first.contents[0].parts[0].text)
  assert.ok(first.contents[1].parts[0].text)
})

test('FineTuningService: exportDataset returns OpenAI format', () => {
  const service = new FineTuningService()
  const data = service.exportDataset('openai', 'train')
  assert.ok(data.length > 0)
  const first = data[0]
  assert.ok(Array.isArray(first.messages))
  assert.equal(first.messages[0].role, 'system')
  assert.equal(first.messages[1].role, 'user')
  assert.ok(first.hasToolCall !== undefined)
})

test('FineTuningService: exportDataset OpenAI format includes tool calls', () => {
  const service = new FineTuningService()
  const data = service.exportDataset('openai', 'train')
  const toolExample = data.find((ex) => ex.messages.some((m) => m.tool_calls))
  assert.ok(toolExample, 'Should include tool-calling examples')
})

test('FineTuningService: exportDataset eval split returns fewer items', () => {
  const service = new FineTuningService()
  const train = service.exportDataset('gemini', 'train')
  const evalData = service.exportDataset('gemini', 'eval')
  assert.ok(train.length > evalData.length)
})

test('FineTuningService: sanitizeText redacts emails', () => {
  const service = new FineTuningService()
  const result = service.sanitizeText('Contact us at john@company.com')
  assert.ok(result.includes('[EMAIL]'))
  assert.ok(!result.includes('john@company.com'))
})

test('FineTuningService: sanitizeText redacts passwords', () => {
  const service = new FineTuningService()
  const result = service.sanitizeText('password=secret123')
  assert.ok(result.includes('password:[REDACTED]'))
  assert.ok(!result.includes('secret123'))
})

test('FineTuningService: sanitizeText redacts phone numbers', () => {
  const service = new FineTuningService()
  const result = service.sanitizeText('Call 555-123-4567')
  assert.ok(result.includes('[PHONE]'))
  assert.ok(!result.includes('555-123-4567'))
})

test('FineTuningService: sanitizeText redacts bearer tokens', () => {
  const service = new FineTuningService()
  const result = service.sanitizeText('Bearer abc123def456')
  assert.ok(result.includes('Bearer [REDACTED]'))
})

test('FineTuningService: getStatistics returns comprehensive metrics', () => {
  const service = new FineTuningService()
  const stats = service.getStatistics()
  assert.ok(stats.totalExamples > 0)
  assert.ok(stats.trainSplitCount > 0)
  assert.ok(stats.evalSplitCount > 0)
  assert.ok(stats.estimatedTokens > 0)
  assert.ok(stats.categoryDistribution)
  assert.ok(stats.typeDistribution)
  assert.ok(Array.isArray(stats.supportedExportFormats))
  assert.equal(stats.status, 'READY_FOR_TRAINING')
  assert.ok(stats.forgettingRisk)
  assert.ok(stats.peftReadinessScore >= 0)
  assert.ok(stats.peftReadinessScore <= 1)
  assert.ok(stats.trainingRegimeDistribution)
})

test('FineTuningService: computePEFTReadinessScore returns value between 0 and 1', () => {
  const service = new FineTuningService()
  const score = service.computePEFTReadinessScore(service.syntheticDataset)
  assert.ok(score >= 0)
  assert.ok(score <= 1)
})

test('FineTuningService: computeTrainingRegimeDistribution returns counts', () => {
  const service = new FineTuningService()
  const dist = service.computeTrainingRegimeDistribution(service.syntheticDataset)
  assert.ok(dist.sftCount >= 0)
  assert.ok(dist.peftCount >= 0)
  assert.ok(dist.toolUseCount > 0)
  assert.ok(dist.sftPercentage >= 0)
  assert.ok(dist.peftPercentage >= 0)
  assert.ok(dist.toolUsePercentage > 0)
})

// ============================================
// PipelineService Tests
// ============================================
test('PipelineService: listSources returns pipeline sources', () => {
  const service = new PipelineService()
  const sources = service.listSources()
  assert.ok(sources.length > 0)
  sources.forEach((s) => assert.ok(s.id && s.name && s.type && s.status))
})

test('PipelineService: addSource creates new pipeline source', () => {
  const service = new PipelineService()
  const source = service.addSource({
    name: 'Test Source',
    type: 'test_feed',
    endpointUrl: 'https://test.example.com/api',
    syncFrequency: 'hourly'
  })
  assert.ok(source.id)
  assert.equal(source.name, 'Test Source')
  assert.equal(source.type, 'test_feed')
  assert.equal(source.status, 'active')
})

test('PipelineService: addSource uses default values', () => {
  const service = new PipelineService()
  const source = service.addSource({ name: 'Minimal Source' })
  assert.equal(source.type, 'generic_feed')
  assert.equal(source.endpointUrl, '')
  assert.equal(source.syncFrequency, 'daily')
  assert.equal(source.status, 'active')
})

test('PipelineService: listJobs returns pipeline jobs', () => {
  const service = new PipelineService()
  const jobs = service.listJobs()
  assert.ok(Array.isArray(jobs))
  jobs.forEach((j) => assert.ok(j.id && j.pipelineName && j.status))
})

test('PipelineService: getJobById returns null for non-existent ID', () => {
  const service = new PipelineService()
  const job = service.getJobById('nonexistent')
  assert.equal(job, null)
})

test('PipelineService: getJobById returns null for empty ID', () => {
  const service = new PipelineService()
  const job = service.getJobById('')
  assert.equal(job, null)
})

test('PipelineService: runPipeline executes corporate_docs_sync', async () => {
  const service = new PipelineService()
  const job = await service.runPipeline('corporate_docs_sync', 'test-user')
  assert.ok(job.id)
  assert.equal(job.pipelineName, 'corporate_docs_sync')
  assert.equal(job.status, 'COMPLETED')
  assert.ok(job.totalItems > 0)
  assert.ok(job.processedItems > 0)
})

test('PipelineService: runPipeline throws error for unknown pipeline name', async () => {
  const service = new PipelineService()
  let threw = false
  try {
    await service.runPipeline('unknown_pipeline', 'test-user')
  } catch (err) {
    threw = true
    assert.ok(err.message.includes('Unknown pipeline name'))
  }
  assert.ok(threw)
})

test('PipelineService: executeCorporateDocsSync syncs all documents', async () => {
  const service = new PipelineService()
  const result = await service.executeCorporateDocsSync()
  assert.ok(result.total > 0)
  assert.ok(result.processed > 0)
  assert.ok(result.failed >= 0)
  assert.ok(Array.isArray(result.details))
})

test('PipelineService: executeTicketsDistillation processes resolved tickets', async () => {
  const service = new PipelineService()
  const result = await service.executeTicketsDistillation()
  assert.ok(result.total >= 0)
  assert.ok(result.processed >= 0)
  assert.ok(result.failed >= 0)
})

test('PipelineService: executeExternalWebhookSync ingests external articles', async () => {
  const service = new PipelineService()
  const result = await service.executeExternalWebhookSync()
  assert.equal(result.total, 2)
  assert.equal(result.processed, 2)
  assert.equal(result.failed, 0)
})

test('PipelineService: executeFullVectorReindex reindexes all documents', async () => {
  const service = new PipelineService()
  const result = await service.executeFullVectorReindex()
  assert.ok(result.total > 0)
  assert.equal(result.processed, result.total)
  assert.equal(result.failed, 0)
})

test('PipelineService: ingestDocument creates document with required fields', () => {
  const service = new PipelineService()
  const doc = service.ingestDocument({
    title: 'Ingested Doc',
    category: 'general',
    content: 'This is ingested content.',
    keywords: ['ingested', 'test'],
    sourceId: 'manual'
  })
  assert.ok(doc.id)
  assert.equal(doc.title, 'Ingested Doc')
  assert.equal(doc.category, 'general')
})

test('PipelineService: ingestDocument throws error for missing title', () => {
  const service = new PipelineService()
  let threw = false
  try {
    service.ingestDocument({ title: '', content: 'Content' })
  } catch (err) {
    threw = true
    assert.ok(err.message.includes('Title and content are required'))
  }
  assert.ok(threw)
})

test('PipelineService: ingestDocument throws error for missing content', () => {
  const service = new PipelineService()
  let threw = false
  try {
    service.ingestDocument({ title: 'Title', content: '' })
  } catch (err) {
    threw = true
    assert.ok(err.message.includes('Title and content are required'))
  }
  assert.ok(threw)
})

test('PipelineService: ingestDocument converts string keywords to array', () => {
  const service = new PipelineService()
  const doc = service.ingestDocument({
    title: 'Keyword Test',
    category: 'general',
    content: 'Content',
    keywords: 'kw1, kw2, kw3',
    sourceId: 'manual'
  })
  assert.ok(doc.keywords)
  assert.ok(Array.isArray(doc.keywords))
})
