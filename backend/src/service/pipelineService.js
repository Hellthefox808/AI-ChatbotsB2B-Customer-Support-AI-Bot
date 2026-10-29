import crypto from 'node:crypto'
import { dbManager } from '../data/database.js'
import { documentRepository } from '../data/documentRepository.js'
import { ticketRepository } from '../data/ticketRepository.js'
import { DOCUMENTS } from '../data/documentStore.js'
import { logger } from '../utils/logger.js'

/**
 * Enterprise Data & Ingestion Pipeline Engine
 * Manages ETL workflows, Knowledge Distillation from resolved tickets,
 * external webhooks, and automated Vector/Chunk indexing.
 */
export class PipelineService {
  listSources () {
    return dbManager.queryAll(
      'SELECT id, name, type, endpoint_url as endpointUrl, sync_frequency as syncFrequency, status, last_synced_at as lastSyncedAt, doc_count as docCount FROM pipeline_sources ORDER BY name ASC;'
    )
  }

  addSource ({ name, type = 'generic_feed', endpointUrl = '', syncFrequency = 'daily' }) {
    const id = `src-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    dbManager.run(
      `INSERT INTO pipeline_sources (id, name, type, endpoint_url, sync_frequency, status, last_synced_at, doc_count)
       VALUES (?, ?, ?, ?, ?, 'active', ?, 0);`,
      id,
      name,
      type,
      endpointUrl,
      syncFrequency,
      now
    )
    return dbManager.queryOne(
      'SELECT id, name, type, endpoint_url as endpointUrl, sync_frequency as syncFrequency, status, last_synced_at as lastSyncedAt, doc_count as docCount FROM pipeline_sources WHERE id = ?;',
      id
    )
  }

  listJobs (limit = 20) {
    const rows = dbManager.queryAll(
      'SELECT id, pipeline_name as pipelineName, status, total_items as totalItems, processed_items as processedItems, failed_items as failedItems, duration_ms as durationMs, error_message as errorMessage, telemetry_json, triggered_by as triggeredBy, created_at as createdAt, completed_at as completedAt FROM pipeline_jobs ORDER BY datetime(created_at) DESC LIMIT ?;',
      limit
    )

    return rows.map((r) => {
      let telemetry = {}
      try {
        telemetry = JSON.parse(r.telemetry_json || '{}')
      } catch {
        telemetry = {}
      }
      return {
        ...r,
        telemetry
      }
    })
  }

  getJobById (id) {
    if (!id) return null
    const row = dbManager.queryOne(
      'SELECT id, pipeline_name as pipelineName, status, total_items as totalItems, processed_items as processedItems, failed_items as failedItems, duration_ms as durationMs, error_message as errorMessage, telemetry_json, triggered_by as triggeredBy, created_at as createdAt, completed_at as completedAt FROM pipeline_jobs WHERE id = ?;',
      id
    )
    if (!row) return null

    let telemetry = {}
    try {
      telemetry = JSON.parse(row.telemetry_json || '{}')
    } catch {
      telemetry = {}
    }

    return {
      ...row,
      telemetry
    }
  }

  async runPipeline (pipelineName = 'corporate_docs_sync', triggeredBy = 'system') {
    const jobId = `job-${crypto.randomUUID()}`
    const startTime = performance.now()
    const now = new Date().toISOString()

    dbManager.run(
      `INSERT INTO pipeline_jobs (id, pipeline_name, status, total_items, processed_items, failed_items, duration_ms, triggered_by, created_at)
       VALUES (?, ?, 'RUNNING', 0, 0, 0, 0, ?, ?);`,
      jobId,
      pipelineName,
      triggeredBy,
      now
    )

    logger.audit('pipeline.job_started', jobId, { pipelineName, triggeredBy })

    try {
      let result = { processed: 0, failed: 0, total: 0, details: [] }

      if (pipelineName === 'corporate_docs_sync') {
        result = await this.executeCorporateDocsSync()
      } else if (pipelineName === 'resolved_tickets_distillation') {
        result = await this.executeTicketsDistillation()
      } else if (pipelineName === 'external_api_webhook') {
        result = await this.executeExternalWebhookSync()
      } else if (pipelineName === 'full_vector_reindex') {
        result = await this.executeFullVectorReindex()
      } else {
        throw new Error(`Unknown pipeline name: ${pipelineName}`)
      }

      const durationMs = Math.round(performance.now() - startTime)
      const completedAt = new Date().toISOString()

      dbManager.run(
        `UPDATE pipeline_jobs
         SET status = 'COMPLETED', total_items = ?, processed_items = ?, failed_items = ?,
             duration_ms = ?, telemetry_json = ?, completed_at = ?
         WHERE id = ?;`,
        result.total,
        result.processed,
        result.failed,
        durationMs,
        JSON.stringify(result.details || {}),
        completedAt,
        jobId
      )

      logger.audit('pipeline.job_completed', jobId, {
        pipelineName,
        processed: result.processed,
        durationMs
      })

      return this.getJobById(jobId)
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const completedAt = new Date().toISOString()

      dbManager.run(
        `UPDATE pipeline_jobs
         SET status = 'FAILED', error_message = ?, duration_ms = ?, completed_at = ?
         WHERE id = ?;`,
        err.message,
        durationMs,
        completedAt,
        jobId
      )

      logger.error('Pipeline job failed', { jobId, pipelineName, error: err.message })
      throw err
    }
  }

  async executeCorporateDocsSync () {
    let processed = 0
    let failed = 0
    const details = []

    DOCUMENTS.forEach((doc) => {
      try {
        const ingested = documentRepository.upsertDocument({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          content: doc.content,
          keywords: doc.keywords,
          sourceId: 'src-wiki'
        })
        processed++
        details.push({ docId: ingested.id, title: ingested.title, status: 'synced' })
      } catch (err) {
        failed++
        details.push({ docId: doc.id, error: err.message, status: 'failed' })
      }
    })

    dbManager.run(
      'UPDATE pipeline_sources SET last_synced_at = ?, doc_count = ? WHERE id = ?;',
      new Date().toISOString(),
      processed,
      'src-wiki'
    )

    return { total: DOCUMENTS.length, processed, failed, details }
  }

  async executeTicketsDistillation () {
    const allTickets = ticketRepository.listTickets({ role: 'admin' })
    const resolvedTickets = allTickets.filter((t) => t.status === 'resolved')

    let processed = 0
    let failed = 0
    const details = []

    resolvedTickets.forEach((t) => {
      try {
        const resolveStep = t.timeline.find((step) => step.action === 'RESOLVED')
        const resolution = resolveStep?.note || 'Issue resolved by support team according to enterprise guidelines.'

        const docId = `doc-distilled-${t.id}`
        const title = `Support Resolution: ${t.subject}`
        const content = `Resolved Issue Inquiry: ${t.description}\n\nVerified Resolution Guidance: ${resolution}\n\nAssigned Team: ${t.assignedTeam} | Priority Tier: ${t.severity} | Customer Sentiment: ${t.sentiment}`
        const keywords = ['ticket', 'resolution', t.assignedTeam.toLowerCase(), t.severity.toLowerCase(), 'support', 'helpdesk']

        documentRepository.upsertDocument({
          id: docId,
          title,
          category: 'troubleshooting',
          content,
          keywords,
          sourceId: 'src-distiller'
        })

        processed++
        details.push({ ticketId: t.id, docId, status: 'distilled' })
      } catch (err) {
        failed++
        details.push({ ticketId: t.id, error: err.message, status: 'failed' })
      }
    })

    dbManager.run(
      'UPDATE pipeline_sources SET last_synced_at = ?, doc_count = ? WHERE id = ?;',
      new Date().toISOString(),
      processed,
      'src-distiller'
    )

    return { total: resolvedTickets.length, processed, failed, details }
  }

  async executeExternalWebhookSync () {
    // Simulates ingestion from external Jira/Confluence/Zendesk API feeds
    const externalArticles = [
      {
        id: 'doc-ext-okta-migration',
        title: 'Okta Adaptive MFA & FIDO2 Security Keys Standard Operating Procedure',
        category: 'security',
        content: 'Effective immediately, all enterprise authentication flows require WebAuthn/FIDO2 hardware security keys (YubiKey) or Okta Verify with biometric number matching. SMS verification is deprecated for production systems. For lost tokens, open an urgent ticket with the security operations center.',
        keywords: ['okta', 'mfa', 'fido2', 'yubikey', 'security', 'login']
      },
      {
        id: 'doc-ext-cloud-vpn',
        title: 'Zero Trust Network Access (ZTNA) Cloud Gateway Rollout',
        category: 'it',
        content: 'Zero Trust Network Access (ZTNA) is gradually replacing legacy Cisco AnyConnect tunnels for AWS and GCP VPC resources. Access policies are evaluated per-session based on device health, CrowdStrike sensor status, and SSO authentication state.',
        keywords: ['ztna', 'vpn', 'cloud', 'aws', 'gcp', 'network', 'crowdstrike']
      }
    ]

    let processed = 0
    let failed = 0
    const details = []

    externalArticles.forEach((art) => {
      try {
        documentRepository.upsertDocument({
          id: art.id,
          title: art.title,
          category: art.category,
          content: art.content,
          keywords: art.keywords,
          sourceId: 'src-confluence'
        })
        processed++
        details.push({ docId: art.id, title: art.title, status: 'ingested' })
      } catch (err) {
        failed++
        details.push({ docId: art.id, error: err.message, status: 'failed' })
      }
    })

    return { total: externalArticles.length, processed, failed, details }
  }

  async executeFullVectorReindex () {
    const docs = documentRepository.findAll()
    docs.forEach((doc) => {
      documentRepository.upsertDocument(doc)
    })
    return { total: docs.length, processed: docs.length, failed: 0, details: [] }
  }

  ingestDocument ({ title, category = 'general', content, keywords = [], sourceId = 'manual' }) {
    if (!title || !content) {
      throw new Error('Title and content are required for document ingestion')
    }

    const docId = `doc-${crypto.randomUUID()}`
    const ingested = documentRepository.upsertDocument({
      id: docId,
      title: title.trim(),
      category: category.trim(),
      content: content.trim(),
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map((k) => k.trim()).filter(Boolean),
      sourceId
    })

    logger.audit('pipeline.document_ingested', docId, {
      title: ingested.title,
      category: ingested.category,
      sourceId
    })

    return ingested
  }
}

export const pipelineService = new PipelineService()
