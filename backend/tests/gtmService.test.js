import test from 'node:test'
import assert from 'node:assert/strict'
import { GTMService, gtmService } from '../src/service/gtmService.js'

test('GTMService: qualifyLead returns Tier 1 for enterprise lead', () => {
  const service = new GTMService()
  const result = service.qualifyLead({
    companyName: 'Acme Corp',
    companySize: '1000+',
    industry: 'Finance',
    budgetRange: '$250k+',
    decisionMakerRole: 'VP of Engineering',
    urgency: 'this month',
    primaryNeed: 'compliance soc2'
  })

  assert.equal(result.companyName, 'Acme Corp')
  assert.equal(result.tier, 'Tier 1 Enterprise VIP')
  assert.ok(result.bantScore >= 80)
  assert.ok(result.conversionProbability <= 98)
  assert.ok(result.nextBestAction.includes('Immediate SDR handoff'))
  assert.ok(Array.isArray(result.reasons))
  assert.ok(result.recommendedPlaybook.id)
})

test('GTMService: qualifyLead returns Tier 2 for mid-market lead', () => {
  const service = new GTMService()
  const result = service.qualifyLead({
    companyName: 'MidCo',
    companySize: '51-200',
    industry: 'Technology',
    budgetRange: '$50k-$250k',
    decisionMakerRole: 'director',
    urgency: 'this quarter',
    primaryNeed: 'scale automation'
  })

  assert.equal(result.tier, 'Tier 2 Mid-Market High-Velocity')
  assert.ok(result.bantScore >= 50)
  assert.ok(result.bantScore < 80)
  assert.ok(result.nextBestAction.includes('Assign to Mid-Market sales rep'))
})

test('GTMService: qualifyLead returns Tier 3 for low-scoring lead', () => {
  const service = new GTMService()
  const result = service.qualifyLead({
    companyName: 'SmallCo',
    companySize: '1-50',
    industry: 'Retail',
    budgetRange: '<$10k',
    decisionMakerRole: 'manager',
    urgency: 'future',
    primaryNeed: 'general support'
  })

  assert.equal(result.tier, 'Tier 3 SMB / Self-Serve')
  assert.ok(result.bantScore < 50)
  assert.ok(result.nextBestAction.includes('automated product trial'))
})

test('GTMService: qualifyLead applies defaults for missing fields', () => {
  const service = new GTMService()
  const result = service.qualifyLead({})

  assert.equal(result.companyName, 'Unknown Enterprise')
  assert.equal(result.companySize, '1-50')
  assert.equal(result.industry, 'Technology')
  assert.equal(result.reasons.length, 4)
})

test('GTMService: qualifyLead conversionProbability is score * 0.95 and clamps at 98', () => {
  const service = new GTMService()
  const result = service.qualifyLead({
    companyName: 'TopCo',
    companySize: '1000+',
    industry: 'Finance',
    budgetRange: '$250k+',
    decisionMakerRole: 'CEO',
    urgency: 'immediate',
    primaryNeed: 'churn'
  })

  assert.ok(result.bantScore === 100)
  assert.equal(result.conversionProbability, 95)
  assert.ok(result.conversionProbability <= 98)
})

test('GTMService: qualifyLead rejects opted-out lead', () => {
  const service = new GTMService()
  assert.throws(
    () => service.qualifyLead({
      companyName: 'OptedOut Co',
      companySize: '51-200',
      industry: 'Technology',
      budgetRange: '$250k+',
      decisionMakerRole: 'VP',
      urgency: 'immediate',
      primaryNeed: 'compliance',
      optedOut: true
    }),
    /disqualified|opted|suppressed|unauthorized/i
  )
})

test('GTMService: matchPlaybookForNeed routes security to SECURITY_SOC2', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('SOC-2 compliance audit needed', 'Finance')
  assert.equal(playbook.id, 'SECURITY_SOC2')
})

test('GTMService: matchPlaybookForNeed routes pricing to PRICING_JUSTIFICATION', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('your platform is expensive', 'Technology')
  assert.equal(playbook.id, 'PRICING_JUSTIFICATION')
})

test('GTMService: matchPlaybookForNeed routes migration to MIGRATION_TIMELINE', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('migrate 50000 confluence docs', 'Technology')
  assert.equal(playbook.id, 'MIGRATION_TIMELINE')
})

test('GTMService: matchPlaybookForNeed routes uptime to SLA_ENTERPRISE', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('uptime guarantee during quarter-end', 'Technology')
  assert.equal(playbook.id, 'SLA_ENTERPRISE')
})

test('GTMService: matchPlaybookForNeed routes hallucination to AI_HALLUCINATION_DEFENSE', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('how do you prevent hallucinations', 'Technology')
  assert.equal(playbook.id, 'AI_HALLUCINATION_DEFENSE')
})

test('GTMService: matchPlaybookForNeed defaults to AI_HALLUCINATION_DEFENSE for unknown need', () => {
  const service = new GTMService()
  const playbook = service.matchPlaybookForNeed('something unrelated', 'Retail')
  assert.equal(playbook.id, 'AI_HALLUCINATION_DEFENSE')
})

test('GTMService: listPlaybooks returns all five playbooks', () => {
  const service = new GTMService()
  const playbooks = service.listPlaybooks()
  assert.equal(playbooks.length, 5)
  assert.ok(playbooks.some((p) => p.id === 'SECURITY_SOC2'))
  assert.ok(playbooks.some((p) => p.id === 'PRICING_JUSTIFICATION'))
  assert.ok(playbooks.some((p) => p.id === 'MIGRATION_TIMELINE'))
  assert.ok(playbooks.some((p) => p.id === 'SLA_ENTERPRISE'))
  assert.ok(playbooks.some((p) => p.id === 'AI_HALLUCINATION_DEFENSE'))
})

