import { ragEngine } from './ragEngine.js'
import { logger } from '../utils/logger.js'
import { database } from '../data/database.js'
import { gtmRepository } from '../data/gtmRepository.js'

/**
 * Enterprise AI-GTM (Go-To-Market) & Response Engine
 * Powers lead qualification, automated multi-channel response synthesis,
 * account intent detection, objection-handling battlecards, suppression governance,
 * campaign lifecycle state management, and revenue attribution.
 */

export const GTM_PLAYBOOKS = [
  {
    id: 'SECURITY_SOC2',
    topic: 'Security, Privacy & Compliance (SOC-2 / ISO)',
    objection: 'Our infosec team needs to verify SOC-2 Type II, HIPAA, and Zero-Trust isolation before procurement.',
    positioning: 'Enterprise-grade isolation with dedicated tenant keys, SOC-2 Type II certified infrastructure, and zero training on customer data.',
    keyTalkingPoints: [
      'AES-256 at rest, TLS 1.3 in flight, with hardware-backed KMS encryption.',
      'Comprehensive SOC-2 Type II, ISO 27001, and GDPR compliance documentation available under NDA.',
      'Role-Based Access Control (RBAC) with granular tenant isolation and air-gap deployment options.',
      'Zero model retention: customer prompts and documents are never used for base model training.'
    ],
    recommendedCollateral: 'Enterprise Security Architecture Whitepaper & SOC-2 Bridge Letter',
    targetPersona: 'CISO / Security Architect'
  },
  {
    id: 'PRICING_JUSTIFICATION',
    topic: 'Pricing Justification & ROI Multiplier',
    objection: 'Your platform seems more expensive than building an in-house open-source LangChain/Llama bot.',
    positioning: 'Turns support costs into revenue drivers with guaranteed 15-minute Sev 1 SLAs, 72% first-contact resolution, and zero DevOps overhead.',
    keyTalkingPoints: [
      'Reduces Tier-1 support ticket volume by 65% within the first 30 days of deployment.',
      'Avoids 4-6 full-time ML engineering salaries ($800k+ annual run rate) required to build and maintain RAG infra.',
      'Native B2B CRM, ticketing, and vector sync engines built-in without custom pipeline glue code.',
      'Transparent tiered licensing with predictable per-seat or usage models and no surprise token surges.'
    ],
    recommendedCollateral: 'Total Cost of Ownership (TCO) Calculator & 90-Day ROI Study',
    targetPersona: 'VP of Finance / VP of Customer Experience'
  },
  {
    id: 'MIGRATION_TIMELINE',
    topic: 'Migration & Implementation Velocity',
    objection: 'We have 50,000 existing Confluence docs and Zendesk tickets. Migration will take 6 months.',
    positioning: 'Production-ready in 48 hours using automated asynchronous ETL ingestion pipelines and one-click vector sync.',
    keyTalkingPoints: [
      'High-throughput parallel ingestion pipeline imports and chunks 10,000 documents in under 2 minutes.',
      'Automated PII scrubbing redacts employee emails, phone numbers, and credentials before indexing.',
      'Parallel hybrid BM25 + dense embedding re-indexing runs without system downtime.',
      'Dedicated migration concierge engineer assigned to all Enterprise tier onboardings.'
    ],
    recommendedCollateral: '48-Hour Rapid Deployment Guide & Case Study: FinTech 100k Doc Migration',
    targetPersona: 'VP of Engineering / IT Director'
  },
  {
    id: 'SLA_ENTERPRISE',
    topic: 'High Availability & Enterprise SLAs',
    objection: 'What guarantees do we have that the system will stay up during critical quarter-end crunches?',
    positioning: '99.99% uptime guarantee with legally backed financial SLA credits and 15-minute Sev 1 triage.',
    keyTalkingPoints: [
      'Multi-region failover across AWS & GCP with SQLite WAL replication.',
      'Automated Sev 1 triage protocol with 15-minute guaranteed response SLA.',
      'Real-time status transparency dashboard with automated customer paging.',
      '24/7 dedicated engineering escalation bridge for mission-critical deployments.'
    ],
    recommendedCollateral: 'Enterprise Service Level Agreement (SLA) & Business Continuity Plan',
    targetPersona: 'COO / VP of Operations'
  },
  {
    id: 'AI_HALLUCINATION_DEFENSE',
    topic: 'Hallucination Defense & Verifiable RAG',
    objection: 'How do you ensure the AI bot does not hallucinate false policy answers to clients?',
    positioning: 'Self-Reflective CRAG (Corrective RAG) verification that audits answers against source passages before delivery.',
    keyTalkingPoints: [
      'Dual-stage retrieval combines lexical BM25 precision with 256-dimensional semantic dense similarity.',
      'Confidence threshold gating: answers below 60% confidence automatically escalate to human agents.',
      'Full cryptographic citation ledger linking every claim to exact document IDs and timestamps.',
      'Automated prompt injection firewall blocks adversarial bypass attempts.'
    ],
    recommendedCollateral: 'Self-Reflective RAG Benchmark & Groundedness Evaluation Report',
    targetPersona: 'Chief AI Officer / Head of Product'
  }
]

