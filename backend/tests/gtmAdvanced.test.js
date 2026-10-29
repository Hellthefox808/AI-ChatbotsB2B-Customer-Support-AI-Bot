import test from 'node:test'
import assert from 'node:assert/strict'
import { gtmService } from '../src/service/gtmService.js'
import { gtmRepository } from '../src/data/gtmRepository.js'

test('GTMRepository: createAccount, getAccountById, and listAccounts', () => {
  const account = gtmRepository.createAccount({
    name: 'Stripe Payments Inc',
    domain: 'stripe.com',
    size: '1000+',
    industry: 'Finance',
    tier: 'Tier 1 Enterprise VIP',
    bantScore: 95
  })

  assert.ok(account.id.startsWith('acc-'))
  assert.equal(account.name, 'Stripe Payments Inc')
  assert.equal(account.domain, 'stripe.com')
  assert.equal(account.tier, 'Tier 1 Enterprise VIP')
  assert.equal(account.bant_score, 95)

  const fetched = gtmRepository.getAccountById(account.id)
  assert.equal(fetched.id, account.id)

  const byDomain = gtmRepository.getAccountByDomain('stripe.com')
  assert.equal(byDomain.id, account.id)

  const allAccounts = gtmRepository.listAccounts()
  assert.ok(allAccounts.length >= 1)
  assert.ok(allAccounts.some((a) => a.id === account.id))
})

test('GTMRepository: createContact and listContacts linked to account', () => {
  const account = gtmRepository.createAccount({
    name: 'Datadog DevOps',
    domain: 'datadoghq.com',
    size: '1000+',
    industry: 'Technology'
  })

  const contact = gtmRepository.createContact({
    accountId: account.id,
    name: 'John Doe',
    email: 'johndoe@datadoghq.com',
    phone: '+1-555-9999',
    role: 'decision_maker',
    title: 'CTO',
    isPrimary: 1
  })

  assert.ok(contact.id.startsWith('cnt-'))
  assert.equal(contact.account_id, account.id)
  assert.equal(contact.name, 'John Doe')
  assert.equal(contact.is_primary, 1)

  const accountContacts = gtmRepository.listContacts(account.id)
  assert.equal(accountContacts.length, 1)
  assert.equal(accountContacts[0].email, 'johndoe@datadoghq.com')
})

test('GTMRepository: createOpportunity and updateOpportunityStage', () => {
  const account = gtmRepository.createAccount({
    name: 'Snowflake Analytics',
    domain: 'snowflake.com'
  })

  const opp = gtmRepository.createOpportunity({
    accountId: account.id,
    name: 'Snowflake Tier-1 Migration Package',
    amount: 150000,
    stage: 'DISCOVERY',
    probability: 25,
    touchpoints: ['whitepaper_download', 'inbound_chat']
  })

  assert.ok(opp.id.startsWith('opp-'))
  assert.equal(opp.amount, 150000)
  assert.equal(opp.stage, 'DISCOVERY')
  assert.deepEqual(opp.touchpoints, ['whitepaper_download', 'inbound_chat'])

  // Update stage to CLOSED_WON
  const updated = gtmRepository.updateOpportunityStage(opp.id, 'CLOSED_WON')
  assert.equal(updated.stage, 'CLOSED_WON')
  assert.equal(updated.probability, 100)
})

test('GTMService: suppression prevents duplicate registration and rejects with descriptive error', () => {
  const uniqueDomain = `blocked-${Date.now()}.io`
  const sup = gtmService.addSuppression({
    type: 'domain',
    value: uniqueDomain,
    reason: 'Direct Competitor Domain'
  })

  assert.ok(sup.id)
  assert.equal(sup.value, uniqueDomain)

  // Duplicate add should throw error
  assert.throws(
    () => {
      gtmService.addSuppression({
        type: 'domain',
        value: uniqueDomain,
        reason: 'Duplicate attempt'
      })
    },
    /already on the suppression list/
  )
})

test('GTMService: suppression correctly detects domain level match for prospect email', () => {
  const domain = `forbidden-${Date.now()}.com`
  gtmService.addSuppression({
    type: 'domain',
    value: domain,
    reason: 'Excluded vendor'
  })

  assert.equal(gtmService.isSuppressed(`lead@${domain}`), true)
  assert.equal(gtmService.isSuppressed(domain), true)
  assert.equal(gtmService.isSuppressed('allowed-client@validcompany.com'), false)
})

test('GTMService: filterAudience partitions list into eligible and suppressed', () => {
  const domain = `spam-test-${Date.now()}.org`
  gtmService.addSuppression({
    type: 'domain',
    value: domain,
    reason: 'Testing filter'
  })

  const audience = [
    { email: `alice@${domain}`, name: 'Alice' },
    { email: 'bob@legitcorp.com', name: 'Bob' },
    { email: 'charlie@enterprise.net', name: 'Charlie' }
  ]

  const result = gtmService.filterAudience(audience)
  assert.equal(result.totalCount, 3)
  assert.equal(result.eligibleCount, 2)
  assert.equal(result.suppressedCount, 1)
  assert.equal(result.suppressed[0].email, `alice@${domain}`)
  assert.equal(result.eligible[0].email, 'bob@legitcorp.com')
})

