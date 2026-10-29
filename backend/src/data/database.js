import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { DOCUMENTS } from './documentStore.js'

/**
 * Enterprise Database Connection & Persistence Manager
 * Powered by native node:sqlite with Write-Ahead Logging (WAL) mode
 */
export class DatabaseManager {
  constructor (options = {}) {
    const isTest = (
      process.env.NODE_ENV === 'test' ||
      process.execArgv.some((a) => typeof a === 'string' && a.includes('test')) ||
      process.argv.some((a) => typeof a === 'string' && (a.includes('test') || a.includes('node:test')))
    )
    this.dbPath = options.dbPath || (isTest ? ':memory:' : (config.dbPath || './data/support_bot.db'))
    this.mode = options.mode || (isTest ? 'memory' : (config.dbMode || 'sqlite'))
    this.db = null
    this.initialized = false
    this.initDatabase()
  }

  initDatabase () {
    if (this.initialized && this.db) return

    let targetPath = this.dbPath
    if (this.mode === 'memory' || targetPath === ':memory:') {
      targetPath = ':memory:'
    } else {
      const dir = path.dirname(path.resolve(this.dbPath))
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      targetPath = path.resolve(this.dbPath)
    }

    try {
      this.db = new DatabaseSync(targetPath)
      this.db.exec('PRAGMA busy_timeout = 10000;')
      if (targetPath !== ':memory:') {
        this.db.exec('PRAGMA journal_mode = WAL;')
      }
      this.db.exec('PRAGMA foreign_keys = ON;')
      this.db.exec('PRAGMA synchronous = NORMAL;')

      this.createTables()
      this.seedDefaults()
      this.initialized = true

      logger.audit('database.connected', 'system', {
        mode: this.mode,
        target: targetPath === ':memory:' ? 'in-memory' : path.basename(targetPath),
        walEnabled: targetPath !== ':memory:'
      })
    } catch (err) {
      logger.error('Failed to initialize SQLite database connection', { error: err.message })
      throw err
    }
  }

  createTables () {
    // 1. Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `)

    // 2. Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    `)

    // 3. Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    `)

    // 4. Support Tickets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        sla_hours INTEGER NOT NULL,
        sla_deadline TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        sentiment TEXT NOT NULL DEFAULT 'neutral',
        assigned_team TEXT NOT NULL,
        timeline_json TEXT NOT NULL,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_severity ON tickets(severity);
    `)

    // 5. Knowledge Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        source_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
    `)