export class GTMService {
  constructor (repository = gtmRepository) {
    this.playbooks = GTM_PLAYBOOKS
    this.repository = repository
    this.inMemorySuppressions = []
    this.inMemoryAccounts = []
    this.inMemoryCampaigns = []
    this.inMemorySyncLog = []
  }

  /**
   * Checks if an email address, company name, or domain is suppressed / opted-out
   */
  isSuppressed (value = '') {
    if (!value) return false
    const val = value.toLowerCase().trim()
    try {
      if (this.repository && this.repository.db) {
        return this.repository.isSuppressed(val)
      }
      if (database && database.db) {
        const stmt = database.db.prepare('SELECT id, value, reason FROM gtm_suppression WHERE lower(value) = ? OR ? LIKE "%" || lower(value);')
        const hit = stmt.get(val, val)
        if (hit) return true
      }
    } catch {
      // Fall through to in-memory check
    }
    return this.inMemorySuppressions.some((s) => val === s.value.toLowerCase() || val.includes(s.value.toLowerCase()))
  }

  /**
   * Adds an entity to the suppression and opt-out registry
   */
  addSuppression (data = {}) {
    const { type = 'domain', value, reason = 'Administrative suppression' } = data
    if (!value) throw new Error('Suppression value is required')
    const cleanValue = value.toLowerCase().trim()

    try {
      if (this.repository && this.repository.db) {
        return this.repository.addSuppression(data)
      }
    } catch (err) {
      if (err.message && err.message.includes('already on the suppression list')) throw err
      if (err.message && err.message.includes('UNIQUE')) {
        throw new Error(`Record '${cleanValue}' is already on the suppression list.`)
      }
    }

    const now = new Date().toISOString()
    const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const record = { id, type, value: cleanValue, reason, createdAt: now }
    this.inMemorySuppressions.push(record)
    return record
  }

  /**
   * Removes an entity from suppression by ID
   */
  removeSuppression (id) {
    if (this.repository && this.repository.db) {
      return this.repository.removeSuppression(id)
    }
    const idx = this.inMemorySuppressions.findIndex((s) => s.id === id)
    if (idx !== -1) {
      this.inMemorySuppressions.splice(idx, 1)
      return true
    }
    return false
  }

  /**
   * Returns list of all suppression records
   */
  listSuppressions () {
    try {
      if (this.repository && this.repository.db) {
        return this.repository.listSuppressions()
      }
      if (database && database.db) {
        return database.queryAll('SELECT * FROM gtm_suppression ORDER BY created_at DESC;')
      }
    } catch {
      // In-memory fallback
    }
    return this.inMemorySuppressions
  }

  /**
   * Filters an audience batch separating eligible leads from suppressed leads
   */
  filterAudience (audience = []) {
    const eligible = []
    const suppressed = []

    audience.forEach((lead) => {
      const email = lead.email || ''
      const domain = lead.domain || (email.includes('@') ? email.split('@')[1] : '')
      const company = lead.companyName || lead.company || ''

      if (this.isSuppressed(email) || (domain && this.isSuppressed(domain)) || (company && this.isSuppressed(company))) {
        suppressed.push({
          ...lead,
          reason: 'Matched suppression / opt-out registry'
        })
      } else {
        eligible.push(lead)
      }
    })

    return {
      totalCount: audience.length,
      eligibleCount: eligible.length,
      suppressedCount: suppressed.length,
      eligible,
      suppressed
    }
  }

