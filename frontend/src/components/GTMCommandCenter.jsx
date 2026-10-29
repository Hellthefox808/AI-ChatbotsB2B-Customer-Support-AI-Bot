/* global navigator */
import { useState, useEffect, useCallback } from 'react'

export default function GTMCommandCenter ({ request, showToast, user }) {
  const [activeSubTab, setActiveSubTab] = useState('qualify') // qualify | playbooks | intent | outreach | campaigns | suppression | attribution
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 1. Lead Qualification state
  const [qualifyForm, setQualifyForm] = useState({
    companyName: 'Stripe Payments',
    companySize: '1000+',
    industry: 'Finance',
    budgetRange: '$250k+',
    decisionMakerRole: 'VP of Engineering',
    urgency: 'this month',
    primaryNeed: 'compliance soc2',
    optedOut: false,
    suppressed: false
  })
  const [qualificationResult, setQualificationResult] = useState(null)

  // 2. Playbooks state
  const [playbooks, setPlaybooks] = useState([])
  const [playbookSearch, setPlaybookSearch] = useState('')
  const [selectedPlaybook, setSelectedPlaybook] = useState(null)

  // 3. Account Intent state
  const [intentAnalysis, setIntentAnalysis] = useState(null)

  // 4. Outreach Synthesizer state
  const [outreachForm, setOutreachForm] = useState({
    recipientName: 'Sarah Jenkins',
    companyName: 'FinTech Global Ltd',
    role: 'VP of Engineering',
    campaignType: 'executive_followup',
    painPoint: 'support ticket backlog'
  })
  const [outreachDraft, setOutreachDraft] = useState(null)

  // 5. Campaigns state
  const [campaigns, setCampaigns] = useState([])
  const [campaignQueue, setCampaignQueue] = useState([])
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignType, setNewCampaignType] = useState('outbound_email')
  const [newCampaignAudience, setNewCampaignAudience] = useState(25)
  const [batchLimit, setBatchLimit] = useState(5)
  const [dispatchResult, setDispatchResult] = useState(null)

  // 6. Suppression & Opt-Out state
  const [suppressions, setSuppressions] = useState([])
  const [newSuppressionValue, setNewSuppressionValue] = useState('')
  const [newSuppressionType, setNewSuppressionType] = useState('domain')
  const [newSuppressionReason, setNewSuppressionReason] = useState('Direct Competitor Domain')
  const [suppressionTestInput, setSuppressionTestInput] = useState('')
  const [suppressionTestResult, setSuppressionTestResult] = useState(null)
  const [audienceFilterText, setAudienceFilterText] = useState('contact1@fintechglobal.com\nuser@competitor-domain.com\nunsubscribed-lead@client.com\nexec@enterprise.org')
  const [audienceFilterResult, setAudienceFilterResult] = useState(null)

  // 7. CRM Sync & Attribution state
  const [attribution, setAttribution] = useState(null)
  const [crmSyncForm, setCrmSyncForm] = useState({
    entityType: 'ACCOUNT',
    entityId: 'acc-1',
    crmSystem: 'HubSpot',
    idempotencyKey: 'idemp-acc1-upsert-01'
  })
  const [crmSyncResult, setCrmSyncResult] = useState(null)

  // Fetch Playbooks
  const fetchPlaybooks = useCallback(async () => {
    try {
      const res = await request('/gtm/playbooks')
      setPlaybooks(res.data?.playbooks || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  // Fetch Campaigns & Queue
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await request('/gtm/campaigns')
      setCampaigns(res.data?.campaigns || [])
      const queueRes = await request('/gtm/campaigns/all/queue').catch(() => ({ data: { queue: [] } }))
      setCampaignQueue(queueRes.data?.queue || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  // Fetch Suppressions
  const fetchSuppressions = useCallback(async () => {
    try {
      const res = await request('/gtm/suppression')
      setSuppressions(res.data?.suppressions || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  // Fetch Intent Analysis
  const fetchIntentAnalysis = useCallback(async () => {
    try {
      const res = await request('/gtm/intent', { method: 'POST', body: JSON.stringify({}) })
      setIntentAnalysis(res.data?.analysis || null)
    } catch (err) {
      console.error(err)
    }
  }, [request])

  // Fetch Attribution
  const fetchAttribution = useCallback(async () => {
    try {
      const res = await request('/gtm/attribution')
      setAttribution(res.data?.attribution || null)
    } catch (err) {
      console.error(err)
    }
  }, [request])

  useEffect(() => {
    fetchPlaybooks()
    fetchCampaigns()
    fetchSuppressions()
    fetchIntentAnalysis()
    fetchAttribution()
  }, [fetchPlaybooks, fetchCampaigns, fetchSuppressions, fetchIntentAnalysis, fetchAttribution])

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleQualifyLead = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      const res = await request('/gtm/qualify', {
        method: 'POST',
        body: JSON.stringify(qualifyForm)
      })
      setQualificationResult(res.data.qualification)
      showToast(`Lead Qualified: ${res.data.qualification.tier} (${res.data.qualification.bantScore} BANT)`)
    } catch (err) {
      setError(err.message)
      setQualificationResult(null)
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveQualifiedAccount = async () => {
    if (!qualificationResult) return
    try {
      setLoading(true)
      await request('/gtm/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: qualificationResult.companyName,
          domain: `${qualificationResult.companyName.toLowerCase().replace(/\s+/g, '')}.com`,
          size: qualificationResult.companySize,
          industry: qualificationResult.industry,
          tier: qualificationResult.tier,
          bantScore: qualificationResult.bantScore
        })
      })
      showToast(`Saved ${qualificationResult.companyName} to CRM Accounts table!`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateOutreach = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      const res = await request('/gtm/outreach', {
        method: 'POST',
        body: JSON.stringify(outreachForm)
      })
      setOutreachDraft(res.data.draft)
      showToast('Outreach draft synthesized with verified value props!')
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyOutreach = () => {
    if (!outreachDraft) return
    const text = `Subject: ${outreachDraft.subject}\n\n${outreachDraft.body}`
    navigator.clipboard.writeText(text)
    showToast('Outreach copied to clipboard!')
  }

  const handleCreateCampaign = async (e) => {
    e.preventDefault()
    if (!newCampaignName.trim()) return
    try {
      setLoading(true)
      const res = await request('/gtm/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: newCampaignName.trim(),
          type: newCampaignType,
          audienceCount: Number(newCampaignAudience) || 0,
          metadata: { targetTier: 'Tier 1 Enterprise VIP' }
        })
      })
      setNewCampaignName('')
      await fetchCampaigns()
      showToast(`Campaign '${res.data.campaign.name}' created in DRAFT state!`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveCampaign = async (id) => {
    try {
      setLoading(true)
      await request(`/gtm/campaigns/${id}/approve`, { method: 'PATCH' })
      await fetchCampaigns()
      showToast('Campaign approved by Human-in-the-Loop review!')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDispatchCampaign = async (campaignId) => {
    try {
      setLoading(true)
      setDispatchResult(null)
      const res = await request(`/gtm/campaigns/${campaignId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ batchLimit: Number(batchLimit) || 5 })
      })
      setDispatchResult(res.data.dispatch)
      await fetchCampaigns()
      showToast(`Dispatched ${res.data.dispatch.dispatchedCount} messages! (${res.data.dispatch.suppressedCount} suppressed)`)
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddSuppression = async (e) => {
    e.preventDefault()
    if (!newSuppressionValue.trim()) return
    try {
      setLoading(true)
      await request('/gtm/suppression', {
        method: 'POST',
        body: JSON.stringify({
          type: newSuppressionType,
          value: newSuppressionValue.trim(),
          reason: newSuppressionReason
        })
      })
      setNewSuppressionValue('')
      await fetchSuppressions()
      showToast('Entity added to suppression and opt-out registry!')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveSuppression = async (id) => {
    try {
      setLoading(true)
      await request(`/gtm/suppression/${id}`, { method: 'DELETE' })
      await fetchSuppressions()
      showToast('Suppression rule removed')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTestSuppression = async (e) => {
    e.preventDefault()
    if (!suppressionTestInput.trim()) return
    try {
      const res = await request(`/gtm/suppression/check?value=${encodeURIComponent(suppressionTestInput.trim())}`)
      setSuppressionTestResult(res.data)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleFilterAudience = async () => {
    const lines = audienceFilterText.split('\n').map((l) => l.trim()).filter(Boolean)
    const audience = lines.map((email) => ({ email, name: email.split('@')[0] }))
    try {
      setLoading(true)
      const res = await request('/gtm/suppression/filter', {
        method: 'POST',
        body: JSON.stringify({ audience })
      })
      setAudienceFilterResult(res.data.filtering)
      showToast(`Filtered: ${res.data.filtering.eligibleCount} eligible, ${res.data.filtering.suppressedCount} suppressed`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncCRM = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const res = await request('/gtm/sync-crm', {
        method: 'POST',
        body: JSON.stringify({
          ...crmSyncForm,
          payload: { timestamp: new Date().toISOString() }
        })
      })
      setCrmSyncResult(res.data.sync)
      showToast(`CRM Sync status: ${res.data.sync.status} (Idempotent: ${res.data.sync.idempotent})`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filter playbooks by search
  const filteredPlaybooks = playbooks.filter((p) => {
    const q = playbookSearch.toLowerCase()
    return p.topic.toLowerCase().includes(q) ||
      p.objection.toLowerCase().includes(q) ||
      p.targetPersona.toLowerCase().includes(q)
  })

  return (
    <div className='gtm-container'>
      {/* Header */}
      <div className='gtm-header'>
        <div>
          <h2 className='gtm-title'>🚀 AI-GTM Command Center</h2>
          <p className='gtm-subtitle'>
            Enterprise Go-To-Market Automation: BANT Qualification, Sales Battlecards, Intent Scanning, Human-in-the-Loop Campaigns, and Suppression Governance.
          </p>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className='gtm-nav'>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'qualify' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('qualify')}
        >
          🎯 Lead Qualification & ICP
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'playbooks' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('playbooks')}
        >
          📖 Battlecards & Playbooks ({playbooks.length})
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'intent' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('intent')}
        >
          📡 Account Intent & Churn Risk
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'outreach' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('outreach')}
        >
          ✉️ Outreach Synthesizer
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('campaigns')}
        >
          🛡️ Campaigns & Approval ({campaigns.length})
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'suppression' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('suppression')}
        >
          🚫 Suppression & Opt-Out ({suppressions.length})
        </button>
        <button
          className={`gtm-nav-tab ${activeSubTab === 'attribution' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('attribution')}
        >
          📊 CRM Sync & Attribution
        </button>
      </div>

      {error && (
        <div className='gtm-error-banner'>
          <span>⚠️ {error}</span>
          <button className='btn-small' onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 1: LEAD QUALIFICATION & ICP MATRIX */}
      {/* ========================================================= */}
      {activeSubTab === 'qualify' && (
        <div className='gtm-grid-2col'>
          <div className='gtm-card'>
            <h3 className='gtm-card-title'>Inbound Lead Evaluation Form</h3>
            <p className='gtm-card-desc'>
              Scores lead along BANT (Budget, Authority, Need, Timeline) and MEDDPICC criteria with automated disqualification gating.
            </p>

            <form onSubmit={handleQualifyLead} className='gtm-form'>
              <div className='form-group'>
                <label htmlFor='qualify-company'>Company Name</label>
                <input
                  id='qualify-company'
                  type='text'
                  value={qualifyForm.companyName}
                  onChange={(e) => setQualifyForm({ ...qualifyForm, companyName: e.target.value })}
                  required
                />
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label htmlFor='qualify-size'>Company Size</label>
                  <select
                    id='qualify-size'
                    value={qualifyForm.companySize}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, companySize: e.target.value })}
                  >
                    <option value='1-50'>1-50 (Startup)</option>
                    <option value='51-200'>51-200 (Growth)</option>
                    <option value='201-1000'>201-1,000 (Mid-Market)</option>
                    <option value='1000+'>1,000+ (Enterprise)</option>
                  </select>
                </div>

                <div className='form-group'>
                  <label htmlFor='qualify-industry'>Industry Sector</label>
                  <select
                    id='qualify-industry'
                    value={qualifyForm.industry}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, industry: e.target.value })}
                  >
                    <option value='Finance'>Finance / FinTech</option>
                    <option value='Healthcare'>Healthcare / HealthTech</option>
                    <option value='Technology'>Technology / SaaS</option>
                    <option value='Retail'>Retail / E-Commerce</option>
                    <option value='Logistics'>Logistics & Supply Chain</option>
                  </select>
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label htmlFor='qualify-budget'>Budget Allocation</label>
                  <select
                    id='qualify-budget'
                    value={qualifyForm.budgetRange}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, budgetRange: e.target.value })}
                  >
                    <option value='$250k+'>$250k+ (Enterprise Approved)</option>
                    <option value='$50k-$250k'>$50k - $250k (Mid-Market)</option>
                    <option value='$10k-$50k'>$10k - $50k (Team License)</option>
                    <option value='<$10k'>&lt;$10k (Self-Serve / Free)</option>
                  </select>
                </div>

                <div className='form-group'>
                  <label htmlFor='qualify-role'>Decision Maker Role</label>
                  <select
                    id='qualify-role'
                    value={qualifyForm.decisionMakerRole}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, decisionMakerRole: e.target.value })}
                  >
                    <option value='VP of Engineering'>C-Level / VP (Economic Buyer)</option>
                    <option value='Director of IT'>Director / Head of Department</option>
                    <option value='Support Manager'>Support / Project Manager</option>
                    <option value='Engineer'>Individual Practitioner</option>
                  </select>
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label htmlFor='qualify-urgency'>Procurement Timeline</label>
                  <select
                    id='qualify-urgency'
                    value={qualifyForm.urgency}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, urgency: e.target.value })}
                  >
                    <option value='this month'>Immediate (&lt;30 days)</option>
                    <option value='this quarter'>Active Quarter (30-90 days)</option>
                    <option value='6mo'>Roadmap Planning (6+ months)</option>
                  </select>
                </div>

                <div className='form-group'>
                  <label htmlFor='qualify-need'>Primary Pain Point / Need</label>
                  <input
                    id='qualify-need'
                    type='text'
                    value={qualifyForm.primaryNeed}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, primaryNeed: e.target.value })}
                    placeholder='e.g., SOC-2 compliance, ticket churn, migration'
                  />
                </div>
              </div>

              <div className='form-group'>
                <label className='checkbox-label'>
                  <input
                    type='checkbox'
                    checked={qualifyForm.optedOut}
                    onChange={(e) => setQualifyForm({ ...qualifyForm, optedOut: e.target.checked })}
                  />
                  <span>Simulate Opt-Out / Disqualification Flag (Tests Disqualification Gate)</span>
                </label>
              </div>

              <button type='submit' className='btn-primary' disabled={loading}>
                {loading ? 'Evaluating Lead...' : '⚡ Calculate BANT Score & Tier'}
              </button>
            </form>
          </div>

          {/* Result Card */}
          <div className='gtm-card'>
            <h3 className='gtm-card-title'>ICP Qualification Output</h3>
            {!qualificationResult
              ? (
                <div className='empty-state'>
                  <span>🎯 Fill out the form and submit to run lead qualification scoring.</span>
                </div>
                )
              : (
                <div className='gtm-qual-result'>
                  <div className='gtm-score-banner'>
                    <div className='score-metric'>
                      <span className='score-number'>{qualificationResult.bantScore}</span>
                      <span className='score-label'>BANT Score / 100</span>
                    </div>
                    <div className='tier-metric'>
                      <span className={`tier-badge ${qualificationResult.tier.includes('Tier 1') ? 'tier-1' : qualificationResult.tier.includes('Tier 2') ? 'tier-2' : 'tier-3'}`}>
                        {qualificationResult.tier}
                      </span>
                      <span className='prob-label'>Conversion Probability: {qualificationResult.conversionProbability}%</span>
                    </div>
                  </div>

                  <div className='gtm-action-box'>
                    <strong>🎯 Next Best Action:</strong>
                    <p>{qualificationResult.nextBestAction}</p>
                  </div>

                  <div className='gtm-playbook-box'>
                    <strong>📖 Recommended Battlecard:</strong>
                    <div className='playbook-pill'>
                      <span>{qualificationResult.recommendedPlaybook.topic}</span>
                      <button
                        className='btn-small'
                        onClick={() => {
                          setSelectedPlaybook(qualificationResult.recommendedPlaybook)
                          setActiveSubTab('playbooks')
                        }}
                      >
                        Inspect Battlecard
                      </button>
                    </div>
                  </div>

                  <div className='gtm-reasons-list'>
                    <strong>Scoring Factors:</strong>
                    <ul>
                      {qualificationResult.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <button className='btn-secondary' onClick={handleSaveQualifiedAccount} disabled={loading}>
                    💾 Save as CRM Account & Contact
                  </button>
                </div>
                )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 2: SALES PLAYBOOKS & BATTLECARDS */}
      {/* ========================================================= */}
      {activeSubTab === 'playbooks' && (
        <div className='gtm-playbooks-view'>
          <div className='search-bar-row'>
            <input
              type='text'
              placeholder='Search playbooks by objection, persona, or compliance keyword...'
              value={playbookSearch}
              onChange={(e) => setPlaybookSearch(e.target.value)}
              className='search-input'
            />
          </div>

          <div className='playbook-grid'>
            {filteredPlaybooks.map((pb) => (
              <div
                key={pb.id}
                className={`playbook-card ${selectedPlaybook?.id === pb.id ? 'active' : ''}`}
                onClick={() => setSelectedPlaybook(pb)}
              >
                <div className='playbook-header'>
                  <span className='playbook-id'>{pb.id}</span>
                  <span className='persona-tag'>{pb.targetPersona}</span>
                </div>
                <h4 className='playbook-topic'>{pb.topic}</h4>
                <div className='playbook-objection'>
                  <strong>Objection:</strong> "{pb.objection}"
                </div>
                <div className='playbook-positioning'>
                  <strong>Positioning:</strong> {pb.positioning}
                </div>
                <div className='playbook-collateral'>
                  📄 <span>{pb.recommendedCollateral}</span>
                </div>
              </div>
            ))}
          </div>

          {selectedPlaybook && (
            <div className='playbook-modal'>
              <div className='playbook-modal-card'>
                <div className='modal-header'>
                  <h3>{selectedPlaybook.topic}</h3>
                  <button className='btn-close' onClick={() => setSelectedPlaybook(null)}>✕</button>
                </div>
                <div className='modal-body'>
                  <p><strong>Target Persona:</strong> {selectedPlaybook.targetPersona}</p>
                  <p><strong>Customer Objection:</strong> "{selectedPlaybook.objection}"</p>
                  <p><strong>Strategic Positioning:</strong> {selectedPlaybook.positioning}</p>

                  <div className='talking-points'>
                    <strong>Key Talking Points:</strong>
                    <ul>
                      {selectedPlaybook.keyTalkingPoints.map((tp, idx) => (
                        <li key={idx}>{tp}</li>
                      ))}
                    </ul>
                  </div>

                  <p><strong>Recommended Collateral:</strong> {selectedPlaybook.recommendedCollateral}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 3: ACCOUNT INTENT & CHURN RISK */}
      {/* ========================================================= */}
      {activeSubTab === 'intent' && (
        <div className='gtm-intent-view'>
          <div className='intent-header-bar'>
            <div>
              <h3>Account Commercial Intent & Retention Telemetry</h3>
              <p>Scans support tickets and chat transcripts in real-time to surface expansion opportunities and churn risks.</p>
            </div>
            <button className='btn-primary' onClick={fetchIntentAnalysis}>
              🔄 Refresh Signal Scanner
            </button>
          </div>

          {intentAnalysis && (
            <div className='intent-dashboard'>
              <div className='intent-stats-row'>
                <div className='stat-card'>
                  <span className='stat-label'>Expansion Intent Score</span>
                  <span className='stat-val text-success'>{intentAnalysis.expansionScore} / 100</span>
                  <div className='progress-bar-bg'>
                    <div className='progress-bar-fill fill-success' style={{ width: `${intentAnalysis.expansionScore}%` }} />
                  </div>
                </div>

                <div className='stat-card'>
                  <span className='stat-label'>Churn Risk Score</span>
                  <span className='stat-val text-error'>{intentAnalysis.churnRiskScore} / 100</span>
                  <div className='progress-bar-bg'>
                    <div className='progress-bar-fill fill-error' style={{ width: `${intentAnalysis.churnRiskScore}%` }} />
                  </div>
                </div>

                <div className='stat-card'>
                  <span className='stat-label'>Net Commercial Intent</span>
                  <span className={`stat-val ${intentAnalysis.netIntentScore >= 0 ? 'text-success' : 'text-error'}`}>
                    {intentAnalysis.netIntentScore > 0 ? `+${intentAnalysis.netIntentScore}` : intentAnalysis.netIntentScore}
                  </span>
                  <span className={`status-badge ${intentAnalysis.accountStatus === 'EXPANSION_READY' ? 'status-green' : intentAnalysis.accountStatus === 'AT_RISK' ? 'status-red' : 'status-blue'}`}>
                    {intentAnalysis.accountStatus}
                  </span>
                </div>
              </div>

              <div className='recommendation-box'>
                <strong>🎯 AI Action Recommendation:</strong>
                <p>{intentAnalysis.recommendedAction}</p>
              </div>

              <div className='signals-container'>
                <h4>Extracted Signal Telemetry ({intentAnalysis.signalsFound} detected)</h4>
                {intentAnalysis.signals?.length === 0
                  ? (
                    <div className='empty-sub'>No adverse or expansion triggers detected. Account is currently stable.</div>
                    )
                  : (
                    <div className='signal-list'>
                      {intentAnalysis.signals.map((sig, i) => (
                        <div key={i} className={`signal-item ${sig.type === 'EXPANSION' ? 'sig-expansion' : 'sig-churn'}`}>
                          <span className='sig-tag'>{sig.type}</span>
                          <span className='sig-text'>{sig.text}</span>
                        </div>
                      ))}
                    </div>
                    )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 4: AI OUTREACH SYNTHESIZER */}
      {/* ========================================================= */}
      {activeSubTab === 'outreach' && (
        <div className='gtm-grid-2col'>
          <div className='gtm-card'>
            <h3 className='gtm-card-title'>Synthesize Tailored Outreach</h3>
            <p className='gtm-card-desc'>
              Generates persona-specific messaging grounded in internal documentation with verified performance metrics.
            </p>

            <form onSubmit={handleGenerateOutreach} className='gtm-form'>
              <div className='form-group'>
                <label htmlFor='outreach-type'>Campaign Type / Hook</label>
                <select
                  id='outreach-type'
                  value={outreachForm.campaignType}
                  onChange={(e) => setOutreachForm({ ...outreachForm, campaignType: e.target.value })}
                >
                  <option value='executive_followup'>Executive Strategic Briefing</option>
                  <option value='post_demo'>Post-Demo Technical Follow-Up</option>
                  <option value='churn_intervention'>Executive Churn Intervention</option>
                </select>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label htmlFor='outreach-recip'>Recipient Name</label>
                  <input
                    id='outreach-recip'
                    type='text'
                    value={outreachForm.recipientName}
                    onChange={(e) => setOutreachForm({ ...outreachForm, recipientName: e.target.value })}
                    required
                  />
                </div>

                <div className='form-group'>
                  <label htmlFor='outreach-comp'>Company Name</label>
                  <input
                    id='outreach-comp'
                    type='text'
                    value={outreachForm.companyName}
                    onChange={(e) => setOutreachForm({ ...outreachForm, companyName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label htmlFor='outreach-role'>Recipient Title / Persona</label>
                  <input
                    id='outreach-role'
                    type='text'
                    value={outreachForm.role}
                    onChange={(e) => setOutreachForm({ ...outreachForm, role: e.target.value })}
                    required
                  />
                </div>

                <div className='form-group'>
                  <label htmlFor='outreach-pain'>Target Pain Point</label>
                  <input
                    id='outreach-pain'
                    type='text'
                    value={outreachForm.painPoint}
                    onChange={(e) => setOutreachForm({ ...outreachForm, painPoint: e.target.value })}
                    required
                  />
                </div>
              </div>

              <button type='submit' className='btn-primary' disabled={loading}>
                {loading ? 'Synthesizing...' : '✍️ Generate Tailored Message'}
              </button>
            </form>
          </div>

          <div className='gtm-card'>
            <h3 className='gtm-card-title'>Draft Message Preview</h3>
            {!outreachDraft
              ? (
                <div className='empty-state'>
                  <span>✉️ Configure and generate an outreach draft to preview subject and body copy.</span>
                </div>
                )
              : (
                <div className='draft-preview-box'>
                  <div className='draft-field'>
                    <strong>Subject:</strong> {outreachDraft.subject}
                  </div>
                  <div className='draft-field'>
                    <strong>Channel:</strong> {outreachDraft.suggestedChannel}
                  </div>
                  <div className='draft-field'>
                    <strong>Generated:</strong> {new Date(outreachDraft.generatedAt).toLocaleString()}
                  </div>

                  <div className='draft-body'>
                    <pre>{outreachDraft.body}</pre>
                  </div>

                  <div className='draft-actions'>
                    <button className='btn-secondary' onClick={handleCopyOutreach}>
                      📋 Copy to Clipboard
                    </button>
                  </div>
                </div>
                )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 5: CAMPAIGNS & HUMAN-IN-THE-LOOP APPROVAL */}
      {/* ========================================================= */}
      {activeSubTab === 'campaigns' && (
        <div className='gtm-campaigns-view'>
          <div className='campaign-creator-card'>
            <h3 className='gtm-card-title'>Create New Outbound Campaign</h3>
            <form onSubmit={handleCreateCampaign} className='form-inline'>
              <input
                type='text'
                placeholder='Campaign Name (e.g. Q4 Cloud SOC-2 Outreach)'
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                required
              />
              <select value={newCampaignType} onChange={(e) => setNewCampaignType(e.target.value)}>
                <option value='outbound_email'>Outbound Email</option>
                <option value='executive_inmail'>Executive LinkedIn InMail</option>
                <option value='churn_intervention'>Customer Churn Intervention</option>
              </select>
              <input
                type='number'
                placeholder='Audience Size'
                value={newCampaignAudience}
                onChange={(e) => setNewCampaignAudience(e.target.value)}
                style={{ width: '120px' }}
              />
              <button type='submit' className='btn-primary' disabled={loading}>
                + Create Draft Campaign
              </button>
            </form>
          </div>

          <div className='campaigns-table-container'>
            <h4>Managed Campaigns & Approval Gates</h4>
            <table className='gtm-table'>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Approved By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id}</code></td>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.type}</td>
                    <td>{c.audience_count || c.audienceCount}</td>
                    <td>
                      <span className={`status-pill ${c.status === 'APPROVED' ? 'status-green' : 'status-amber'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>{c.approved_by || c.approvedBy || '—'}</td>
                    <td>
                      {c.status === 'DRAFT'
                        ? (
                          <button
                            className='btn-small btn-success'
                            onClick={() => handleApproveCampaign(c.id)}
                            disabled={user?.role !== 'admin'}
                            title={user?.role !== 'admin' ? 'Admin approval required' : 'Sign off on campaign'}
                          >
                            ✓ Approve for Send
                          </button>
                          )
                        : (
                          <div className='dispatch-inline'>
                            <input
                              type='number'
                              min='1'
                              max='50'
                              value={batchLimit}
                              onChange={(e) => setBatchLimit(e.target.value)}
                              className='batch-input'
                              title='Rate throttling batch size'
                            />
                            <button
                              className='btn-small btn-primary'
                              onClick={() => handleDispatchCampaign(c.id)}
                              disabled={loading}
                            >
                              🚀 Dispatch Batch
                            </button>
                          </div>
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dispatchResult && (
            <div className='dispatch-result-box'>
              <h4>🚀 Batch Dispatch Telemetry</h4>
              <p>
                Dispatched: <strong>{dispatchResult.dispatchedCount}</strong> | Suppressed: <strong>{dispatchResult.suppressedCount}</strong> (Batch Limit: {dispatchResult.batchLimit})
              </p>
            </div>
          )}

          {campaignQueue.length > 0 && (
            <div className='queue-table-container'>
              <h4>Message Queue ({campaignQueue.length} items)</h4>
              <table className='gtm-table'>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Campaign</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignQueue.slice(0, 10).map((q) => (
                    <tr key={q.id}>
                      <td><code>{q.id}</code></td>
                      <td>{q.campaign_id}</td>
                      <td>{q.recipient_email}</td>
                      <td>
                        <span className={`status-pill ${q.status === 'DISPATCHED' ? 'status-green' : q.status === 'SUPPRESSED' ? 'status-red' : 'status-blue'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td>{new Date(q.scheduled_at || q.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 6: SUPPRESSION & OPT-OUT REGISTRY */}
      {/* ========================================================= */}
      {activeSubTab === 'suppression' && (
        <div className='gtm-suppression-view'>
          <div className='gtm-grid-2col'>
            {/* Add form */}
            <div className='gtm-card'>
              <h3 className='gtm-card-title'>Register Suppression / Opt-Out</h3>
              <p className='gtm-card-desc'>
                Strictly prevents outbound emails, playbooks, and lead qualification for unsubscribed users, competitors, and opted-out domains.
              </p>

              <form onSubmit={handleAddSuppression} className='gtm-form'>
                <div className='form-group'>
                  <label htmlFor='suppression-type'>Target Entity Type</label>
                  <select
                    id='suppression-type'
                    value={newSuppressionType}
                    onChange={(e) => setNewSuppressionType(e.target.value)}
                  >
                    <option value='domain'>Domain Name (Blocks entire organization)</option>
                    <option value='email'>Specific Email Address</option>
                  </select>
                </div>

                <div className='form-group'>
                  <label htmlFor='suppression-value'>Value to Suppress</label>
                  <input
                    id='suppression-value'
                    type='text'
                    placeholder='e.g., competitor.com or optout@client.com'
                    value={newSuppressionValue}
                    onChange={(e) => setNewSuppressionValue(e.target.value)}
                    required
                  />
                </div>

                <div className='form-group'>
                  <label htmlFor='suppression-reason'>Suppression Justification</label>
                  <input
                    id='suppression-reason'
                    type='text'
                    placeholder='e.g., Competitor, Legal Request, Opt-out'
                    value={newSuppressionReason}
                    onChange={(e) => setNewSuppressionReason(e.target.value)}
                    required
                  />
                </div>

                <button type='submit' className='btn-primary' disabled={loading}>
                  🚫 Add to Registry
                </button>
              </form>
            </div>

            {/* Test tool */}
            <div className='gtm-card'>
              <h3 className='gtm-card-title'>Instant Suppression Checker</h3>
              <p className='gtm-card-desc'>
                Verify if a prospect domain or email address is registered on the global suppression list.
              </p>

              <form onSubmit={handleTestSuppression} className='form-inline'>
                <input
                  type='text'
                  placeholder='Enter email or domain to test...'
                  value={suppressionTestInput}
                  onChange={(e) => setSuppressionTestInput(e.target.value)}
                  style={{ flex: 1 }}
                  required
                />
                <button type='submit' className='btn-secondary'>
                  🔍 Check
                </button>
              </form>

              {suppressionTestResult && (
                <div className={`test-result-box ${suppressionTestResult.isSuppressed ? 'res-blocked' : 'res-allowed'}`}>
                  <strong>{suppressionTestResult.value}</strong> is{' '}
                  <span className='bold-pill'>
                    {suppressionTestResult.isSuppressed ? '⛔ SUPPRESSED / OPTED-OUT' : '✅ ELIGIBLE FOR OUTREACH'}
                  </span>
                </div>
              )}

              <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border)' }} />

              <h4 style={{ marginBottom: '0.5rem' }}>Bulk Audience Filter</h4>
              <textarea
                rows={3}
                value={audienceFilterText}
                onChange={(e) => setAudienceFilterText(e.target.value)}
                placeholder='Paste newline-separated emails...'
                style={{ width: '100%', marginBottom: '0.75rem' }}
              />
              <button className='btn-small btn-primary' onClick={handleFilterAudience} disabled={loading}>
                Filter Audience Batch
              </button>

              {audienceFilterResult && (
                <div className='filter-output'>
                  <p>
                    Eligible: <strong className='text-success'>{audienceFilterResult.eligibleCount}</strong> | Suppressed: <strong className='text-error'>{audienceFilterResult.suppressedCount}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className='suppressions-table-container'>
            <h4>Active Suppression Registry ({suppressions.length} records)</h4>
            <table className='gtm-table'>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Reason</th>
                  <th>Registered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr key={s.id}>
                    <td><code>{s.id}</code></td>
                    <td><span className='type-tag'>{s.type}</span></td>
                    <td><strong>{s.value}</strong></td>
                    <td>{s.reason}</td>
                    <td>{new Date(s.created_at || s.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className='btn-small btn-danger' onClick={() => handleRemoveSuppression(s.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBTAB 7: CRM SYNC & REVENUE ATTRIBUTION */}
      {/* ========================================================= */}
      {activeSubTab === 'attribution' && (
        <div className='gtm-attribution-view'>
          {/* Top Metrics */}
          {attribution && (
            <div className='attr-stats-grid'>
              <div className='stat-card'>
                <span className='stat-label'>Pipeline Velocity ($/day MRR)</span>
                <span className='stat-val text-primary'>${attribution.pipelineVelocityDailyMRR.toLocaleString()}</span>
              </div>
              <div className='stat-card'>
                <span className='stat-label'>Closed-Won Value</span>
                <span className='stat-val text-success'>${attribution.closedWonValue.toLocaleString()}</span>
              </div>
              <div className='stat-card'>
                <span className='stat-label'>Win Rate</span>
                <span className='stat-val text-warning'>{attribution.winRatePercent}%</span>
              </div>
              <div className='stat-card'>
                <span className='stat-label'>Average Deal Size</span>
                <span className='stat-val text-primary'>${attribution.avgDealSize.toLocaleString()}</span>
              </div>
              <div className='stat-card'>
                <span className='stat-label'>Sales Cycle</span>
                <span className='stat-val'>{attribution.avgSalesCycleDays} Days</span>
              </div>
            </div>
          )}

          <div className='gtm-grid-2col' style={{ marginTop: '1.5rem' }}>
            {/* Multi-Touch Models */}
            <div className='gtm-card'>
              <h3 className='gtm-card-title'>Multi-Touch Attribution Weights</h3>
              <p className='gtm-card-desc'>
                Compares revenue credited to customer support AI interactions across First-Touch, Last-Touch, and Linear models.
              </p>

              {attribution?.attributionModels && (
                <div className='attribution-models-list'>
                  <div className='attr-model-box'>
                    <strong>First-Touch Inbound Drivers:</strong>
                    <ul>
                      {Object.entries(attribution.attributionModels.firstTouch || {}).map(([k, v]) => (
                        <li key={k}><code>{k}</code>: ${v.toLocaleString()}</li>
                      ))}
                    </ul>
                  </div>

                  <div className='attr-model-box'>
                    <strong>Last-Touch Closing Touches:</strong>
                    <ul>
                      {Object.entries(attribution.attributionModels.lastTouch || {}).map(([k, v]) => (
                        <li key={k}><code>{k}</code>: ${v.toLocaleString()}</li>
                      ))}
                    </ul>
                  </div>

                  <div className='attr-model-box'>
                    <strong>Linear Multi-Touch Distribution:</strong>
                    <ul>
                      {Object.entries(attribution.attributionModels.linear || {}).map(([k, v]) => (
                        <li key={k}><code>{k}</code>: ${v.toLocaleString()}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Idempotent CRM Sync */}
            <div className='gtm-card'>
              <h3 className='gtm-card-title'>Idempotent CRM Sync Adapter</h3>
              <p className='gtm-card-desc'>
                Synchronizes GTM entity changes into HubSpot/Salesforce with cryptographic idempotency key protection against duplicates.
              </p>

              <form onSubmit={handleSyncCRM} className='gtm-form'>
                <div className='form-group'>
                  <label htmlFor='crm-system'>Target CRM Platform</label>
                  <select
                    id='crm-system'
                    value={crmSyncForm.crmSystem}
                    onChange={(e) => setCrmSyncForm({ ...crmSyncForm, crmSystem: e.target.value })}
                  >
                    <option value='HubSpot'>HubSpot Enterprise CRM</option>
                    <option value='Salesforce'>Salesforce Sales Cloud</option>
                  </select>
                </div>

                <div className='form-row'>
                  <div className='form-group'>
                    <label htmlFor='crm-entity'>Entity Type</label>
                    <select
                      id='crm-entity'
                      value={crmSyncForm.entityType}
                      onChange={(e) => setCrmSyncForm({ ...crmSyncForm, entityType: e.target.value })}
                    >
                      <option value='ACCOUNT'>ACCOUNT</option>
                      <option value='CONTACT'>CONTACT</option>
                      <option value='OPPORTUNITY'>OPPORTUNITY</option>
                    </select>
                  </div>

                  <div className='form-group'>
                    <label htmlFor='crm-id'>Entity ID</label>
                    <input
                      id='crm-id'
                      type='text'
                      value={crmSyncForm.entityId}
                      onChange={(e) => setCrmSyncForm({ ...crmSyncForm, entityId: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className='form-group'>
                  <label htmlFor='crm-key'>Idempotency Key</label>
                  <input
                    id='crm-key'
                    type='text'
                    value={crmSyncForm.idempotencyKey}
                    onChange={(e) => setCrmSyncForm({ ...crmSyncForm, idempotencyKey: e.target.value })}
                    required
                  />
                </div>

                <button type='submit' className='btn-primary' disabled={loading}>
                  🔁 Execute Idempotent CRM Sync
                </button>
              </form>

              {crmSyncResult && (
                <div className={`sync-result-box ${crmSyncResult.idempotent ? 'sync-cached' : 'sync-success'}`}>
                  <strong>Sync Status: {crmSyncResult.status}</strong>
                  <p>
                    {crmSyncResult.idempotent
                      ? '⚡ Request was recognized as a duplicate and processed idempotently without side-effects.'
                      : '✅ Successfully synced new record to CRM system.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
