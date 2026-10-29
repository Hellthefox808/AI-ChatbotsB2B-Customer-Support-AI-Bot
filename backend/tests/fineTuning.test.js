import test from 'node:test'
import assert from 'node:assert/strict'
import { fineTuningService } from '../src/service/fineTuningService.js'

test('FineTuningService: Generates synthetic Q&A pairs from corporate documentation', () => {
  const stats = fineTuningService.getStatistics()
  assert.ok(stats.totalExamples >= 16, 'Should generate multiple training examples across documents')
  assert.ok(stats.estimatedTokens > 500)
  assert.equal(stats.status, 'READY_FOR_TRAINING')
  assert.ok(stats.categoryDistribution.it > 0)
  assert.ok(stats.categoryDistribution.hr > 0)
  assert.ok(stats.categoryDistribution.security > 0)
  assert.ok(stats.categoryDistribution.finance > 0)
})

test('FineTuningService: Exports dataset in Google Gemini SFT format', () => {
  const geminiData = fineTuningService.exportDataset('gemini', 'train')
  assert.ok(geminiData.length > 0)
  const first = geminiData[0]
  assert.ok(Array.isArray(first.contents), 'Gemini format requires contents array')
  assert.equal(first.contents[0].role, 'user')
  assert.ok(first.contents[0].parts[0].text)
  assert.equal(first.contents[1].role, 'model')
  assert.ok(first.contents[1].parts[0].text)
})

test('FineTuningService: Exports dataset in OpenAI / ChatML format including tool calling examples', () => {
  const openaiData = fineTuningService.exportDataset('openai', 'train')
  assert.ok(openaiData.length > 0)
  const first = openaiData[0]
  assert.ok(Array.isArray(first.messages), 'OpenAI format requires messages array')
  assert.equal(first.messages[0].role, 'system')
  assert.equal(first.messages[1].role, 'user')
  assert.equal(first.messages[first.messages.length - 1].role, 'assistant')

  // Check that tool use examples are present
  const toolExample = openaiData.find((ex) => ex.messages.some((m) => m.tool_calls))
  assert.ok(toolExample, 'Should include tool-calling trajectory examples')
  const assistantCall = toolExample.messages.find((m) => m.tool_calls)
  assert.ok(assistantCall.tool_calls[0].function.name)
})

test('FineTuningService: Sanitizes PII before exporting historical datasets', () => {
  const sanitized = fineTuningService.sanitizeText('User email is test@company.com and secret password=MySecretToken123!')
  assert.match(sanitized, /\[EMAIL\]/)
  assert.match(sanitized, /password:\[REDACTED\]/)
  assert.ok(!sanitized.includes('MySecretToken123!'))
  assert.ok(!sanitized.includes('test@company.com'))
})