test('GTMService: generateGTMResponse tailors subject line by persona', () => {
  const service = new GTMService()
  const exec = service.generateGTMResponse({
    inquiry: 'demo',
    persona: 'Enterprise Account Executive',
    prospectContext: { companyName: 'Acme', industry: 'Finance' }
  })
  assert.ok(exec.subjectLine.includes('Acme'))

  const eng = service.generateGTMResponse({
    inquiry: 'demo',
    persona: 'Solutions Architect',
    prospectContext: { companyName: 'Acme', industry: 'Finance' }
  })
  assert.ok(eng.subjectLine.includes('Technical Specification'))
})

test('GTMService: generateGTMResponse returns populated fields', () => {
  const service = new GTMService()
  const result = service.generateGTMResponse({
    inquiry: 'soc2 compliance',
    persona: 'CISO',
    prospectContext: { companyName: 'Acme', industry: 'Finance' }
  })

  assert.ok(result.body)
  assert.ok(result.subjectLine)
  assert.ok(result.playbookUsed)
  assert.ok(result.playbookUsed.id)
  assert.ok(result.valuePropositions)
  assert.ok(result.generatedAt)
  assert.equal(result.channel, 'email')
})

test('GTMService: analyzeAccountIntent flags expansion signals', () => {
  const service = new GTMService()
  const result = service.analyzeAccountIntent(
    [{ id: 't-1', subject: 'SSO setup request', description: 'need enterprise sso', severity: 'Sev 3', sentiment: 'neutral' }],
    []
  )

  assert.equal(result.expansionScore, 30)
  assert.equal(result.churnRiskScore, 0)
  // Single expansion ticket (30) is below the EXPANSION_READY threshold (40)
  assert.equal(result.accountStatus, 'STABLE')
  assert.ok(result.signals.some((s) => s.type === 'EXPANSION'))
})

test('GTMService: analyzeAccountIntent reaches EXPANSION_READY above threshold', () => {
  const service = new GTMService()
  const result = service.analyzeAccountIntent(
    [
      { id: 't-1', subject: 'SSO setup request', description: 'need enterprise sso', severity: 'Sev 3', sentiment: 'neutral' },
      { id: 't-2', subject: 'more seats and api limit increase', description: 'enterprise feature request', severity: 'Sev 4', sentiment: 'neutral' }
    ],
    []
  )

  assert.equal(result.accountStatus, 'EXPANSION_READY')
  assert.ok(result.expansionScore >= 40)
  assert.ok(result.signals.some((s) => s.type === 'EXPANSION'))
})

test('GTMService: analyzeAccountIntent flags churn risk', () => {
  const service = new GTMService()
  const result = service.analyzeAccountIntent(
    [{ id: 't-2', subject: 'cancel contract', description: 'pricing too high competitor', severity: 'Sev 1', sentiment: 'frustrated' }],
    []
  )

  assert.equal(result.accountStatus, 'AT_RISK')
  assert.ok(result.churnRiskScore >= 40)
  assert.ok(result.signals.some((s) => s.type === 'CHURN_RISK'))
})

test('GTMService: analyzeAccountIntent clamps scores at 100', () => {
  const service = new GTMService()
  const tickets = Array.from({ length: 20 }, (_, i) => ({
    id: `t-${i}`,
    subject: 'cancel contract competitor refund',
    description: 'pricing too high',
    severity: 'Sev 1',
    sentiment: 'frustrated'
  }))
  const result = service.analyzeAccountIntent(tickets, [])
  assert.ok(result.churnRiskScore <= 100)
  assert.equal(result.accountStatus, 'AT_RISK')
})

test('GTMService: analyzeAccountIntent defaults to STABLE', () => {
  const service = new GTMService()
  const result = service.analyzeAccountIntent(
    [{ id: 't-3', subject: 'how to reset password', description: 'login help', severity: 'Sev 4', sentiment: 'neutral' }],
    []
  )
  assert.equal(result.accountStatus, 'STABLE')
})

test('GTMService: generateOutreachDraft returns default fields', () => {
  const service = new GTMService()
  const result = service.generateOutreachDraft({})

  assert.equal(result.recipientName, 'Alex')
  assert.equal(result.companyName, 'Acme Corp')
  assert.ok(result.subject)
  assert.ok(result.body)
  assert.equal(result.suggestedChannel, 'Email / LinkedIn InMail')
  assert.ok(result.generatedAt)
})

test('GTMService: generateOutreachDraft varies by campaignType', () => {
  const service = new GTMService()
  const demo = service.generateOutreachDraft({ campaignType: 'post_demo', companyName: 'Acme' })
  assert.ok(demo.subject.includes('Follow-up'))

  const churn = service.generateOutreachDraft({ campaignType: 'churn_intervention', companyName: 'Acme' })
  assert.ok(churn.subject.includes('Executive Check-in'))
})

test('gtmService shared instance exposes all methods', () => {
  assert.equal(typeof gtmService.qualifyLead, 'function')
  assert.equal(typeof gtmService.generateGTMResponse, 'function')
  assert.equal(typeof gtmService.analyzeAccountIntent, 'function')
  assert.equal(typeof gtmService.generateOutreachDraft, 'function')
  assert.equal(typeof gtmService.listPlaybooks, 'function')
})