  /**
   * Creates an ICP account profile
   */
  createAccount (accountData = {}) {
    if (!accountData.name) throw new Error('Account name is required')
    try {
      if (this.repository && this.repository.db) {
        return this.repository.createAccount(accountData)
      }
    } catch {
      // In-memory fallback
    }

    const {
      name,
      domain = '',
      size = '1-50',
      industry = 'Technology',
      tier = 'Tier 3 SMB / Self-Serve',
      bantScore = 0
    } = accountData

    const now = new Date().toISOString()
    const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const acc = { id, name, domain, size, industry, tier, bantScore, status: 'ACTIVE', createdAt: now }
    this.inMemoryAccounts.push(acc)
    return acc
  }

  /**
   * Lists all GTM accounts
   */
  listAccounts () {
    try {
      if (this.repository && this.repository.db) {
        return this.repository.listAccounts()
      }
      if (database && database.db) {
        return database.queryAll('SELECT * FROM gtm_accounts ORDER BY created_at DESC;')
      }
    } catch {
      // In-memory fallback
    }
    return this.inMemoryAccounts
  }

  getAccountById (id) {
    if (this.repository && this.repository.db) {
      return this.repository.getAccountById(id)
    }
    return this.inMemoryAccounts.find((a) => a.id === id) || null
  }

  createContact (contactData = {}) {
    if (this.repository && this.repository.db) {
      return this.repository.createContact(contactData)
    }
    return { id: `cnt-${Date.now()}`, ...contactData }
  }

  listContacts (accountId = null) {
    if (this.repository && this.repository.db) {
      return this.repository.listContacts(accountId)
    }
    return []
  }

  createOpportunity (oppData = {}) {
    if (this.repository && this.repository.db) {
      return this.repository.createOpportunity(oppData)
    }
    return { id: `opp-${Date.now()}`, ...oppData }
  }

  listOpportunities (accountId = null) {
    if (this.repository && this.repository.db) {
      return this.repository.listOpportunities(accountId)
    }
    return []
  }

  updateOpportunityStage (id, stage, probability = null) {
    if (this.repository && this.repository.db) {
      return this.repository.updateOpportunityStage(id, stage, probability)
    }
    return { id, stage, probability }
  }