    // 6. Hierarchical Document Chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);
    `)

    // 7. Pipeline Data Sources table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        endpoint_url TEXT,
        sync_frequency TEXT NOT NULL DEFAULT 'daily',
        status TEXT NOT NULL DEFAULT 'active',
        last_synced_at TEXT,
        doc_count INTEGER DEFAULT 0
      );
    `)

    // 8. Pipeline Execution Jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_jobs (
        id TEXT PRIMARY KEY,
        pipeline_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        total_items INTEGER DEFAULT 0,
        processed_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT,
        telemetry_json TEXT,
        triggered_by TEXT NOT NULL DEFAULT 'system',
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON pipeline_jobs(status);
    `)

    // 9. GTM Accounts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT,
        size TEXT,
        industry TEXT,
        tier TEXT,
        bant_score INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_accounts_tier ON gtm_accounts(tier);
    `)

    // 10. GTM Leads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_leads (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT,
        intent_score INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'NEW',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_leads_email ON gtm_leads(email);
    `)

    // 11. GTM Suppression & Opt-Out Registry table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_suppression (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        value TEXT UNIQUE NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_suppression_val ON gtm_suppression(value);
    `)

    // 12. GTM Campaigns & Human Approval table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        audience_count INTEGER DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `)

    // 13. GTM CRM Synchronization Audit Log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_crm_sync_log (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        crm_system TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_crm_idempotency ON gtm_crm_sync_log(idempotency_key);
    `)

    // 14. GTM Contacts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_contacts (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        title TEXT,
        is_primary INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES gtm_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_contacts_account ON gtm_contacts(account_id);
      CREATE INDEX IF NOT EXISTS idx_gtm_contacts_email ON gtm_contacts(email);
    `)

    // 15. GTM Opportunities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_opportunities (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT 'DISCOVERY',
        probability INTEGER DEFAULT 20,
        close_date TEXT,
        touchpoints_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES gtm_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_opps_account ON gtm_opportunities(account_id);
      CREATE INDEX IF NOT EXISTS idx_gtm_opps_stage ON gtm_opportunities(stage);
    `)

    // 16. GTM Campaign Queue & Throttling Dispatch table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gtm_campaign_queue (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT,
        subject TEXT,
        content TEXT,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        scheduled_at TEXT,
        dispatched_at TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES gtm_campaigns(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_gtm_queue_campaign ON gtm_campaign_queue(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_gtm_queue_status ON gtm_campaign_queue(status);
    `)
  }

  seedDefaults () {
    // Seed default employee user if table is empty
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users;').get().count
    if (userCount === 0) {
      const salt = bcrypt.genSaltSync(10)
      const passwordHash = bcrypt.hashSync('password123', salt)
      const now = new Date().toISOString()
      const insertUser = this.db.prepare(`
        INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
      `)
      insertUser.run('user-1', 'employee@company.com', passwordHash, 'Jane Employee', 'employee', now)
      insertUser.run('admin-1', 'admin@company.com', passwordHash, 'Alex Admin', 'admin', now)
      insertUser.run('agent-1', 'agent@company.com', passwordHash, 'Sam Support', 'support_agent', now)
    }

    // Seed default corporate documents if table is empty
    const docCount = this.db.prepare('SELECT COUNT(*) as count FROM documents;').get().count
    if (docCount === 0) {
      const now = new Date().toISOString()
      const insertDoc = this.db.prepare(`
        INSERT OR IGNORE INTO documents (id, title, category, content, keywords_json, checksum, source_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      DOCUMENTS.forEach((doc) => {
        insertDoc.run(
          doc.id,
          doc.title,
          doc.category,
          doc.content,
          JSON.stringify(doc.keywords || []),
          Buffer.from(doc.content).toString('base64').slice(0, 16),
          'src-wiki',
          now,
          now
        )
      })
    }

    // Seed default pipeline data sources if table is empty
    const srcCount = this.db.prepare('SELECT COUNT(*) as count FROM pipeline_sources;').get().count
    if (srcCount === 0) {
      const now = new Date().toISOString()
      const insertSrc = this.db.prepare(`
        INSERT OR IGNORE INTO pipeline_sources (id, name, type, endpoint_url, sync_frequency, status, last_synced_at, doc_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
      `)
      insertSrc.run('src-wiki', 'Corporate Policy Wiki', 'internal_wiki', '/internal/wiki', 'daily', 'active', now, DOCUMENTS.length)
      insertSrc.run('src-runbooks', 'IT & DevOps Runbooks', 'markdown_repo', 'https://git.company.internal/runbooks', 'hourly', 'active', now, 4)
      insertSrc.run('src-distiller', 'Resolved Tickets Distiller', 'ticket_distiller', 'db://tickets?status=resolved', 'continuous', 'active', now, 0)
      insertSrc.run('src-confluence', 'HR Benefits & Compliance Portal', 'confluence_api', 'https://confluence.company.com/rest/api', 'weekly', 'active', now, 3)
    }

    // Seed default suppression records if table is empty
    const suppressionCount = this.db.prepare('SELECT COUNT(*) as count FROM gtm_suppression;').get().count
    if (suppressionCount === 0) {
      const now = new Date().toISOString()
      const insertSup = this.db.prepare(`
        INSERT OR IGNORE INTO gtm_suppression (id, type, value, reason, created_at)
        VALUES (?, ?, ?, ?, ?);
      `)
      insertSup.run('sup-1', 'domain', 'competitor-domain.com', 'Competitor organization', now)
      insertSup.run('sup-2', 'email', 'unsubscribed-lead@client.com', 'Global opt-out request', now)
    }

    // Seed default GTM accounts if table is empty
    const accountCount = this.db.prepare('SELECT COUNT(*) as count FROM gtm_accounts;').get().count
    if (accountCount === 0) {
      const now = new Date().toISOString()
      const insertAcc = this.db.prepare(`
        INSERT OR IGNORE INTO gtm_accounts (id, name, domain, size, industry, tier, bant_score, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      insertAcc.run('acc-1', 'FinTech Global Ltd', 'fintechglobal.com', '1000+', 'Finance', 'Tier 1 Enterprise VIP', 92, 'ACTIVE', now, now)
      insertAcc.run('acc-2', 'HealthTech Solutions', 'healthtech.org', '51-200', 'Healthcare', 'Tier 2 Mid-Market High-Velocity', 68, 'ACTIVE', now, now)
      insertAcc.run('acc-3', 'RetailCloud Systems', 'retailcloud.io', '1-50', 'Retail', 'Tier 3 SMB / Self-Serve', 42, 'ACTIVE', now, now)
    }

    // Seed default GTM contacts if table is empty
    const contactCount = this.db.prepare('SELECT COUNT(*) as count FROM gtm_contacts;').get().count
    if (contactCount === 0) {
      const now = new Date().toISOString()
      const insertCnt = this.db.prepare(`
        INSERT OR IGNORE INTO gtm_contacts (id, account_id, name, email, phone, role, title, is_primary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      insertCnt.run('cnt-1', 'acc-1', 'Sarah Jenkins', 'sarah.jenkins@fintechglobal.com', '+1-555-0101', 'VP of Engineering', 'VP of Engineering', 1, now, now)
      insertCnt.run('cnt-2', 'acc-2', 'David Ross', 'david.ross@healthtech.org', '+1-555-0102', 'Director of IT', 'IT Director', 1, now, now)
      insertCnt.run('cnt-3', 'acc-3', 'Elena Vance', 'elena@retailcloud.io', '+1-555-0103', 'Support Lead', 'Customer Support Lead', 1, now, now)
    }

    // Seed default GTM opportunities if table is empty
    const oppCount = this.db.prepare('SELECT COUNT(*) as count FROM gtm_opportunities;').get().count
    if (oppCount === 0) {
      const now = new Date().toISOString()
      const insertOpp = this.db.prepare(`
        INSERT OR IGNORE INTO gtm_opportunities (id, account_id, name, amount, stage, probability, close_date, touchpoints_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      insertOpp.run('opp-1', 'acc-1', 'FinTech Global Enterprise AI Support', 120000, 'CLOSED_WON', 100, '2026-09-30', JSON.stringify(['web_search', 'whitepaper_download', 'inbound_chat', 'sales_demo']), now, now)
      insertOpp.run('opp-2', 'acc-2', 'HealthTech SOC-2 Compliance Bot', 65000, 'PROPOSAL', 60, '2026-11-15', JSON.stringify(['partner_referral', 'soc2_playbook', 'executive_followup']), now, now)
      insertOpp.run('opp-3', 'acc-3', 'RetailCloud Tier-1 Distiller', 24000, 'DISCOVERY', 30, '2026-12-01', JSON.stringify(['cold_outreach', 'architecture_session']), now, now)
    }

    // Seed default GTM campaigns if table is empty
    const campaignCount = this.db.prepare('SELECT COUNT(*) as count FROM gtm_campaigns;').get().count
    if (campaignCount === 0) {
      const now = new Date().toISOString()
      const insertCmp = this.db.prepare(`
        INSERT OR IGNORE INTO gtm_campaigns (id, name, type, status, audience_count, approved_by, approved_at, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `)
      insertCmp.run('cmp-1', 'Q4 Enterprise Security & SOC-2 Outreach', 'outbound_email', 'APPROVED', 45, 'admin@company.com', now, JSON.stringify({ targetTier: 'Tier 1 Enterprise VIP', playbook: 'SECURITY_SOC2' }), now)
      insertCmp.run('cmp-2', 'Mid-Market Support Automation High-Velocity', 'outbound_email', 'DRAFT', 120, null, null, JSON.stringify({ targetTier: 'Tier 2 Mid-Market High-Velocity', playbook: 'PRICING_JUSTIFICATION' }), now)
    }
  }

  queryAll (sql, ...params) {
    const stmt = this.db.prepare(sql)
    return stmt.all(...params)
  }

  queryOne (sql, ...params) {
    const stmt = this.db.prepare(sql)
    return stmt.get(...params)
  }

  run (sql, ...params) {
    const stmt = this.db.prepare(sql)
    return stmt.run(...params)
  }

  getHealth () {
    const start = performance.now()
    let pingOk = false
    try {
      const res = this.db.prepare('SELECT 1 as ping;').get()
      pingOk = res?.ping === 1
    } catch {
      pingOk = false
    }
    const latencyMs = Math.round((performance.now() - start) * 100) / 100

    let fileSizeBytes = 0
    let resolvedPath = ':memory:'
    if (this.mode !== 'memory' && this.dbPath !== ':memory:') {
      try {
        resolvedPath = path.resolve(this.dbPath)
        if (fs.existsSync(resolvedPath)) {
          fileSizeBytes = fs.statSync(resolvedPath).size
        }
      } catch {
        fileSizeBytes = 0
      }
    }

    return {
      status: pingOk ? 'healthy' : 'unhealthy',
      connected: pingOk,
      engine: 'SQLite (node:sqlite)',
      mode: this.mode,
      journalMode: this.mode === 'memory' ? 'memory' : 'WAL',
      latencyMs,
      fileSizeBytes,
      fileSizeFormatted: `${(fileSizeBytes / 1024).toFixed(1)} KB`,
      databasePath: resolvedPath
    }
  }

  getStatistics () {
    const tables = [
      'users',
      'conversations',
      'messages',
      'tickets',
      'documents',
      'document_chunks',
      'pipeline_sources',
      'pipeline_jobs',
      'gtm_accounts',
      'gtm_contacts',
      'gtm_leads',
      'gtm_opportunities',
      'gtm_campaigns',
      'gtm_campaign_queue',
      'gtm_suppression',
      'gtm_crm_sync_log'
    ]

    const counts = {}
    let totalRecords = 0
    tables.forEach((t) => {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${t};`).get()
        counts[t] = row?.count || 0
        totalRecords += counts[t]
      } catch {
        counts[t] = 0
      }
    })

    const health = this.getHealth()

    return {
      health,
      tableCounts: counts,
      totalRecords,
      totalDocuments: counts.documents,
      totalChunks: counts.document_chunks,
      totalTickets: counts.tickets,
      totalConversations: counts.conversations,
      totalPipelineJobs: counts.pipeline_jobs,
      activeSources: counts.pipeline_sources
    }
  }

  checkIntegrity () {
    if (!this.db) {
      return { status: 'error', message: 'Database not initialized', ok: false }
    }
    const startTime = Date.now()
    try {
      const rows = this.db.prepare('PRAGMA integrity_check(10);').all()
      const durationMs = Date.now() - startTime
      const isOk = rows.length === 1 && rows[0].integrity_check === 'ok'
      return {
        status: isOk ? 'healthy' : 'corrupted',
        ok: isOk,
        results: rows.map(r => r.integrity_check),
        checkedAt: new Date().toISOString(),
        durationMs
      }
    } catch (err) {
      return {
        status: 'error',
        ok: false,
        message: err.message,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    }
  }

  optimize () {
    if (!this.db) {
      return { status: 'error', message: 'Database not initialized', ok: false }
    }
    const startTime = Date.now()
    try {
      this.db.exec('PRAGMA optimize;')
      let checkpointInfo = null
      if (this.mode !== 'memory' && this.dbPath !== ':memory:') {
        try {
          const checkpointRow = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get()
          checkpointInfo = {
            busy: checkpointRow?.busy || 0,
            log: checkpointRow?.log || 0,
            checkpointed: checkpointRow?.checkpointed || 0
          }
        } catch (e) {
          checkpointInfo = { error: e.message }
        }
      }
      const durationMs = Date.now() - startTime
      const health = this.getHealth()
      return {
        status: 'success',
        ok: true,
        optimizedAt: new Date().toISOString(),
        durationMs,
        checkpoint: checkpointInfo,
        health
      }
    } catch (err) {
      return {
        status: 'error',
        ok: false,
        message: err.message,
        durationMs: Date.now() - startTime
      }
    }
  }

  getReaEvidence () {
    const isDisk = this.mode !== 'memory' && this.dbPath !== ':memory:'
    const absPath = isDisk ? path.resolve(this.dbPath) : ':memory:'
    const walPath = isDisk ? `${absPath}-wal` : null

    let dbSha256 = null
    let walSha256 = null
    let dbBytes = 0
    let walBytes = 0

    if (isDisk && fs.existsSync(absPath)) {
      try {
        const dbBuf = fs.readFileSync(absPath)
        dbBytes = dbBuf.length
        dbSha256 = crypto.createHash('sha256').update(dbBuf).digest('hex')
      } catch {
        // file locked or in transit
      }
    }

    if (isDisk && walPath && fs.existsSync(walPath)) {
      try {
        const walBuf = fs.readFileSync(walPath)
        walBytes = walBuf.length
        walSha256 = crypto.createHash('sha256').update(walBuf).digest('hex')
      } catch {
        // file locked or in transit
      }
    }

    let cachedBundle = null
    const bundlePath = isDisk ? path.resolve(path.dirname(absPath), 'rea_evidence_bundle.json') : null
    if (bundlePath && fs.existsSync(bundlePath)) {
      try {
        cachedBundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
      } catch {
        // ignore parse error
      }
    }

    let tableInventory = []
    let indexInventory = []
    if (this.db) {
      try {
        tableInventory = this.db.prepare("SELECT name, type, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all()
        indexInventory = this.db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index';").all()
      } catch {
        // ignore
      }
    }

    const integrity = this.checkIntegrity()

    return {
      provider: 'REA SQLite Forensic Inspector',
      evidenceId: cachedBundle?.evidence_id || `ev_${crypto.randomUUID().replace(/-/g, '')}`,
      generatedAt: new Date().toISOString(),
      artifact: {
        path: absPath,
        bytes: dbBytes,
        sha256: dbSha256
      },
      wal: {
        path: walPath,
        bytes: walBytes,
        sha256: walSha256
      },
      schema: {
        tableCount: tableInventory.length,
        tables: tableInventory.map(t => t.name),
        indexCount: indexInventory.length,
        indexes: indexInventory.map(i => i.name)
      },
      integrity,
      cachedBundleSummary: cachedBundle
        ? {
            path: cachedBundle.result?.path || null,
            bytes: cachedBundle.result?.bytes || 0,
            records: cachedBundle.result?.records || 1,
            unknowns: cachedBundle.result?.unknowns || 0
          }
        : null
    }
  }

  reset () {
    if (!this.db) return
    const tables = [
      'gtm_campaign_queue',
      'gtm_opportunities',
      'gtm_contacts',
      'gtm_leads',
      'gtm_campaigns',
      'gtm_crm_sync_log',
      'gtm_suppression',
      'gtm_accounts',
      'messages',
      'conversations',
      'tickets',
      'document_chunks',
      'documents',
      'pipeline_jobs',
      'pipeline_sources',
      'users'
    ]
    tables.forEach((t) => {
      try {
        this.db.exec(`DELETE FROM ${t};`)
      } catch {
        // Table might not exist yet
      }
    })
    this.seedDefaults()
  }

  close () {
    if (this.db) {
      try {
        this.db.close()
      } catch (e) {
        console.error(e)
      }
      this.db = null
      this.initialized = false
    }
  }
}

export const dbManager = new DatabaseManager()
export const database = dbManager
