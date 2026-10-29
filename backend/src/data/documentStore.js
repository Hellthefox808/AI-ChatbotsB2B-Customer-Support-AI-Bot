export const DOCUMENTS = [
  {
    id: 'doc-1',
    title: 'Password Reset & Account Recovery Policy',
    category: 'security',
    content:
      'Employees can reset their corporate passwords via the self-service portal at portal.company.com/password. If the portal is unreachable, contact the IT helpdesk at helpdesk@company.com or internal extension 4357. Passwords must be at least 12 characters, including uppercase, lowercase, numbers, and symbols. Recovery links expire in 24 hours. Accounts lock automatically after 5 failed attempts.',
    keywords: ['password', 'reset', 'portal', 'helpdesk', 'security', 'recovery', 'lockout', 'credentials']
  },
  {
    id: 'doc-2',
    title: 'Secure Remote Work & VPN Access Guide',
    category: 'it',
    content:
      'To connect to internal services remotely, install the Cisco AnyConnect or WireGuard VPN client and connect to vpn.company.com using your SSO credentials. Hardware or app-based two-factor authentication (TOTP or FIDO2) is strictly mandatory. Split tunneling is enabled by default for video calls. Report VPN disconnection issues to extension 4357.',
    keywords: ['vpn', 'remote', 'anyconnect', 'wireguard', 'sso', 'mfa', 'two-factor', 'network']
  },
  {
    id: 'doc-3',
    title: 'Corporate Expense Reimbursement Procedure',
    category: 'finance',
    content:
      'Submit expense reports through the Concur portal within 30 days of incurring the business expense. Digital receipts are required for all transactions over $25. Approvals route to your direct manager and the central finance team. Approved reimbursements are processed bi-weekly on Fridays via direct deposit. Travel per-diem is capped at $75 per day.',
    keywords: ['expense', 'reimbursement', 'concur', 'receipt', 'finance', 'approval', 'travel', 'per-diem']
  },
  {
    id: 'doc-4',
    title: 'Leave, Sick Days, and PTO Policy',
    category: 'hr',
    content:
      'Employees accrue 15 business days of paid time off (PTO) annually, prorated for partial years of service. Time-off requests must be submitted through Workday at least 5 business days in advance. Up to 5 unused PTO days can be rolled over into the next calendar year. Sick leave is separate (up to 10 days) and does not require advance notice, but notify your manager before 9:00 AM.',
    keywords: ['pto', 'leave', 'vacation', 'workday', 'hr', 'sick', 'time off', 'holiday', 'rollover']
  },
  {
    id: 'doc-5',
    title: 'New Hire Onboarding & Equipment Provisioning',
    category: 'hr',
    content:
      'All new team members complete onboarding on day one: configuring Google Workspace/Slack, benefits election in Workday, and completing required security compliance training. IT provisions laptops (MacBook Pro or ThinkPad) and security badges within 24 hours of hire date. Each new hire is assigned an onboarding buddy for their first 90 days.',
    keywords: ['onboarding', 'new hire', 'benefits', 'equipment', 'training', 'laptop', 'hr', 'badge']
  },
  {
    id: 'doc-6',
    title: 'IT Support Service Level Agreements & Contact Channels',
    category: 'it',
    content:
      'IT Helpdesk standard operating hours are Monday through Friday, 8:00 AM - 6:00 PM ET. Contact helpdesk@company.com or call extension 4357. Tickets are prioritized by severity: Sev 1 (Critical outage, all hands) has a 15-minute response SLA; Sev 2 (High impact, multiple users) 2 hours; Sev 3 (Medium impact) 8 hours; Sev 4 (Low request) 24 hours. Critical Sev 1 outages can be escalated 24/7 via extension 9111.',
    keywords: ['it support', 'helpdesk', 'sla', 'severity', 'outage', 'ticket', 'escalation', 'emergency']
  },
  {
    id: 'doc-7',
    title: 'Data Privacy, GDPR, and SOC2 Compliance Standards',
    category: 'security',
    content:
      'All customer and proprietary data must remain stored in encrypted databases (AES-256 at rest, TLS 1.3 in transit). Access is strictly governed by least-privilege RBAC and audited quarterly. Sharing customer PII with third parties requires explicit written sign-off from Legal and Security. Report suspected data breaches immediately to security@company.com.',
    keywords: ['privacy', 'compliance', 'gdpr', 'soc2', 'data', 'encryption', 'legal', 'audit', 'breach']
  },
  {
    id: 'doc-8',
    title: 'Hardware Procurement & Software Licensing Requests',
    category: 'it',
    content:
      'Request developer software licenses or peripheral hardware via the IT Service Catalog at catalog.company.com. Standard approved catalog items are provisioned within 5 business days. Non-standard hardware or SaaS subscriptions require department director approval and cost-center allocation verification.',
    keywords: ['software', 'hardware', 'request', 'catalog', 'procurement', 'license', 'saas']
  }
]

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'do', 'can',
  'i', 'my', 'we', 'our', 'you', 'your'
])

function tokenize (text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
}

export const getDocumentById = (id) => DOCUMENTS.find((d) => d.id === id)

/**
 * Enhanced TF-IDF style semantic ranking for local RAG retrieval
 */
export const searchDocuments = (query, limit = 4) => {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const totalDocs = DOCUMENTS.length
  // Calculate document frequencies
  const docFreq = {}
  DOCUMENTS.forEach((doc) => {
    const docText = `${doc.title} ${doc.content} ${doc.keywords.join(' ')}`
    const uniqueTokens = new Set(tokenize(docText))
    uniqueTokens.forEach((token) => {
      docFreq[token] = (docFreq[token] || 0) + 1
    })
  })

  const scoredDocs = DOCUMENTS.map((doc) => {
    const docTokens = tokenize(`${doc.title} ${doc.title} ${doc.content} ${doc.keywords.join(' ')}`)
    const titleTokens = new Set(tokenize(doc.title))
    const keywordTokens = new Set(doc.keywords.map((k) => k.toLowerCase()))

    // Token frequency count in document
    const termCounts = {}
    docTokens.forEach((t) => {
      termCounts[t] = (termCounts[t] || 0) + 1
    })

    let score = 0
    queryTokens.forEach((qToken) => {
      const tf = (termCounts[qToken] || 0) / (docTokens.length || 1)
      const df = docFreq[qToken] || 1
      const idf = Math.log(1 + totalDocs / df)

      let termScore = tf * idf * 10

      // Boost title and keyword matches
      if (titleTokens.has(qToken)) termScore += 2.5
      if (keywordTokens.has(qToken)) termScore += 1.8

      score += termScore
    })

    // Normalize confidence roughly between 0.0 and 1.0
    const confidence = Math.min(Number((score / (queryTokens.length * 2.2)).toFixed(2)), 0.98)

    return {
      document: doc,
      score: Number(score.toFixed(3)),
      confidence: Math.max(confidence, 0.05)
    }
  })
    .filter((item) => item.score > 0.1)
    .sort((a, b) => b.score - a.score)

  return scoredDocs.slice(0, limit)
}