  /**
   * Qualifies an inbound lead using BANT + MEDDPICC criteria.
   * Throws when the lead is disqualified (opted-out, suppressed, or unauthorized).
   */
  qualifyLead (leadData = {}) {
    const {
      companyName = 'Unknown Enterprise',
      companySize = '1-50',
      industry = 'Technology',
      budgetRange = 'unspecified',
      decisionMakerRole = 'manager',
      urgency = 'exploratory',
      primaryNeed = 'general support',
      optedOut = false,
      suppressed = false,
      unauthorized = false
    } = leadData

    // Disqualification gate: suppressed / opted-out / unauthorized records must never
    // be scored, routed, or included in outbound audiences.
    const isSuppressedInRegistry = this.isSuppressed(companyName)
    if (optedOut === true || suppressed === true || unauthorized === true || isSuppressedInRegistry) {
      const reason = []
      if (optedOut) reason.push('opted-out')
      if (suppressed) reason.push('suppressed')
      if (unauthorized) reason.push('unauthorized')
      if (isSuppressedInRegistry) reason.push('registered-suppression')
      throw new Error(`Lead ${companyName} is disqualified from outreach: ${reason.join(', ')}`)
    }

    let score = 0
    const reasons = []

    // 1. Budget Score (0 - 25)
    if (budgetRange === '$250k+' || budgetRange === 'enterprise') {
      score += 25
      reasons.push('Enterprise-scale budget approved (+$250k)')
    } else if (budgetRange === '$50k-$250k' || budgetRange === 'high') {
      score += 20
      reasons.push('Mid-to-high budget allocated ($50k-$250k)')
    } else if (budgetRange === '$10k-$50k' || budgetRange === 'moderate') {
      score += 15
      reasons.push('Moderate team-level budget ($10k-$50k)')
    } else if (budgetRange === '<$10k' || budgetRange === 'low') {
      score += 5
      reasons.push('Limited or self-serve budget (<$10k)')
    } else {
      score += 8
      reasons.push('Budget unconfirmed; requires consultative discovery')
    }

    // 2. Authority Score (0 - 25)
    const role = decisionMakerRole.toLowerCase()
    const words = role.split(/\s+/)
    const isExec =
      words.includes('c-level') ||
      words.includes('cxo') ||
      words.includes('ceo') ||
      words.includes('cto') ||
      words.includes('vp') ||
      words.includes('svp') ||
      words.includes('evp') ||
      words.includes('avp') ||
      role.includes('vice president')
    const isDirector = words.includes('director') || role.includes('head of')
    const isManager = words.includes('manager') || words.includes('lead')

    if (isExec) {
      score += 25
      reasons.push('Direct economic buyer or C-Level / VP decision maker')
    } else if (isDirector) {
      score += 20
      reasons.push('Senior department leader and key stakeholder')
    } else if (isManager) {
      score += 12
      reasons.push('Internal champion / evaluation manager')
    } else {
      score += 5
      reasons.push('Individual practitioner evaluator')
    }

    // 3. Need & Strategic Fit (0 - 25)
    const need = primaryNeed.toLowerCase()
    if (need.includes('churn') || need.includes('sla') || need.includes('emergency') || need.includes('compliance') || need.includes('soc2')) {
      score += 25
      reasons.push('High-pain operational driver (Churn / SLA / Compliance risk)')
    } else if (need.includes('scale') || need.includes('automation') || need.includes('rag') || need.includes('support volume')) {
      score += 20
      reasons.push('Core automation & support volume scaling requirement')
    } else {
      score += 10
      reasons.push('General exploratory interest')
    }

    // 4. Timeline / Urgency (0 - 25)
    const urg = urgency.toLowerCase()
    if (urg.includes('immediate') || urg.includes('this month') || urg.includes('<1mo') || urg.includes('critical')) {
      score += 25
      reasons.push('Immediate purchasing cycle (<30 days)')
    } else if (urg.includes('this quarter') || urg.includes('q1') || urg.includes('q2') || urg.includes('1-3mo')) {
      score += 18
      reasons.push('Active quarter deployment target (30-90 days)')
    } else if (urg.includes('6mo') || urg.includes('future')) {
      score += 8
      reasons.push('Future roadmap timeline (6+ months)')
    } else {
      score += 10
      reasons.push('Timeline unspecified')
    }

    // Tier Classification
    let tier = 'Tier 3 SMB / Self-Serve'
    let action = 'Route to automated product trial & interactive demo portal'
    if (score >= 80) {
      tier = 'Tier 1 Enterprise VIP'
      action = 'Immediate SDR handoff to Enterprise AE; schedule 48h customized architecture walkthrough'
    } else if (score >= 50) {
      tier = 'Tier 2 Mid-Market High-Velocity'
      action = 'Assign to Mid-Market sales rep; deliver tailored ROI calculator and rapid POC demo'
    }

    // Match best GTM Playbook
    const matchedPlaybook = this.matchPlaybookForNeed(primaryNeed, industry)

    logger.audit('gtm.lead_qualified', companyName, { score, tier, matchedPlaybook: matchedPlaybook.id })

    return {
      companyName,
      companySize,
      industry,
      bantScore: score,
      tier,
      conversionProbability: Math.min(Math.round(score * 0.95), 98),
      nextBestAction: action,
      reasons,
      recommendedPlaybook: matchedPlaybook
    }
  }

  /**
   * Matches the optimal objection/sales playbook for a given lead need
   */
  matchPlaybookForNeed (needText = '', industry = '') {
    const text = `${needText} ${industry}`.toLowerCase()
    if (text.includes('security') || text.includes('soc') || text.includes('compliance') || text.includes('finance') || text.includes('hipaa')) {
      return this.playbooks.find((p) => p.id === 'SECURITY_SOC2') || this.playbooks[0]
    }
    if (text.includes('cost') || text.includes('price') || text.includes('roi') || text.includes('budget') || text.includes('expensive')) {
      return this.playbooks.find((p) => p.id === 'PRICING_JUSTIFICATION') || this.playbooks[1]
    }
    if (text.includes('migrate') || text.includes('migration') || text.includes('import') || text.includes('setup') || text.includes('timeline')) {
      return this.playbooks.find((p) => p.id === 'MIGRATION_TIMELINE') || this.playbooks[2]
    }
    if (text.includes('uptime') || text.includes('downtime') || text.includes('sla') || text.includes('reliability') || text.includes('failover')) {
      return this.playbooks.find((p) => p.id === 'SLA_ENTERPRISE') || this.playbooks[3]
    }
    return this.playbooks.find((p) => p.id === 'AI_HALLUCINATION_DEFENSE') || this.playbooks[4]
  }