test('GTMService: createCampaign creates campaign in DRAFT state', () => {
  const campaign = gtmService.createCampaign({
    name: '2026 Q4 Cloud Automation Push',
    type: 'outbound_email',
    audienceCount: 50,
    metadata: { playbook: 'SECURITY_SOC2' }
  })

  assert.ok(campaign.id.startsWith('cmp-'))
  assert.equal(campaign.name, '2026 Q4 Cloud Automation Push')
  assert.equal(campaign.status, 'DRAFT')
})

test('GTMService: approveCampaign marks status APPROVED with admin actor', () => {
  const campaign = gtmService.createCampaign({
    name: 'Approval Workflow Test Campaign',
    type: 'outbound_email',
    audienceCount: 15
  })

  const approved = gtmService.approveCampaign(campaign.id, 'admin@company.com')
  assert.equal(approved.id, campaign.id)
  assert.equal(approved.status, 'APPROVED')
  assert.equal(approved.approved_by, 'admin@company.com')
  assert.ok(approved.approved_at)
})

test('GTMService: enqueueCampaignMessage enforces suppression check', () => {
  const campaign = gtmService.createCampaign({
    name: 'Queue Suppression Test',
    type: 'outbound_email'
  })

  const domain = `donotemail-${Date.now()}.com`
  gtmService.addSuppression({
    type: 'domain',
    value: domain,
    reason: 'Opt out test'
  })

  // Enqueuing suppressed email must throw
  assert.throws(
    () => {
      gtmService.enqueueCampaignMessage({
        campaignId: campaign.id,
        recipientEmail: `prospect@${domain}`,
        recipientName: 'Blocked User',
        subject: 'Hi',
        content: 'Check out our product'
      })
    },
    /suppressed\/opted-out/
  )

  // Enqueuing eligible email should succeed
  const msg = gtmService.enqueueCampaignMessage({
    campaignId: campaign.id,
    recipientEmail: 'verified.prospect@safecompany.com',
    recipientName: 'Valid User',
    subject: 'Enterprise Architecture',
    content: 'Review our SOC-2 report'
  })

  assert.ok(msg.id)
  assert.equal(msg.status, 'QUEUED')
})

test('GTMService: dispatchCampaign blocks dispatch if campaign is in DRAFT (CAMPAIGN_NOT_APPROVED)', () => {
  const draftCampaign = gtmService.createCampaign({
    name: 'Unapproved Campaign',
    type: 'outbound_email'
  })

  assert.throws(
    () => {
      gtmService.dispatchCampaign(draftCampaign.id, 5)
    },
    /CAMPAIGN_NOT_APPROVED/
  )
})

test('GTMService: dispatchCampaign dispatches up to batchLimit when campaign is APPROVED', () => {
  const campaign = gtmService.createCampaign({
    name: 'Batch Throttled Campaign',
    type: 'outbound_email'
  })

  // Enqueue 3 messages
  gtmService.enqueueCampaignMessage({
    campaignId: campaign.id,
    recipientEmail: 'lead1@fastscale.com',
    subject: 'Subject 1'
  })
  gtmService.enqueueCampaignMessage({
    campaignId: campaign.id,
    recipientEmail: 'lead2@fastscale.com',
    subject: 'Subject 2'
  })
  gtmService.enqueueCampaignMessage({
    campaignId: campaign.id,
    recipientEmail: 'lead3@fastscale.com',
    subject: 'Subject 3'
  })

  // Approve campaign
  gtmService.approveCampaign(campaign.id, 'admin@company.com')

  // Dispatch with batch limit 2
  const dispatchRes = gtmService.dispatchCampaign(campaign.id, 2)
  assert.equal(dispatchRes.dispatchedCount, 2)
  assert.equal(dispatchRes.batchLimit, 2)
})

test('GTMService: syncToCRM is idempotent and ignores duplicate idempotencyKey', () => {
  const key = `idempotency-key-${Date.now()}`
  const sync1 = gtmService.syncToCRM({
    entityType: 'ACCOUNT',
    entityId: 'acc-test-1',
    crmSystem: 'Salesforce',
    idempotencyKey: key,
    payload: { tier: 'Tier 1 Enterprise VIP' }
  })

  assert.equal(sync1.status, 'SYNCED')
  assert.equal(sync1.idempotent, false)

  const sync2 = gtmService.syncToCRM({
    entityType: 'ACCOUNT',
    entityId: 'acc-test-1',
    crmSystem: 'Salesforce',
    idempotencyKey: key,
    payload: { tier: 'Tier 1 Enterprise VIP' }
  })

  assert.equal(sync2.status, 'ALREADY_SYNCED')
  assert.equal(sync2.idempotent, true)
})
