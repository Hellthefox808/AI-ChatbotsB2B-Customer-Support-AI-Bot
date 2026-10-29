import { database } from './database.js'
import { logger } from '../utils/logger.js'

export class GTMRepository {
  constructor (dbInstance = database) {
    this.database = dbInstance
  }

  get db () {
    return this.database.db
  }

  // ==========================================
  // ACCOUNTS & ICP PROFILES
  // ==========================================

  createAccount (data = {}) {
    const {
      name,
      domain = '',
      size = '1-50',
      industry = 'Technology',
      tier = 'Tier 3 SMB / Self-Serve',
      bantScore = 0,
      status = 'ACTIVE'
    } = data

    if (!name || !name.trim()) {
      throw new Error('Account name is required')
    }

    const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_accounts (id, name, domain, size, industry, tier, bant_score, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `)
    stmt.run(id, name.trim(), domain.trim(), size, industry, tier, bantScore, status, now, now)

    logger.audit('gtm.account_created', 'system', { accountId: id, name, tier })
    return this.getAccountById(id)
  }

  listAccounts () {
    return this.db.prepare('SELECT * FROM gtm_accounts ORDER BY created_at DESC;').all()
  }

  getAccountById (id) {
    const row = this.db.prepare('SELECT * FROM gtm_accounts WHERE id = ?;').get(id)
    if (!row) return null
    return row
  }

  getAccountByDomain (domain) {
    if (!domain) return null
    return this.db.prepare('SELECT * FROM gtm_accounts WHERE lower(domain) = lower(?);').get(domain.trim())
  }

  updateAccount (id, updates = {}) {
    const existing = this.getAccountById(id)
    if (!existing) {
      throw new Error(`Account ${id} not found`)
    }

    const name = updates.name !== undefined ? updates.name : existing.name
    const domain = updates.domain !== undefined ? updates.domain : existing.domain
    const size = updates.size !== undefined ? updates.size : existing.size
    const industry = updates.industry !== undefined ? updates.industry : existing.industry
    const tier = updates.tier !== undefined ? updates.tier : existing.tier
    const bantScore = updates.bantScore !== undefined ? updates.bantScore : existing.bant_score
    const status = updates.status !== undefined ? updates.status : existing.status
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      UPDATE gtm_accounts
      SET name = ?, domain = ?, size = ?, industry = ?, tier = ?, bant_score = ?, status = ?, updated_at = ?
      WHERE id = ?;
    `)
    stmt.run(name, domain, size, industry, tier, bantScore, status, now, id)
    return this.getAccountById(id)
  }

  deleteAccount (id) {
    const stmt = this.db.prepare('DELETE FROM gtm_accounts WHERE id = ?;')
    const result = stmt.run(id)
    return result.changes > 0
  }

  // ==========================================
  // CONTACTS & DECISION MAKERS
  // ==========================================

  createContact (data = {}) {
    const {
      accountId,
      name,
      email,
      phone = '',
      role = 'champion',
      title = 'Lead Evaluator',
      isPrimary = 0
    } = data

    if (!name || !name.trim()) throw new Error('Contact name is required')
    if (!email || !email.trim()) throw new Error('Contact email is required')

    const id = `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_contacts (id, account_id, name, email, phone, role, title, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `)
    stmt.run(id, accountId || null, name.trim(), email.trim().toLowerCase(), phone, role, title, isPrimary ? 1 : 0, now, now)