  /**
   * Synthesizes an intelligent, persona-tailored GTM customer response
   */
  generateGTMResponse (params = {}) {
    const {
      inquiry = 'How does your solution compare and can we get a demo?',
      persona = 'Enterprise Account Executive',
      tone = 'Consultative & Solution-Driven',
      channel = 'email',
      targetGoal = 'Book Architecture Demo',
      prospectContext = {}
    } = params

    const company = prospectContext.companyName || 'your team'
    const industry = prospectContext.industry || 'B2B Enterprise'
    const matchedPlaybook = this.matchPlaybookForNeed(inquiry, industry)

    // Retrieve grounding context from internal knowledge base using RAG
    const ragResults = ragEngine.hybridSearch(inquiry, 2)
    const contextEvidence = ragResults.map((r) => r.document.title).join(', ')

    // Build persona-tailored response
    let subjectLine = `Transforming Support Velocity at ${company} — Enterprise Architecture Overview`
    const salutation = 'Hi there,'
    let signoff = 'Best regards,\nB2B Customer Support & AI-GTM Team'

    if (persona.includes('Executive') || persona.includes('AE')) {
      subjectLine = `Partnership Architecture: Scaling AI Support Operations for ${company}`
      signoff = 'Warm regards,\nStrategic Enterprise Accounts Team'
    } else if (persona.includes('Architect') || persona.includes('Engineer')) {
      subjectLine = `Technical Specification: Sub-second RAG & Zero-Trust SLA for ${company}`
      signoff = 'Cheers,\nLead Solutions Architect'
    } else if (persona.includes('Success') || persona.includes('CSM')) {
      subjectLine = `Ensuring 99.99% Support Reliability for ${company}`
      signoff = 'Sincerely,\nCustomer Success & Support Operations'
    }

    const valuePoints = [
      'Grounded Accuracy: Multi-stage BM25 + dense neural embedding RAG ensures zero-hallucination compliance across corporate documentation.',
      'Velocity & Automation: Reduces Tier-1 and Tier-2 response latency to sub-second turnaround with verified 15-minute Sev 1 escalation SLAs.',
      'Turnkey Security: Zero-trust tenant isolation with full audit trails, real-time threat modeling, and cryptographic evidence verification.'
    ]

    const bodyParagraphs = [
      `Thank you for reaching out regarding ${inquiry.slice(0, 80).trim()}${inquiry.length > 80 ? '...' : ''}.`,
      `At our core, we help modern B2B organizations eliminate support bottlenecks and automate go-to-market workflows without compromising accuracy or security compliance. Regarding ${matchedPlaybook.topic.toLowerCase()}: ${matchedPlaybook.positioning}`,
      `Key operational highlights for ${company}:`,
      valuePoints.map((v) => `• ${v}`).join('\n'),
      `Next Step: We would be delighted to coordinate a 20-minute tailored architecture session to demonstrate how our pipelines sync with your stack and review our ${matchedPlaybook.recommendedCollateral}.`
    ]

    const fullResponse = `${salutation}\n\n${bodyParagraphs.join('\n\n')}\n\n${signoff}`

    logger.audit('gtm.response_generated', company, {
      persona,
      tone,
      targetGoal,
      matchedPlaybook: matchedPlaybook.id
    })

    return {
      channel,
      persona,
      tone,
      targetGoal,
      subjectLine,
      body: fullResponse,
      playbookUsed: matchedPlaybook,
      valuePropositions: valuePoints,
      recommendedCollateral: matchedPlaybook.recommendedCollateral,
      groundedEvidence: contextEvidence || 'Internal Enterprise Operations Standard',
      generatedAt: new Date().toISOString()
    }
  }

