import test from 'node:test'
import assert from 'node:assert/strict'
import { documentRepository } from '../src/data/documentRepository.js'
import { aiService } from '../src/integration/aiService.js'

test('RAG Search: Retrieves top matching documents with TF-IDF scoring', () => {
  const vpnResults = documentRepository.search('How do I connect to VPN remotely?')
  assert.ok(vpnResults.length > 0, 'Should find VPN documents')
  assert.equal(vpnResults[0].document.id, 'doc-2')
  assert.ok(vpnResults[0].confidence > 0.5, 'Confidence should be high for direct match')

  const ptoResults = documentRepository.search('vacation rollover PTO days policy')
  assert.ok(ptoResults.length > 0, 'Should find PTO documents')
  assert.equal(ptoResults[0].document.id, 'doc-4')
})

test('AIService: Generates grounded response with sources and confidence', async () => {
  const searchResults = documentRepository.search('password reset portal link')
  const response = await aiService.generateAnswer('How can I reset my password?', searchResults)

  assert.ok(response.answer.includes('Password Reset'), 'Answer should cite document title')
  assert.ok(response.sources.length > 0, 'Sources should be listed')
  assert.equal(response.sources[0].id, 'doc-1')
  assert.ok(response.confidence > 0.3)
  assert.equal(response.needsEscalation, false)
})

test('AIService: Flags escalation when no documents match', async () => {
  const emptyResults = []
  const response = await aiService.generateAnswer('What is the recipe for chocolate cake?', emptyResults)

  assert.equal(response.confidence, 0)
  assert.equal(response.needsEscalation, true)
  assert.match(response.answer, /could not locate/i)
})

test('RAGEngine: Hybrid search produces BM25 and Dense telemetry with RRF scoring', () => {
  const telemetry = documentRepository.inspectRAG('How do I submit Concur expense reports?')
  assert.ok(telemetry.expandedTokens.length > 0)
  assert.ok(telemetry.sparseResults.length > 0)
  assert.ok(telemetry.denseResults.length > 0)
  assert.ok(telemetry.hybridResults.length > 0)
  assert.equal(telemetry.hybridResults[0].document.id, 'doc-3')
  assert.ok(telemetry.hybridResults[0].telemetry.bm25Score > 0)
  assert.ok(telemetry.hybridResults[0].telemetry.denseScore > 0)
  assert.ok(telemetry.hybridResults[0].telemetry.rrfScore > 0)
})

test('RAGEngine: Performs domain-aware query expansion for corporate terms', () => {
  const telemetry = documentRepository.inspectRAG('vpn issues')
  const tokenSet = new Set(telemetry.expandedTokens)
  assert.ok(tokenSet.has('vpn'))
  assert.ok(tokenSet.has('anyconnect') || tokenSet.has('wireguard') || tokenSet.has('remote'))
})

test('RAGEngine: Chunks corporate documents into hierarchical sentence units', () => {
  const chunks = documentRepository.retrieveTopChunks('MacBook ThinkPad hardware buddy', 3)
  assert.ok(chunks.length > 0)
  assert.ok(chunks[0].chunkId.includes('doc-'))
  assert.ok(chunks[0].parentTitle)
  assert.ok(chunks[0].content)
})

test('RAGEngine: Verifies groundedness and detects ungrounded/hallucinated text', () => {
  const chunks = [
    { content: 'Employees can reset their corporate passwords via the self-service portal at portal.company.com/password.' }
  ]
  const groundedResult = documentRepository.verifyGroundedness(
    'Reset your password at portal.company.com/password.',
    chunks
  )
  assert.ok(groundedResult.groundednessScore >= 0.6)
  assert.equal(groundedResult.isGrounded, true)

  const hallucinatedResult = documentRepository.verifyGroundedness(
    'The secret extraterrestrial recipe involves bananas and quantum mechanics on Jupiter.',
    chunks
  )
  assert.ok(hallucinatedResult.groundednessScore < 0.4)
  assert.equal(hallucinatedResult.isGrounded, false)
})

test('AIService: Supports provider listing, dynamic switching, and streaming generator', async () => {
  const providers = aiService.getProviders()
  assert.ok(providers.length >= 5)
  assert.ok(providers.some((p) => p.id === 'auto'))
  assert.ok(providers.some((p) => p.id === 'local-hybrid-rag'))

  aiService.setPreferredProvider('local-hybrid-rag')
  assert.equal(aiService.preferredProvider, 'local-hybrid-rag')

  // Stream answer test
  const searchResults = documentRepository.search('vpn setup')
  const streamChunks = []
  for await (const chunk of aiService.streamAnswer('vpn setup', searchResults)) {
    streamChunks.push(chunk)
  }

  assert.ok(streamChunks.length >= 2)
  assert.equal(streamChunks[0].type, 'start')
  assert.ok(streamChunks.some((c) => c.type === 'token'))
  assert.equal(streamChunks[streamChunks.length - 1].type, 'done')
})
