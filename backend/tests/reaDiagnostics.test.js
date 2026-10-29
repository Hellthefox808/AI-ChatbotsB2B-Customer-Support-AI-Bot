import test from 'node:test'
import assert from 'node:assert/strict'
import { dbManager } from '../src/data/database.js'

test('REA Diagnostics: checkIntegrity executes PRAGMA integrity_check and validates B-tree structures', () => {
  const result = dbManager.checkIntegrity()
  assert.equal(result.status, 'healthy')
  assert.equal(result.ok, true)
  assert.ok(Array.isArray(result.results))
  assert.equal(result.results[0], 'ok')
  assert.ok(result.durationMs >= 0)
  assert.ok(result.checkedAt)
})

test('REA Diagnostics: optimize executes PRAGMA optimize and WAL checkpoint', () => {
  const result = dbManager.optimize()
  assert.equal(result.status, 'success')
  assert.equal(result.ok, true)
  assert.ok(result.durationMs >= 0)
  assert.ok(result.optimizedAt)
  assert.ok(result.health)
  assert.equal(result.health.connected, true)
})

test('REA Diagnostics: getReaEvidence produces authoritative cryptographic schema and checksum evidence', () => {
  const evidence = dbManager.getReaEvidence()
  assert.equal(evidence.provider, 'REA SQLite Forensic Inspector')
  assert.ok(evidence.evidenceId.startsWith('ev_'))
  assert.ok(evidence.schema.tableCount >= 8)
  assert.ok(evidence.schema.tables.includes('users'))
  assert.ok(evidence.schema.tables.includes('tickets'))
  assert.ok(evidence.schema.tables.includes('documents'))
  assert.ok(evidence.schema.tables.includes('pipeline_jobs'))
  assert.ok(evidence.schema.indexCount >= 10)
  assert.equal(evidence.integrity.ok, true)
  assert.ok(evidence.generatedAt)
})