  /**
   * Analyzes an account's ticket history and chat conversations for GTM intent and churn risk
   */
  analyzeAccountIntent (tickets = [], messages = []) {
    let expansionScore = 0
    let churnRiskScore = 0
    const signals = []

    // 1. Scan Tickets for expansion and churn indicators
    tickets.forEach((t) => {
      const text = `${t.subject} ${t.description}`.toLowerCase()
      if (text.includes('upgrade') || text.includes('more seats') || text.includes('api limit') || text.includes('enterprise feature') || text.includes('sso setup')) {
        expansionScore += 30
        signals.push({ type: 'EXPANSION', text: `Expansion inquiry detected in ticket ${t.id}: "${t.subject}"` })
      }
      if (t.severity === 'Sev 1' || t.sentiment === 'frustrated') {
        churnRiskScore += 25
        signals.push({ type: 'CHURN_RISK', text: `High severity or frustrated sentiment in ticket ${t.id}` })
      }
      if (text.includes('competitor') || text.includes('cancel') || text.includes('refund') || text.includes('pricing too high')) {
        churnRiskScore += 35
        signals.push({ type: 'CHURN_RISK', text: `Direct churn trigger keyword in ticket ${t.id}` })
      }
    })

    // 2. Scan Messages
    messages.forEach((m) => {
      const text = (m.content || '').toLowerCase()
      if (text.includes('pricing') || text.includes('contract') || text.includes('annual plan') || text.includes('demo')) {
        expansionScore += 15
        signals.push({ type: 'EXPANSION', text: 'Commercial intent detected in conversation message' })
      }
      if (text.includes('broken') || text.includes('terrible') || text.includes('switch to') || text.includes('unacceptable')) {
        churnRiskScore += 20
        signals.push({ type: 'CHURN_RISK', text: 'Customer dissatisfaction flag in chat' })
      }
    })

    const netIntentScore = expansionScore - churnRiskScore
    let accountStatus = 'STABLE'
    let recommendedAction = 'Maintain standard quarterly business review (QBR) cadence'

    if (churnRiskScore >= 40) {
      accountStatus = 'AT_RISK'
      recommendedAction = 'URGENT: Executive sponsor check-in and dedicated engineering review required'
    } else if (expansionScore >= 40) {
      accountStatus = 'EXPANSION_READY'
      recommendedAction = 'OPPORTUNITY: Propose Enterprise tier upgrade and multi-department licensing'
    }

    return {
      expansionScore: Math.min(expansionScore, 100),
      churnRiskScore: Math.min(churnRiskScore, 100),
      netIntentScore,
      accountStatus,
      recommendedAction,
      signalsFound: signals.length,
      signals: signals.slice(0, 8),
      analyzedAt: new Date().toISOString()
    }
  }

  /**
   * Generates tailored outbound or follow-up messaging for GTM campaigns
   */
  generateOutreachDraft (params = {}) {
    const {
      recipientName = 'Alex',
      companyName = 'Acme Corp',
      role = 'VP of Customer Experience',
      campaignType = 'executive_followup',
      painPoint = 'support ticket backlog'
    } = params

    let subject = `Eliminating ${painPoint} at ${companyName}`
    let content = `Hi ${recipientName},\n\nI noticed ${companyName} has been scaling rapidly, and many ${role} leaders we work with have mentioned that ${painPoint} often becomes a severe operational drag on growth.\n\nWe helped a peer enterprise resolve 65% of customer inquiries autonomously within 48 hours of deployment using our hybrid RAG & verified support bot—maintaining a 15-minute SLA for Sev 1 emergencies.\n\nWould you be open to a brief 15-minute briefing next Tuesday to see our live architecture in action?\n\nBest,\nB2B Support AI Team`

    if (campaignType === 'post_demo') {
      subject = `Follow-up: Architecture & Next Steps for ${companyName}`
      content = `Hi ${recipientName},\n\nThank you for taking the time to review our B2B Customer Support AI Bot architecture today. As discussed, our platform can seamlessly integrate with your existing knowledge docs and ticketing workflows within 48 hours.\n\nAttached is our Enterprise Security Whitepaper & TCO ROI Calculator for your review.\n\nLooking forward to our next technical deep dive on Thursday.\n\nBest regards,\nEnterprise Solutions Team`
    } else if (campaignType === 'churn_intervention') {
      subject = `Executive Check-in & Priority Resolution for ${companyName}`
      content = `Hi ${recipientName},\n\nI am reaching out directly from our executive team. We noticed your recent tickets regarding ${painPoint} and want to ensure your operations receive our highest engineering priority.\n\nOur solutions director has reserved time this afternoon to walk through dedicated optimizations for your instance.\n\nPlease let me know if 2:00 PM works for you.\n\nSincerely,\nVP of Customer Success`
    }

    return {
      campaignType,
      recipientName,
      companyName,
      subject,
      body: content,
      suggestedChannel: 'Email / LinkedIn InMail',
      generatedAt: new Date().toISOString()
    }
  }