    return this.getContactById(id)
  }

  listContacts (accountId = null) {
    if (accountId) {
      return this.db.prepare('SELECT * FROM gtm_contacts WHERE account_id = ? ORDER BY created_at DESC;').all(accountId)
    }
    return this.db.prepare('SELECT * FROM gtm_contacts ORDER BY created_at DESC;').all()
  }

  getContactById (id) {
    return this.db.prepare('SELECT * FROM gtm_contacts WHERE id = ?;').get(id) || null
  }

  deleteContact (id) {
    const stmt = this.db.prepare('DELETE FROM gtm_contacts WHERE id = ?;')
    return stmt.run(id).changes > 0
  }

  // ==========================================
  // LEADS
  // ==========================================

  createLead (data = {}) {
    const {
      accountId = null,
      contactName,
      email,
      role = 'Individual Contributor',
      intentScore = 0,
      status = 'NEW'
    } = data

    if (!contactName || !contactName.trim()) throw new Error('Lead contact name is required')
    if (!email || !email.trim()) throw new Error('Lead email is required')

    const id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_leads (id, account_id, contact_name, email, role, intent_score, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `)
    stmt.run(id, accountId, contactName.trim(), email.trim().toLowerCase(), role, intentScore, status, now)

    return this.getLeadById(id)
  }

  listLeads (accountId = null) {
    if (accountId) {
      return this.db.prepare('SELECT * FROM gtm_leads WHERE account_id = ? ORDER BY created_at DESC;').all(accountId)
    }
    return this.db.prepare('SELECT * FROM gtm_leads ORDER BY created_at DESC;').all()
  }

  getLeadById (id) {
    return this.db.prepare('SELECT * FROM gtm_leads WHERE id = ?;').get(id) || null
  }

  updateLeadStatus (id, status) {
    const stmt = this.db.prepare('UPDATE gtm_leads SET status = ? WHERE id = ?;')
    stmt.run(status, id)
    return this.getLeadById(id)
  }

  // ==========================================
  // OPPORTUNITIES & PIPELINE
  // ==========================================

  createOpportunity (data = {}) {
    const {
      accountId,
      name,
      amount = 0,
      stage = 'DISCOVERY',
      probability = 20,
      closeDate = null,
      touchpoints = []
    } = data

    if (!accountId) throw new Error('Opportunity accountId is required')
    if (!name || !name.trim()) throw new Error('Opportunity name is required')

    const id = `opp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_opportunities (id, account_id, name, amount, stage, probability, close_date, touchpoints_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `)
    stmt.run(id, accountId, name.trim(), Number(amount) || 0, stage, probability, closeDate, JSON.stringify(touchpoints), now, now)

    return this.getOpportunityById(id)
  }

  listOpportunities (accountId = null) {
    const query = accountId
      ? 'SELECT * FROM gtm_opportunities WHERE account_id = ? ORDER BY created_at DESC;'
      : 'SELECT * FROM gtm_opportunities ORDER BY created_at DESC;'

    const rows = accountId ? this.db.prepare(query).all(accountId) : this.db.prepare(query).all()
    return rows.map((r) => {
      let touchpoints = []
      try {
        touchpoints = JSON.parse(r.touchpoints_json || '[]')
      } catch {
        touchpoints = []
      }
      return { ...r, touchpoints }
    })
  }

  getOpportunityById (id) {
    const row = this.db.prepare('SELECT * FROM gtm_opportunities WHERE id = ?;').get(id)
    if (!row) return null
    let touchpoints = []
    try {
      touchpoints = JSON.parse(row.touchpoints_json || '[]')
    } catch {
      touchpoints = []
    }
    return { ...row, touchpoints }
  }

  updateOpportunityStage (id, stage, probability = null) {
    const existing = this.getOpportunityById(id)
    if (!existing) throw new Error(`Opportunity ${id} not found`)

    const now = new Date().toISOString()
    const prob = probability !== null ? probability : (stage === 'CLOSED_WON' ? 100 : stage === 'CLOSED_LOST' ? 0 : existing.probability)

    const stmt = this.db.prepare(`
      UPDATE gtm_opportunities
      SET stage = ?, probability = ?, updated_at = ?
      WHERE id = ?;
    `)
    stmt.run(stage, prob, now, id)
    return this.getOpportunityById(id)
  }

  // ==========================================
  // SUPPRESSION & OPT-OUT REGISTRY
  // ==========================================

  addSuppression (data = {}) {
    const { type = 'domain', value, reason = 'Administrative suppression' } = data
    if (!value || !value.trim()) throw new Error('Suppression value is required')
    const cleanValue = value.toLowerCase().trim()
    const now = new Date().toISOString()
    const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    try {
      const stmt = this.db.prepare(`
        INSERT INTO gtm_suppression (id, type, value, reason, created_at)
        VALUES (?, ?, ?, ?, ?);
      `)
      stmt.run(id, type, cleanValue, reason, now)
      logger.audit('gtm.suppression_added', 'system', { type, value: cleanValue, reason })
      return { id, type, value: cleanValue, reason, createdAt: now }
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        throw new Error(`Record '${cleanValue}' is already on the suppression list.`)
      }
      throw err
    }
  }

  removeSuppression (id) {
    const stmt = this.db.prepare('DELETE FROM gtm_suppression WHERE id = ?;')
    const result = stmt.run(id)
    return result.changes > 0
  }

  listSuppressions () {
    return this.db.prepare('SELECT * FROM gtm_suppression ORDER BY created_at DESC;').all()
  }

  isSuppressed (value = '') {
    if (!value || typeof value !== 'string') return false
    const val = value.toLowerCase().trim()

    // 1. Direct exact or substring match in DB
    const checkStmt = this.db.prepare(`
      SELECT id, type, value, reason FROM gtm_suppression
      WHERE lower(value) = ? OR ? LIKE '%' || lower(value) || '%' OR lower(value) LIKE '%' || ? || '%';
    `)
    const hits = checkStmt.all(val, val, val)
    if (hits.length > 0) return true

    // 2. Domain check if value is an email
    if (val.includes('@')) {
      const domain = val.split('@')[1]
      if (domain) {
        const domainHit = this.db.prepare('SELECT id FROM gtm_suppression WHERE lower(value) = ?;').get(domain)
        if (domainHit) return true
      }
    }

    return false
  }

  // ==========================================
  // CAMPAIGNS & HUMAN-IN-THE-LOOP APPROVAL
  // ==========================================

  createCampaign (data = {}) {
    const { name, type = 'outbound_email', audienceCount = 0, metadata = {} } = data
    if (!name || !name.trim()) throw new Error('Campaign name is required')

    const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_campaigns (id, name, type, status, audience_count, metadata_json, created_at)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?);
    `)
    stmt.run(id, name.trim(), type, audienceCount, JSON.stringify(metadata), now)

    logger.audit('gtm.campaign_created', 'system', { campaignId: id, name, type })
    return this.getCampaignById(id)
  }

  listCampaigns () {
    const rows = this.db.prepare('SELECT * FROM gtm_campaigns ORDER BY created_at DESC;').all()
    return rows.map((r) => {
      let metadata = {}
      try {
        metadata = JSON.parse(r.metadata_json || '{}')
      } catch {
        metadata = {}
      }
      return { ...r, metadata }
    })
  }

  getCampaignById (id) {
    const row = this.db.prepare('SELECT * FROM gtm_campaigns WHERE id = ?;').get(id)
    if (!row) return null
    let metadata = {}
    try {
      metadata = JSON.parse(row.metadata_json || '{}')
    } catch {
      metadata = {}
    }
    return { ...row, metadata }
  }

  approveCampaign (id, approvedBy = 'admin@company.com') {
    const existing = this.getCampaignById(id)
    if (!existing) throw new Error(`Campaign '${id}' not found.`)

    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      UPDATE gtm_campaigns
      SET status = 'APPROVED', approved_by = ?, approved_at = ?
      WHERE id = ?;
    `)
    stmt.run(approvedBy, now, id)

    logger.audit('gtm.campaign_approved', approvedBy, { campaignId: id })
    return this.getCampaignById(id)
  }

  // ==========================================
  // DISPATCH QUEUE & RATE THROTTLING
  // ==========================================

  enqueueMessage (data = {}) {
    const {
      campaignId,
      recipientEmail,
      recipientName = '',
      subject = '',
      content = '',
      scheduledAt = null
    } = data

    if (!campaignId) throw new Error('campaignId is required')
    if (!recipientEmail || !recipientEmail.trim()) throw new Error('recipientEmail is required')

    const cleanEmail = recipientEmail.toLowerCase().trim()

    // Enforce suppression check before enqueuing
    if (this.isSuppressed(cleanEmail)) {
      throw new Error(`Cannot enqueue message: Recipient '${cleanEmail}' is suppressed/opted-out.`)
    }

    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO gtm_campaign_queue (id, campaign_id, recipient_email, recipient_name, subject, content, status, scheduled_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?);
    `)
    stmt.run(id, campaignId, cleanEmail, recipientName, subject, content, scheduledAt || now, now)

    return {
      id,
      campaignId,
      recipientEmail: cleanEmail,
      recipientName,
      status: 'QUEUED',
      createdAt: now
    }
  }

  getQueue (campaignId = null) {
    const query = campaignId
      ? 'SELECT * FROM gtm_campaign_queue WHERE campaign_id = ? ORDER BY created_at ASC;'
      : 'SELECT * FROM gtm_campaign_queue ORDER BY created_at ASC;'

    return campaignId ? this.db.prepare(query).all(campaignId) : this.db.prepare(query).all()
  }

  /**
   * Dispatches queued messages enforcing:
   * 1. Campaign must be APPROVED (human-in-the-loop gate)
   * 2. Recipient must not be suppressed
   * 3. Batch rate throttling (batchSize parameter)
   */
  dispatchQueue (campaignId, batchLimit = 5) {
    const campaign = this.getCampaignById(campaignId)
    if (!campaign) throw new Error(`Campaign '${campaignId}' not found.`)

    if (campaign.status !== 'APPROVED') {
      throw new Error(`CAMPAIGN_NOT_APPROVED: Campaign '${campaignId}' must have human approval before dispatch. Current status: ${campaign.status}`)
    }

    const queuedItems = this.db.prepare(`
      SELECT * FROM gtm_campaign_queue
      WHERE campaign_id = ? AND status = 'QUEUED'
      ORDER BY created_at ASC
      LIMIT ?;
    `).all(campaignId, batchLimit)

    const now = new Date().toISOString()
    const dispatched = []
    const suppressed = []

    const updateStmt = this.db.prepare(`
      UPDATE gtm_campaign_queue
      SET status = ?, dispatched_at = ?, error_message = ?
      WHERE id = ?;
    `)

    queuedItems.forEach((item) => {
      // Re-verify suppression at moment of dispatch
      if (this.isSuppressed(item.recipient_email)) {
        updateStmt.run('SUPPRESSED', null, 'Opt-out or domain suppression detected', item.id)
        suppressed.push(item)
      } else {
        updateStmt.run('DISPATCHED', now, null, item.id)
        dispatched.push(item)
      }
    })

    logger.audit('gtm.campaign_dispatched', campaign.approved_by || 'system', {
      campaignId,
      dispatchedCount: dispatched.length,
      suppressedCount: suppressed.length,
      batchLimit
    })

    return {
      campaignId,
      batchLimit,
      dispatchedCount: dispatched.length,
      suppressedCount: suppressed.length,
      dispatchedIds: dispatched.map((d) => d.id),
      suppressedIds: suppressed.map((s) => s.id),
      dispatchedAt: now
    }
  }
}

export const gtmRepository = new GTMRepository()