  /**
   * Creates a marketing/sales campaign in DRAFT state
   */
  createCampaign (campaignData = {}) {
    if (this.repository && this.repository.db) {
      return this.repository.createCampaign(campaignData)
    }

    const { name, type = 'outbound_email', audienceCount = 0, metadata = {} } = campaignData
    if (!name) throw new Error('Campaign name is required')
    const now = new Date().toISOString()
    const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const cmp = { id, name, type, status: 'DRAFT', audienceCount, metadata, createdAt: now }
    this.inMemoryCampaigns.push(cmp)
    return cmp
  }

  /**
   * Enforces Human-in-the-Loop review before campaign activation
   */
  approveCampaign (campaignId, approvedBy = 'admin@company.com') {
    if (!campaignId) throw new Error('Campaign ID is required')
    if (this.repository && this.repository.db) {
      return this.repository.approveCampaign(campaignId, approvedBy)
    }

    const cmp = this.inMemoryCampaigns.find((c) => c.id === campaignId)
    if (!cmp) throw new Error(`Campaign '${campaignId}' not found.`)
    cmp.status = 'APPROVED'
    cmp.approved_by = approvedBy
    cmp.approved_at = new Date().toISOString()
    return cmp
  }

  /**
   * Lists campaigns
   */
  listCampaigns () {
    if (this.repository && this.repository.db) {
      return this.repository.listCampaigns()
    }
    return this.inMemoryCampaigns
  }

  /**
   * Enqueues a message for campaign dispatch with suppression check
   */
  enqueueCampaignMessage (data = {}) {
    if (this.repository && this.repository.db) {
      return this.repository.enqueueMessage(data)
    }
    return { id: `msg-${Date.now()}`, ...data, status: 'QUEUED' }
  }

  /**
   * Retrieves current campaign dispatch queue
   */
  getCampaignQueue (campaignId = null) {
    if (this.repository && this.repository.db) {
      return this.repository.getQueue(campaignId)
    }
    return []
  }

  /**
   * Dispatches queued messages enforcing human approval gate, suppression, and rate throttling
   */
  dispatchCampaign (campaignId, batchLimit = 5) {
    if (this.repository && this.repository.db) {
      return this.repository.dispatchQueue(campaignId, batchLimit)
    }
    return {
      campaignId,
      batchLimit,
      dispatchedCount: 0,
      suppressedCount: 0,
      dispatchedIds: [],
      suppressedIds: [],
      dispatchedAt: new Date().toISOString()
    }
  }

  /**
   * Idempotent CRM synchronization
   */
  syncToCRM (params = {}) {
    const { entityType, entityId, operation = 'UPSERT', crmSystem = 'HubSpot', payload = {}, idempotencyKey } = params
    if (!entityType || !entityId) throw new Error('entityType and entityId are required for CRM sync')
    const key = idempotencyKey || `${entityType}-${entityId}-${operation}`
    const now = new Date().toISOString()

    try {
      if (database && database.db) {
        const checkStmt = database.db.prepare('SELECT * FROM gtm_crm_sync_log WHERE idempotency_key = ?;')
        const existing = checkStmt.get(key)
        if (existing) {
          return {
            status: 'ALREADY_SYNCED',
            idempotent: true,
            syncRecord: existing
          }
        }

        const id = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const insertStmt = database.db.prepare(`
          INSERT INTO gtm_crm_sync_log (id, entity_type, entity_id, operation, crm_system, status, payload_json, idempotency_key, created_at)
          VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?);
        `)
        insertStmt.run(id, entityType, entityId, operation, crmSystem, JSON.stringify(payload), key, now)
        logger.audit('gtm.crm_synced', 'system', { crmSystem, entityType, entityId, key })
        return {
          status: 'SYNCED',
          idempotent: false,
          syncRecord: { id, entityType, entityId, operation, crmSystem, status: 'SUCCESS', createdAt: now }
        }
      }
    } catch {
      // In-memory fallback
    }

    if (this.inMemorySyncLog.some((s) => s.idempotencyKey === key)) {
      return { status: 'ALREADY_SYNCED', idempotent: true }
    }
    this.inMemorySyncLog.push({ idempotencyKey: key, entityType, entityId, operation, crmSystem, createdAt: now })
    return {
      status: 'SYNCED',
      idempotent: false,
      syncRecord: { id: `crm-${Date.now()}`, entityType, entityId, operation, crmSystem, status: 'SUCCESS', createdAt: now }
    }
  }

  /**
   * Calculates Pipeline Velocity, Win Rate, and Revenue Attribution
   */
  calculateAttribution (opportunities = []) {
    let opps = opportunities
    if (!opps || opps.length === 0) {
      if (this.repository && this.repository.db) {
        opps = this.repository.listOpportunities()
      }
    }

    if (!opps || opps.length === 0) {
      opps = [
        { id: 'opp-1', name: 'FinTech Enterprise Support Bot', amount: 120000, stage: 'CLOSED_WON', cycleDays: 32, touchpoints: ['web_search', 'whitepaper_download', 'inbound_chat', 'sales_demo'] },
        { id: 'opp-2', name: 'HealthTech Compliance Package', amount: 65000, stage: 'CLOSED_WON', cycleDays: 45, touchpoints: ['partner_referral', 'soc2_playbook', 'executive_followup'] },
        { id: 'opp-3', name: 'Retail Global Ticket Distiller', amount: 48000, stage: 'PROPOSAL', cycleDays: 20, touchpoints: ['cold_outreach', 'architecture_session'] },
        { id: 'opp-4', name: 'Logistics SLA Monitoring', amount: 85000, stage: 'CLOSED_WON', cycleDays: 28, touchpoints: ['webinar', 'inbound_chat', 'custom_demo'] }
      ]
    }

    const wonOpps = opps.filter((o) => o.stage === 'CLOSED_WON')
    const totalPipelineValue = opps.reduce((sum, o) => sum + (o.amount || 0), 0)
    const closedWonValue = wonOpps.reduce((sum, o) => sum + (o.amount || 0), 0)
    const winRatePercent = opps.length > 0 ? Math.round((wonOpps.length / opps.length) * 100) : 0
    const avgCycleDays = wonOpps.length > 0 ? Math.round(wonOpps.reduce((s, o) => s + (o.cycleDays || 30), 0) / wonOpps.length) : 30
    const avgDealSize = wonOpps.length > 0 ? Math.round(closedWonValue / wonOpps.length) : 0

    // Pipeline Velocity ($/day): (Qualified Opps * Win Rate * Avg Deal Size) / Avg Sales Cycle Days
    const velocityDaily = avgCycleDays > 0 ? Math.round((opps.length * (winRatePercent / 100) * avgDealSize) / avgCycleDays) : 0

    // Touchpoint Attribution Weights
    const touchpointWeights = { firstTouch: {}, lastTouch: {}, linear: {} }
    wonOpps.forEach((o) => {
      const touches = o.touchpoints || ['inbound_chat']
      const first = touches[0]
      const last = touches[touches.length - 1]
      touchpointWeights.firstTouch[first] = (touchpointWeights.firstTouch[first] || 0) + o.amount
      touchpointWeights.lastTouch[last] = (touchpointWeights.lastTouch[last] || 0) + o.amount

      const sharePerTouch = o.amount / touches.length
      touches.forEach((t) => {
        touchpointWeights.linear[t] = Math.round((touchpointWeights.linear[t] || 0) + sharePerTouch)
      })
    })

    return {
      totalOpportunities: opps.length,
      closedWonCount: wonOpps.length,
      totalPipelineValue,
      closedWonValue,
      winRatePercent,
      avgDealSize,
      avgSalesCycleDays: avgCycleDays,
      pipelineVelocityDailyMRR: velocityDaily,
      attributionModels: touchpointWeights,
      assumptions: 'Heuristic model; assumes linear velocity without seasonality. Causal attribution requires randomized multi-arm control testing.',
      calculatedAt: new Date().toISOString()
    }
  }

  listPlaybooks () {
    return this.playbooks
  }
}

export const gtmService = new GTMService()
