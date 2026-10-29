/* global localStorage */
import { useState, useEffect, useCallback } from 'react'
import GTMCommandCenter from './components/GTMCommandCenter.jsx'

const API = '/api'

export default function App () {
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'tickets' | 'docs'
  const [activeConv, setActiveConv] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Tickets state
  const [tickets, setTickets] = useState([])
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketSeverity, setTicketSeverity] = useState('Auto')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [resolveNote, setResolveNote] = useState('')

  // Knowledge docs state
  const [docs, setDocs] = useState([])
  const [docSearchQuery, setDocSearchQuery] = useState('')

  // Tools & Fine-Tuning state
  const [tools, setTools] = useState([])
  const [ftStats, setFtStats] = useState(null)
  const [ftFormat, setFtFormat] = useState('gemini') // 'gemini' | 'openai'
  const [ftSplit, setFtSplit] = useState('train') // 'train' | 'eval' | 'all'
  const [ftDataset, setFtDataset] = useState([])
  const [ftGenerating, setFtGenerating] = useState(false)
  const [activeToolTest, setActiveToolTest] = useState('check_system_status')
  const [toolTestArgs, setToolTestArgs] = useState('{\n  "serviceName": "vpn"\n}')
  const [toolTestResult, setToolTestResult] = useState(null)
  const [toolTestLoading, setToolTestLoading] = useState(false)
  const [copiedDataset, setCopiedDataset] = useState(false)

  // RAG & Multi-Model LLM state
  const [selectedProvider, setSelectedProvider] = useState('auto')
  const [llmProviders, setLlmProviders] = useState([])
  const [ragTelemetryModal, setRagTelemetryModal] = useState({ open: false, data: null, query: '' })
  const [streamEnabled, setStreamEnabled] = useState(false)

  // Database & Ingestion Pipeline state
  const [dbHealth, setDbHealth] = useState(null)
  const [dbStats, setDbStats] = useState(null)
  const [pipelineSources, setPipelineSources] = useState([])
  const [pipelineJobs, setPipelineJobs] = useState([])
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [reaEvidence, setReaEvidence] = useState(null)
  const [dbIntegrity, setDbIntegrity] = useState(null)
  const [ingestForm, setIngestForm] = useState({
    title: '',
    category: 'it',
    content: '',
    keywords: ''
  })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const request = useCallback(
    async (path, opts = {}) => {
      const headers = { 'Content-Type': 'application/json', ...opts.headers }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API}${path}`, { ...opts, headers })
      let data
      try {
        data = await res.json()
      } catch {
        data = {}
      }
      if (!res.ok) {
        const err = new Error(data.error || 'Request failed')
        err.status = res.status
        err.code = data.code
        throw err
      }
      return data
    },
    [token]
  )

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await request('/auth/me')
      setUser(data.user)
    } catch {
      logout()
    }
  }, [request])

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await request('/chat/conversations')
      setConversations(data.conversations || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await request('/tickets')
      setTickets(data.tickets || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  const fetchDocs = useCallback(
    async (query = '') => {
      try {
        const path = query ? `/knowledge/search?q=${encodeURIComponent(query)}` : '/knowledge/docs'
        const { data } = await request(path)
        if (query) {
          setDocs(data.results.map((r) => r.document))
        } else {
          setDocs(data.documents || [])
        }
      } catch (err) {
        console.error(err)
      }
    },
    [request]
  )

  const fetchTools = useCallback(async () => {
    try {
      const { data } = await request('/tools')
      setTools(data.tools || [])
    } catch (err) {
      console.error(err)
    }
  }, [request])

  const fetchFineTuningStats = useCallback(async () => {
    try {
      const { data } = await request('/finetuning/stats')
      setFtStats(data.stats || null)
    } catch (err) {
      console.error(err)
    }
  }, [request])

  const fetchFineTuningDataset = useCallback(
    async (format = 'gemini', split = 'train') => {
      try {
        const { data } = await request(`/finetuning/export?format=${format}&split=${split}`)
        setFtDataset(data.dataset || [])
      } catch (err) {
        console.error(err)
      }
    },
    [request]
  )

  const fetchLLMProviders = useCallback(async () => {
    try {
      const { data } = await request('/llm/providers')
      setLlmProviders(data.providers || [])
      const active = data.providers?.find((p) => p.active)
      if (active) setSelectedProvider(active.id)
    } catch (err) {
      console.error(err)
    }
  }, [request])

  const fetchDbAndPipeline = useCallback(async () => {
    try {
      const [healthRes, statsRes, sourcesRes, jobsRes, evidenceRes, integrityRes] = await Promise.all([
        request('/db/health').catch(() => ({ data: { health: null } })),
        request('/db/stats').catch(() => ({ data: { stats: null } })),
        request('/pipeline/sources').catch(() => ({ data: { sources: [] } })),
        request('/pipeline/jobs').catch(() => ({ data: { jobs: [] } })),
        request('/db/rea-evidence').catch(() => ({ data: { evidence: null } })),
        request('/db/integrity').catch(() => ({ data: { integrity: null } }))
      ])
      setDbHealth(healthRes.data?.health || null)
      setDbStats(statsRes.data?.stats || null)
      setPipelineSources(sourcesRes.data?.sources || [])
      setPipelineJobs(jobsRes.data?.jobs || [])
      setReaEvidence(evidenceRes.data?.evidence || null)
      setDbIntegrity(integrityRes.data?.integrity || null)
    } catch (err) {
      console.error(err)
    }
  }, [request])

  useEffect(() => {
    if (token) {
      fetchProfile()
      fetchConversations()
      fetchTickets()
      fetchDocs()
      fetchTools()
      fetchFineTuningStats()
      fetchFineTuningDataset(ftFormat, ftSplit)
      fetchLLMProviders()
      fetchDbAndPipeline()
    }
  }, [token, fetchProfile, fetchConversations, fetchTickets, fetchDocs, fetchTools, fetchFineTuningStats, fetchFineTuningDataset, fetchLLMProviders, fetchDbAndPipeline, ftFormat, ftSplit])

  const fetchMessages = async (id) => {
    try {
      const { data } = await request(`/chat/conversations/${id}`)
      setMessages(data.messages || [])
      setActiveConv(id)
      setActiveTab('chat')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = form.get('email')
    const password = form.get('password')
    try {
      setLoading(true)
      setError(null)
      const { data } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      setToken(data.token)
      localStorage.setItem('token', data.token)
      setUser(data.user)
      showToast(`Welcome back, ${data.user.name}!`)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = form.get('email')
    const password = form.get('password')
    const name = form.get('name')
    const role = form.get('role') || 'employee'
    try {
      setLoading(true)
      setError(null)
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, role })
      })
      showToast('Account registered successfully! Please sign in.')
      setError(null)
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setToken(null)
    localStorage.removeItem('token')
    setUser(null)
    setConversations([])
    setMessages([])
    setActiveConv(null)
  }

  const newConversation = () => {
    setMessages([])
    setActiveConv(null)
    setActiveTab('chat')
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (ragTelemetryModal.open) {
          setRagTelemetryModal({ open: false, data: null, query: '' })
        }
        if (selectedTicket) {
          setSelectedTicket(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ragTelemetryModal.open, selectedTicket])

  const handleAsk = async (e) => {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    try {
      if (streamEnabled) {
        const userMsg = { id: 'user-' + Date.now(), role: 'user', content: q }
        const assistantMsg = {
          id: 'assistant-' + Date.now(),
          role: 'assistant',
          content: '',
          metadata: { streaming: true, sources: [] }
        }
        setMessages((prev) => [...prev, userMsg, assistantMsg])
        setInput('')

        const headers = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(`${API}/chat/ask/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            conversationId: activeConv,
            question: q,
            provider: selectedProvider
          })
        })

        if (!res.ok) {
          throw new Error(`Streaming failed with status ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let streamText = ''
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const chunk = JSON.parse(line.slice(6))
                if (chunk.type === 'token') {
                  streamText += chunk.token
                  setMessages((prev) => {
                    const updated = [...prev]
                    const lastIdx = updated.length - 1
                    if (lastIdx >= 0) {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: streamText
                      }
                    }
                    return updated
                  })
                } else if (chunk.type === 'start') {
                  setMessages((prev) => {
                    const updated = [...prev]
                    const lastIdx = updated.length - 1
                    if (lastIdx >= 0) {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        metadata: {
                          ...updated[lastIdx].metadata,
                          provider: chunk.provider,
                          sources: chunk.sources,
                          confidence: chunk.confidence,
                          toolCalls: chunk.toolCalls
                        }
                      }
                    }
                    return updated
                  })
                } else if (chunk.type === 'done') {
                  setMessages((prev) => {
                    const updated = [...prev]
                    const lastIdx = updated.length - 1
                    if (lastIdx >= 0) {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: chunk.answer || streamText,
                        metadata: {
                          ...updated[lastIdx].metadata,
                          streaming: false,
                          groundedness: chunk.groundedness,
                          needsEscalation: chunk.needsEscalation
                        }
                      }
                    }
                    return updated
                  })
                }
              } catch {
                // Ignore incomplete SSE control frames
              }
            }
          }
        }
        await fetchConversations()
      } else {
        const { data } = await request('/chat/ask', {
          method: 'POST',
          body: JSON.stringify({
            conversationId: activeConv,
            question: q,
            provider: selectedProvider
          })
        })
        setInput('')
        setActiveConv(data.conversationId)
        await fetchConversations()
        await fetchMessages(data.conversationId)
      }
    } catch (err) {
      setError(err.message || 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleChangeProvider = async (providerId) => {
    setSelectedProvider(providerId)
    try {
      await request('/llm/providers/select', {
        method: 'POST',
        body: JSON.stringify({ provider: providerId })
      })
      showToast(`Active LLM Model switched to: ${providerId.toUpperCase()}`)
    } catch (err) {
      console.error(err)
    }
  }

  const handleInspectRagTelemetry = async (queryText) => {
    const q = queryText || 'VPN AnyConnect remote access'
    try {
      setLoading(true)
      const { data } = await request(`/rag/inspect?q=${encodeURIComponent(q)}`)
      setRagTelemetryModal({ open: true, data: data.telemetry, query: q })
    } catch (err) {
      setError(err.message || 'Failed to fetch RAG telemetry')
    } finally {
      setLoading(false)
    }
  }

  const handleRunPipeline = async (pipelineName) => {
    try {
      setPipelineLoading(true)
      const { data } = await request('/pipeline/run', {
        method: 'POST',
        body: JSON.stringify({ pipelineName })
      })
      showToast(`Pipeline ${pipelineName} completed! Processed: ${data.job.processedItems} item(s) in ${data.job.durationMs}ms`)
      await fetchDbAndPipeline()
      await fetchDocs()
    } catch (err) {
      setError(err.message || 'Pipeline execution failed')
    } finally {
      setPipelineLoading(false)
    }
  }

  const handleIngestDocument = async (e) => {
    e.preventDefault()
    if (!ingestForm.title.trim() || !ingestForm.content.trim()) return
    try {
      setPipelineLoading(true)
      const { data } = await request('/pipeline/ingest', {
        method: 'POST',
        body: JSON.stringify(ingestForm)
      })
      showToast(`Document "${data.document.title}" ingested & indexed into RAG!`)
      setIngestForm({ title: '', category: 'it', content: '', keywords: '' })
      await fetchDbAndPipeline()
      await fetchDocs()
    } catch (err) {
      setError(err.message || 'Document ingestion failed')
    } finally {
      setPipelineLoading(false)
    }
  }

  const handleRunDbOptimize = async () => {
    try {
      setPipelineLoading(true)
      const res = await request('/db/optimize', { method: 'POST' })
      showToast(`Database optimized & WAL checkpoint truncated in ${res.data?.result?.durationMs || 0}ms!`)
      await fetchDbAndPipeline()
    } catch (err) {
      setError(err.message || 'Optimization failed')
    } finally {
      setPipelineLoading(false)
    }
  }

  const handleEscalateFromChat = (lastQuestion) => {
    setTicketSubject(`Escalated from Chat: ${lastQuestion.slice(0, 50)}...`)
    setTicketDesc(`User Inquiry:\n"${lastQuestion}"\n\nAI bot had low confidence or requested human support.`)
    setActiveTab('tickets')
  }

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!ticketSubject.trim() || !ticketDesc.trim()) return
    try {
      setLoading(true)
      setError(null)
      const payload = {
        subject: ticketSubject.trim(),
        description: ticketDesc.trim()
      }
      if (ticketSeverity !== 'Auto') {
        payload.severity = ticketSeverity
      }
      const { data } = await request('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      showToast(`Ticket created! Assigned: ${data.ticket.severity} (${data.ticket.slaHours}h SLA)`)
      setTicketSubject('')
      setTicketDesc('')
      setTicketSeverity('Auto')
      await fetchTickets()
    } catch (err) {
      setError(err.message || 'Failed to create ticket')
    } finally {
      setLoading(false)
    }
  }

  const handleResolveTicket = async (id) => {
    try {
      setLoading(true)
      const { data } = await request(`/tickets/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ note: resolveNote || 'Resolved by support team' })
      })
      showToast(`Ticket ${data.ticket.id} marked as resolved!`)
      setSelectedTicket(null)
      setResolveNote('')
      await fetchTickets()
    } catch (err) {
      setError(err.message || 'Failed to resolve ticket')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateDataset = async () => {
    try {
      setFtGenerating(true)
      const res = await request('/finetuning/generate', { method: 'POST' })
      setFtStats(res.data.stats)
      await fetchFineTuningDataset(ftFormat, ftSplit)
      showToast('Synthetic fine-tuning dataset regenerated successfully from corporate documentation!')
    } catch (err) {
      setError(err.message || 'Failed to regenerate dataset')
    } finally {
      setFtGenerating(false)
    }
  }

  const handleDownloadJsonl = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/finetuning/export?format=${ftFormat}&split=${ftSplit}&jsonl=true`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `b2b-support-${ftFormat}-${ftSplit}.jsonl`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showToast(`Exported ${ftFormat.toUpperCase()} (${ftSplit}) JSONL training file!`)
    } catch (err) {
      setError(err.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExecuteToolTest = async () => {
    try {
      setToolTestLoading(true)
      setToolTestResult(null)
      let parsedArgs = {}
      if (toolTestArgs.trim()) {
        try {
          parsedArgs = JSON.parse(toolTestArgs)
        } catch {
          throw new Error('Arguments must be valid JSON format')
        }
      }
      const { data } = await request('/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ name: activeToolTest, args: parsedArgs })
      })
      setToolTestResult(data.result)
      showToast(`Tool ${activeToolTest} executed successfully!`)
    } catch (err) {
      setToolTestResult({ error: err.message })
    } finally {
      setToolTestLoading(false)
    }
  }

  const handleSelectToolForTest = (toolName) => {
    setActiveToolTest(toolName)
    setToolTestResult(null)
    const defaults = {
      check_system_status: '{\n  "serviceName": "vpn"\n}',
      check_ticket_status: tickets.length > 0
        ? `{\n  "ticketId": "${tickets[0].id}"\n}`
        : '{\n  "ticketId": "ticket-sample-123"\n}',
      calculate_pto_balance: '{\n  "daysTaken": 4,\n  "monthsTenure": 14\n}',
      search_knowledge_base: '{\n  "query": "vpn connection",\n  "category": "it"\n}',
      create_support_ticket: '{\n  "subject": "VPN connection drops every 10 minutes",\n  "description": "After upgrading MacOS to Sequoia, Cisco AnyConnect disconnects frequently.",\n  "severity": "Sev 3"\n}'
    }
    setToolTestArgs(defaults[toolName] || '{}')
  }

  const handleCopyDataset = () => {
    if (ftDataset.length === 0) return
    const text = JSON.stringify(ftDataset.slice(0, 5), null, 2)
    navigator.clipboard.writeText(text)
    setCopiedDataset(true)
    setTimeout(() => setCopiedDataset(false), 2500)
    showToast('Copied sample dataset JSON to clipboard!')
  }

  // Auth View
  const [authMode, setAuthMode] = useState('login')
  if (!token) {
    return (
      <div className='auth-wrapper'>
        <div className='auth-card'>
          <div className='brand-header'>
            <div className='bot-icon'>🤖</div>
            <h1>B2B Support AI Bot</h1>
            <p className='subtitle'>Enterprise Knowledge RAG & Support Operations</p>
          </div>
          {error && <div className='alert error'>{error}</div>}
          {toast && <div className='alert success'>{toast.msg}</div>}

          {authMode === 'login'
            ? (
              <form onSubmit={handleLogin}>
                <div className='form-group'>
                  <label>Email Address</label>
                  <input name='email' type='email' defaultValue='employee@company.com' required />
                </div>
                <div className='form-group'>
                  <label>Password</label>
                  <input name='password' type='password' defaultValue='password123' required />
                </div>
                <button type='submit' className='btn primary block' disabled={loading}>
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
                <div className='auth-toggle'>
                  Need an account?{' '}
                  <a onClick={() => setAuthMode('register')}>Create one</a>
                </div>
              </form>
              )
            : (
              <form onSubmit={handleRegister}>
                <div className='form-group'>
                  <label>Full Name</label>
                  <input name='name' placeholder='John Doe' required />
                </div>
                <div className='form-group'>
                  <label>Email Address</label>
                  <input name='email' type='email' placeholder='john@company.com' required />
                </div>
                <div className='form-group'>
                  <label>Password</label>
                  <input name='password' type='password' placeholder='••••••••' required />
                </div>
                <div className='form-group'>
                  <label>Account Role</label>
                  <select name='role' defaultValue='employee'>
                    <option value='employee'>Employee</option>
                    <option value='support_agent'>Support Agent</option>
                    <option value='admin'>Administrator</option>
                  </select>
                </div>
                <button type='submit' className='btn primary block' disabled={loading}>
                  {loading ? 'Creating Account...' : 'Register'}
                </button>
                <div className='auth-toggle'>
                  Already registered?{' '}
                  <a onClick={() => setAuthMode('login')}>Sign in</a>
                </div>
              </form>
              )}
        </div>
      </div>
    )
  }

  return (
    <div className='app-layout'>
      {/* Sidebar */}
      <aside className='sidebar'>
        <div className='sidebar-header'>
          <div className='bot-badge'>
            <span className='dot' /> Support AI
          </div>
          <span className='role-tag'>{user?.role}</span>
        </div>

        <div className='nav-section'>
          <div className='section-title'>Navigation</div>
          <button
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Knowledge Chat
          </button>
          <button
            className={`nav-item ${activeTab === 'tickets' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('tickets')
              fetchTickets()
            }}
          >
            🎫 Support Tickets ({tickets.length})
          </button>
          <button
            className={`nav-item ${activeTab === 'docs' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('docs')
              fetchDocs()
            }}
          >
            📚 Corporate Policies ({docs.length})
          </button>
          <button
            className={`nav-item ${activeTab === 'finetuning' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('finetuning')
              fetchTools()
              fetchFineTuningStats()
              fetchFineTuningDataset(ftFormat, ftSplit)
            }}
          >
            🛠️ Tools & Fine-Tuning
          </button>
          <button
            className={`nav-item ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('pipeline')
              fetchDbAndPipeline()
            }}
          >
            🗄️ Database & Pipeline
          </button>
          <button
            className={`nav-item ${activeTab === 'gtm' ? 'active' : ''}`}
            onClick={() => setActiveTab('gtm')}
          >
            🚀 AI-GTM Command Center
          </button>
        </div>

        {activeTab === 'chat' && (
          <div className='conv-section'>
            <div className='section-header'>
              <span>Conversations</span>
              <button className='btn-small' onClick={newConversation}>
                + New
              </button>
            </div>
            <div className='conv-list'>
              {conversations.length === 0
                ? (
                  <div className='empty-sub'>No conversations yet</div>
                  )
                : (
                    conversations.map((c) => (
                      <button
                        key={c.id}
                        className={`conv-item ${activeConv === c.id ? 'active' : ''}`}
                        onClick={() => fetchMessages(c.id)}
                      >
                        {c.title}
                      </button>
                    ))
                  )}
            </div>
          </div>
        )}

        <div className='sidebar-footer'>
          <div className='user-info'>
            <div className='user-name'>{user?.name}</div>
            <div className='user-email'>{user?.email}</div>
          </div>
          <button className='btn outline danger-btn' onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className='main-viewport'>
        {toast && (
          <div className={`toast-notification ${toast.type}`} role='status' aria-live='polite'>
            {toast.msg}
          </div>
        )}
        {error && (
          <div className='toast-notification error' role='alert' aria-live='assertive'>
            {error}
          </div>
        )}

        {/* Tab 1: Knowledge Chat */}
        {activeTab === 'chat' && (
          <div className='chat-view'>
            <header className='viewport-header'>
              <div>
                <h2>Corporate Knowledge Assistant</h2>
                <p className='subtext'>BM25 + Dense Semantic RRF Grounding with Multi-Model Execution</p>
              </div>
              <div className='header-meta'>
                <div className='llm-selector-wrapper'>
                  <label htmlFor='llm-provider-select' className='selector-label'>Model:</label>
                  <select
                    id='llm-provider-select'
                    className='llm-dropdown'
                    value={selectedProvider}
                    onChange={(e) => handleChangeProvider(e.target.value)}
                  >
                    {llmProviders && llmProviders.length > 0
                      ? llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id === 'auto' ? '⚡ ' : p.id === 'gemini' ? '🔷 ' : p.id === 'openai' ? '🟢 ' : p.id === 'claude' ? '🟣 ' : p.id === 'ollama' ? '🦙 ' : '🛡️ '}
                          {p.name} {p.configured ? '' : '(unconfigured)'}
                        </option>
                      ))
                      : (
                        <>
                          <option value='auto'>⚡ Auto-Routing Orchestrator</option>
                          <option value='gemini'>🔷 Google Gemini 1.5 Flash</option>
                          <option value='openai'>🟢 OpenAI GPT-4o Mini</option>
                          <option value='claude'>🟣 Anthropic Claude 3.5 Sonnet</option>
                          <option value='ollama'>🦙 Ollama Local LLM</option>
                          <option value='local-hybrid-rag'>🛡️ Local Hybrid RAG (Air-Gapped)</option>
                        </>
                        )}
                  </select>
                </div>
                <label className='stream-toggle-label' title='Toggle token streaming via Server-Sent Events'>
                  <input
                    type='checkbox'
                    id='stream-toggle'
                    checked={streamEnabled}
                    onChange={(e) => setStreamEnabled(e.target.checked)}
                  />
                  <span>⚡ SSE Stream</span>
                </label>
                <button
                  className='btn-small outline'
                  onClick={() => handleInspectRagTelemetry(input || 'VPN connection')}
                  title='Open RAG Diagnostic Inspector'
                >
                  🔬 RAG Telemetry
                </button>
                <span className='status-pill online'>RAG Grounded</span>
              </div>
            </header>

            <div className='chat-messages-container'>
              {messages.length === 0
                ? (
                  <div className='chat-hero'>
                    <div className='hero-icon'>⚡</div>
                    <h3>How can I assist you today?</h3>
                    <p>Ask corporate questions or trigger autonomous enterprise tools (system health check, PTO balance, ticket lookup).</p>
                    <div className='quick-prompts'>
                      <button onClick={() => setInput('How do I reset my corporate password?')}>
                        🔑 Password Reset
                      </button>
                      <button onClick={() => setInput('Is VPN or Okta down right now? Check system status')}>
                        🛠️ System Health Probe
                      </button>
                      <button onClick={() => setInput('Calculate my PTO balance: 4 days taken, 14 months tenure')}>
                        🏖️ Calculate PTO Tool
                      </button>
                      <button onClick={() => setInput('What are the IT support SLA response times?')}>
                        ⏱️ Support SLAs
                      </button>
                    </div>
                  </div>
                  )
                : (
                    messages.map((m) => (
                      <div key={m.id} className={`message-row ${m.role}`}>
                        <div className='message-bubble'>
                          <div className='message-content'>{m.content}</div>

                          {m.metadata && (
                            <div className='message-footer'>
                              {m.metadata.toolCalls?.length > 0 && (
                                <div className='tool-calls-container'>
                                  <div className='tool-calls-title'>
                                    <span>🛠️ Autonomous Agent Tools ({m.metadata.toolCalls.length}):</span>
                                  </div>
                                  <div className='tool-calls-list'>
                                    {m.metadata.toolCalls.map((tc, idx) => (
                                      <div key={idx} className='tool-call-badge'>
                                        <div className='tool-call-top'>
                                          <span className='tool-call-name'>⚡ {tc.name}</span>
                                          <span className={`tool-call-status ${tc.output?.error ? 'failed' : 'ok'}`}>
                                            {tc.output?.error ? 'FAILED' : 'EXECUTED'}
                                          </span>
                                        </div>
                                        <div className='tool-call-args'>
                                          <code>{JSON.stringify(tc.args)}</code>
                                        </div>
                                        {tc.output && (
                                          <div className='tool-call-output'>
                                            {tc.output.error
                                              ? tc.output.error
                                              : tc.output.status
                                                ? `${tc.output.service?.toUpperCase() || 'SYSTEM'}: ${tc.output.status} (${tc.output.latencyMs || 0}ms latency)`
                                                : tc.output.ticketId
                                                  ? `Created Ticket #${tc.output.ticketId} [${tc.output.severity}] - Target SLA: ${tc.output.slaDeadline}`
                                                  : tc.output.totalDays
                                                    ? `Total: ${tc.output.totalDays}d | Rem: ${tc.output.remainingBalance}d | Rollover: ${tc.output.maxRolloverEligible}d`
                                                    : tc.output.foundCount !== undefined
                                                      ? `Found ${tc.output.foundCount} knowledge base match(es)`
                                                      : tc.output.subject
                                                        ? `Ticket #${tc.output.id} [${tc.output.status?.toUpperCase()}] - SLA Target: ${tc.output.slaHours}h`
                                                        : JSON.stringify(tc.output).slice(0, 100)}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {m.metadata.sources?.length > 0 && (
                                <div className='sources-container'>
                                  <span className='sources-title'>Verified Sources:</span>
                                  <div className='sources-tags'>
                                    {m.metadata.sources.map((s) => (
                                      <span key={s.id} className='source-pill'>
                                        📄 {s.title} ({s.category})
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className='meta-stats'>
                                <span className='confidence-pill'>
                                  Confidence: {(m.metadata.confidence * 100).toFixed(0)}%
                                </span>
                                <span className='provider-pill'>
                                  Engine: {m.metadata.provider || 'RAG'}
                                </span>
                                {m.metadata.groundedness && (
                                  <span className={`groundedness-pill ${m.metadata.groundedness.isGrounded ? 'grounded' : 'unverified'}`}>
                                    🛡️ {(m.metadata.groundedness.score * 100).toFixed(0)}% Grounded
                                  </span>
                                )}
                                <button
                                  className='rag-inspect-btn'
                                  onClick={() => handleInspectRagTelemetry(m.content)}
                                  title='Inspect BM25, Dense Cosine, and RRF Telemetry'
                                >
                                  🔍 RAG Telemetry
                                </button>
                              </div>

                              {m.metadata.needsEscalation && (
                                <div className='escalate-banner'>
                                  <span>Low confidence answer or requires IT intervention.</span>
                                  <button
                                    className='btn-small warning'
                                    onClick={() => handleEscalateFromChat(m.content)}
                                  >
                                    🚨 Escalate to Human Support
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
            </div>

            <form className='chat-input-bar' onSubmit={handleAsk}>
              <input
                type='text'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='Ask about company policies, IT help, benefits, hardware requests...'
                disabled={loading}
              />
              <button type='submit' className='btn primary' disabled={loading || !input.trim()}>
                {loading ? 'Thinking...' : 'Send'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Support Tickets & SLA Management */}
        {activeTab === 'tickets' && (
          <div className='tickets-view'>
            <header className='viewport-header'>
              <div>
                <h2>Enterprise Support Tickets & SLA Operations</h2>
                <p className='subtext'>Auto-triaged by severity and SLA deadlines</p>
              </div>
            </header>

            <div className='tickets-content'>
              {/* Ticket Creation Card */}
              <div className='ticket-form-card'>
                <h3>Open Support Ticket</h3>
                <form onSubmit={handleCreateTicket}>
                  <div className='form-group'>
                    <label>Subject</label>
                    <input
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder='e.g. Production API Gateway down'
                      required
                    />
                  </div>
                  <div className='form-group'>
                    <label>Issue Description</label>
                    <textarea
                      rows={3}
                      value={ticketDesc}
                      onChange={(e) => setTicketDesc(e.target.value)}
                      placeholder='Describe the issue, affected systems, and urgency...'
                      required
                    />
                  </div>
                  <div className='form-row'>
                    <div className='form-group'>
                      <label>Severity Level</label>
                      <select
                        value={ticketSeverity}
                        onChange={(e) => setTicketSeverity(e.target.value)}
                      >
                        <option value='Auto'>Auto-Triage (Rule Engine)</option>
                        <option value='Sev 1'>Sev 1 - Critical Outage (15m SLA)</option>
                        <option value='Sev 2'>Sev 2 - High Priority (2h SLA)</option>
                        <option value='Sev 3'>Sev 3 - Medium Priority (8h SLA)</option>
                        <option value='Sev 4'>Sev 4 - Low Request (24h SLA)</option>
                      </select>
                    </div>
                    <button type='submit' className='btn primary' disabled={loading}>
                      {loading ? 'Submitting...' : 'Submit Ticket'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Tickets Table */}
              <div className='tickets-table-card'>
                <h3>Active & Historic Tickets</h3>
                {tickets.length === 0
                  ? (
                    <div className='empty-sub'>No tickets on record.</div>
                    )
                  : (
                    <div className='tickets-list'>
                      {tickets.map((t) => (
                        <div
                          key={t.id}
                          className={`ticket-card ${selectedTicket?.id === t.id ? 'selected' : ''}`}
                          onClick={() => setSelectedTicket(t)}
                        >
                          <div className='ticket-header'>
                            <span className={`badge ${t.severity.replace(' ', '-').toLowerCase()}`}>
                              {t.severity}
                            </span>
                            <span className={`badge status-${t.status}`}>{t.status.toUpperCase()}</span>
                            <span className='ticket-date'>
                              {new Date(t.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className='ticket-subject'>{t.subject}</h4>
                          <p className='ticket-snippet'>{t.description}</p>
                          <div className='ticket-meta'>
                            <span>Team: {t.assignedTeam}</span>
                            <span>SLA Target: {t.slaHours}h</span>
                            <span className={`sentiment-pill ${t.sentiment}`}>
                              Sentiment: {t.sentiment}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
              </div>
            </div>

            {/* Selected Ticket Modal */}
            {selectedTicket && (
              <div className='modal-backdrop' onClick={() => setSelectedTicket(null)}>
                <div className='modal-card' onClick={(e) => e.stopPropagation()}>
                  <div className='modal-header'>
                    <h3>Ticket Details: {selectedTicket.id}</h3>
                    <button className='close-btn' onClick={() => setSelectedTicket(null)}>
                      ×
                    </button>
                  </div>
                  <div className='modal-body'>
                    <p><strong>Subject:</strong> {selectedTicket.subject}</p>
                    <p><strong>Description:</strong> {selectedTicket.description}</p>
                    <p><strong>Requester:</strong> {selectedTicket.userEmail}</p>
                    <p><strong>Assigned Team:</strong> {selectedTicket.assignedTeam}</p>
                    <p><strong>SLA Deadline:</strong> {new Date(selectedTicket.slaDeadline).toLocaleString()}</p>

                    <div className='timeline-box'>
                      <h4>Audit Timeline</h4>
                      <ul>
                        {selectedTicket.timeline.map((item, idx) => (
                          <li key={idx}>
                            <span className='time'>{new Date(item.timestamp).toLocaleTimeString()}:</span> {item.action} — {item.note}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {selectedTicket.status !== 'resolved' && (user?.role === 'admin' || user?.role === 'support_agent') && (
                      <div className='resolve-action-box'>
                        <h4>Resolve Ticket</h4>
                        <input
                          placeholder='Resolution notes / fix details...'
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                        />
                        <button
                          className='btn success'
                          onClick={() => handleResolveTicket(selectedTicket.id)}
                          disabled={loading}
                        >
                          Mark as Resolved
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RAG Telemetry & Diagnostics Modal */}
        {ragTelemetryModal?.open && (
          <div className='modal-backdrop' onClick={() => setRagTelemetryModal({ open: false, data: null, query: '' })}>
            <div className='modal-card rag-modal-card' onClick={(e) => e.stopPropagation()}>
              <div className='modal-header'>
                <div>
                  <h3>🔬 RAG Retrieval & Semantic Diagnostics</h3>
                  <p className='modal-sub'>BM25 Sparse + Dense Cosine Embedding + Reciprocal Rank Fusion (RRF)</p>
                </div>
                <button className='close-btn' onClick={() => setRagTelemetryModal({ open: false, data: null, query: '' })}>
                  ×
                </button>
              </div>

              <div className='modal-body rag-modal-body'>
                <div className='rag-telemetry-query-box'>
                  <strong>Evaluated Query: </strong>
                  <code>"{ragTelemetryModal.query}"</code>
                  <span className='latency-pill'>⏱️ {ragTelemetryModal.data?.latencyMs || 1}ms latency</span>
                </div>

                {/* Domain Query Expansions */}
                <div className='rag-section'>
                  <h4>1. Domain-Aware Query Expansion</h4>
                  <div className='tokens-cloud'>
                    {ragTelemetryModal.data?.expandedTokens?.map((t, idx) => (
                      <span key={idx} className='token-pill'>#{t}</span>
                    ))}
                  </div>
                </div>

                {/* Reciprocal Rank Fusion Results */}
                <div className='rag-section'>
                  <h4>2. Reciprocal Rank Fusion (RRF) Scored Documents</h4>
                  <div className='telemetry-table-wrapper'>
                    <table className='telemetry-table'>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Document</th>
                          <th>Category</th>
                          <th>BM25 Score</th>
                          <th>Dense Cosine</th>
                          <th>RRF Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ragTelemetryModal.data?.hybridResults?.map((r, i) => (
                          <tr key={r.document.id}>
                            <td><strong>#{i + 1}</strong></td>
                            <td>{r.document.title}</td>
                            <td><span className='doc-category'>{r.document.category.toUpperCase()}</span></td>
                            <td>{r.telemetry?.bm25Score || 0}</td>
                            <td>{(r.telemetry?.denseScore || 0).toFixed(3)}</td>
                            <td><span className='badge status-resolved'>{r.telemetry?.rrfScore || 0}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Retrieved Chunks */}
                <div className='rag-section'>
                  <h4>3. Hierarchical Context Chunks (Top-Ranked Passages)</h4>
                  <div className='chunks-list'>
                    {ragTelemetryModal.data?.topChunks?.map((chunk) => (
                      <div key={chunk.chunkId} className='chunk-item'>
                        <div className='chunk-header'>
                          <span className='chunk-id'>{chunk.chunkId}</span>
                          <span className='chunk-title'>{chunk.parentTitle}</span>
                          <span className='chunk-score'>Relevance: {(chunk.score * 100).toFixed(0)}%</span>
                        </div>
                        <p className='chunk-text'>"{chunk.content}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Corporate Knowledge Base Explorer */}
        {activeTab === 'docs' && (
          <div className='docs-view'>
            <header className='viewport-header'>
              <div>
                <h2>Corporate Documentation & Policies</h2>
                <p className='subtext'>Indexed corporate documents used for RAG grounding</p>
              </div>
              <div className='search-bar'>
                <input
                  type='text'
                  placeholder='Search knowledge repository...'
                  value={docSearchQuery}
                  onChange={(e) => {
                    setDocSearchQuery(e.target.value)
                    fetchDocs(e.target.value)
                  }}
                />
              </div>
            </header>

            <div className='docs-grid'>
              {docs.map((doc) => (
                <div key={doc.id} className='doc-card'>
                  <div className='doc-header'>
                    <span className='doc-category'>{doc.category.toUpperCase()}</span>
                    <span className='doc-id'>{doc.id}</span>
                  </div>
                  <h3 className='doc-title'>{doc.title}</h3>
                  <p className='doc-body'>{doc.content}</p>
                  <div className='doc-keywords'>
                    {doc.keywords?.map((k, i) => (
                      <span key={i} className='keyword-tag'>
                        #{k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Agent Tools & Fine-Tuning Manager */}
        {activeTab === 'finetuning' && (
          <div className='finetuning-view'>
            <header className='viewport-header'>
              <div>
                <h2>Enterprise Tool Calling & Fine-Tuning Foundry</h2>
                <p className='subtext'>Model customization pipeline, synthetic training generator, and agent tool execution sandbox</p>
              </div>
              <div className='header-actions'>
                <button
                  className='btn primary'
                  onClick={handleRegenerateDataset}
                  disabled={ftGenerating}
                >
                  {ftGenerating ? '⏳ Generating...' : '⚡ Regenerate Synthetic Data'}
                </button>
                <button
                  className='btn success'
                  onClick={handleDownloadJsonl}
                  disabled={loading}
                >
                  ⬇️ Download JSONL ({ftFormat.toUpperCase()})
                </button>
              </div>
            </header>

            {/* KPI Cards Row */}
            <div className='ft-stats-row'>
              <div className='stat-card'>
                <div className='stat-label'>Total Training Pairs</div>
                <div className='stat-val'>{ftStats?.totalExamples || 0}</div>
                <div className='stat-desc'>Synthetic & historical tickets</div>
              </div>
              <div className='stat-card'>
                <div className='stat-label'>Synthetic Knowledge Pairs</div>
                <div className='stat-val'>{ftStats?.syntheticCount || 0}</div>
                <div className='stat-desc'>Grounded in 8 enterprise policies</div>
              </div>
              <div className='stat-card'>
                <div className='stat-label'>Historical Support Tickets</div>
                <div className='stat-val'>{ftStats?.ticketCount || 0}</div>
                <div className='stat-desc'>With PII auto-redaction applied</div>
              </div>
              <div className='stat-card'>
                <div className='stat-label'>Train / Eval Split</div>
                <div className='stat-val'>{ftStats?.splits?.train || 0} / {ftStats?.splits?.eval || 0}</div>
                <div className='stat-desc'>Deterministic 80% / 20% partition</div>
              </div>
              <div className='stat-card'>
                <div className='stat-label'>Registered Enterprise Tools</div>
                <div className='stat-val'>{tools.length || 5}</div>
                <div className='stat-desc'>Gemini & OpenAI callable schemas</div>
              </div>
            </div>

            <div className='finetuning-content-grid'>
              {/* Left Column: Fine-Tuning Exporter & Sample Inspector */}
              <div className='ft-panel ft-exporter-card'>
                <div className='panel-header'>
                  <div>
                    <h3>Fine-Tuning Dataset Exporter</h3>
                    <p className='panel-sub'>Select format and partition to preview or export</p>
                  </div>
                  <div className='format-toggle-group'>
                    <button
                      className={`toggle-btn ${ftFormat === 'gemini' ? 'active' : ''}`}
                      onClick={() => {
                        setFtFormat('gemini')
                        fetchFineTuningDataset('gemini', ftSplit)
                      }}
                    >
                      Gemini SFT
                    </button>
                    <button
                      className={`toggle-btn ${ftFormat === 'openai' ? 'active' : ''}`}
                      onClick={() => {
                        setFtFormat('openai')
                        fetchFineTuningDataset('openai', ftSplit)
                      }}
                    >
                      OpenAI ChatML
                    </button>
                  </div>
                </div>

                <div className='split-controls-row'>
                  <div className='split-selector'>
                    <span className='control-label'>Partition:</span>
                    <button
                      className={`split-btn ${ftSplit === 'train' ? 'active' : ''}`}
                      onClick={() => {
                        setFtSplit('train')
                        fetchFineTuningDataset(ftFormat, 'train')
                      }}
                    >
                      Train Set (80%)
                    </button>
                    <button
                      className={`split-btn ${ftSplit === 'eval' ? 'active' : ''}`}
                      onClick={() => {
                        setFtSplit('eval')
                        fetchFineTuningDataset(ftFormat, 'eval')
                      }}
                    >
                      Eval Set (20%)
                    </button>
                    <button
                      className={`split-btn ${ftSplit === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setFtSplit('all')
                        fetchFineTuningDataset(ftFormat, 'all')
                      }}
                    >
                      All ({ftStats?.totalExamples || 0})
                    </button>
                  </div>

                  <div className='action-buttons'>
                    <button className='btn-small' onClick={handleCopyDataset}>
                      {copiedDataset ? '✓ Copied' : '📋 Copy JSON'}
                    </button>
                  </div>
                </div>

                <div className='format-info-pill'>
                  {ftFormat === 'gemini'
                    ? '⚡ Google Gemini SFT: Structured with { contents: [{ role: "user", parts }, { role: "model", parts }] }'
                    : '🌐 OpenAI ChatML: Structured with { messages: [{ role: "system|user|assistant|tool", content, tool_calls }] }'}
                </div>

                <div className='dataset-code-container'>
                  <pre className='code-preview'>
                    {ftDataset.length === 0
                      ? '// Loading dataset...'
                      : JSON.stringify(ftDataset.slice(0, 3), null, 2)}
                  </pre>
                  {ftDataset.length > 3 && (
                    <div className='code-footer-note'>
                      Showing 3 of {ftDataset.length} training examples. Download full JSONL to view complete corpus.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Autonomous Agent Tools & Live Sandbox */}
              <div className='ft-panel ft-tools-card'>
                <div className='panel-header'>
                  <div>
                    <h3>Enterprise Agent Tools Sandbox</h3>
                    <p className='panel-sub'>Registered enterprise functions & real-time execution tester</p>
                  </div>
                </div>

                {/* Available Tools Tabs */}
                <div className='tools-chips-row'>
                  {tools.map((t) => (
                    <button
                      key={t.name}
                      className={`tool-chip ${activeToolTest === t.name ? 'active' : ''}`}
                      onClick={() => handleSelectToolForTest(t.name)}
                    >
                      <span className='chip-icon'>⚡</span>
                      <span className='chip-name'>{t.name}</span>
                    </button>
                  ))}
                </div>

                {/* Tool Description & Parameters */}
                {(() => {
                  const currentTool = tools.find((t) => t.name === activeToolTest)
                  if (!currentTool) return null
                  return (
                    <div className='tool-schema-box'>
                      <div className='schema-title'>{currentTool.description}</div>
                      <div className='schema-params'>
                        <strong>Parameters: </strong>
                        <code>
                          {currentTool.parameters?.properties
                            ? Object.keys(currentTool.parameters.properties).join(', ')
                            : 'none'}
                        </code>
                      </div>
                    </div>
                  )
                })()}

                {/* Interactive Runner */}
                <div className='tool-tester-form'>
                  <div className='form-group'>
                    <label>Test Arguments (JSON Payload):</label>
                    <textarea
                      rows={4}
                      className='code-textarea'
                      value={toolTestArgs}
                      onChange={(e) => setToolTestArgs(e.target.value)}
                    />
                  </div>
                  <button
                    className='btn primary'
                    onClick={handleExecuteToolTest}
                    disabled={toolTestLoading}
                  >
                    {toolTestLoading ? 'Executing Tool...' : `▶ Execute ${activeToolTest}`}
                  </button>
                </div>

                {/* Test Result Display */}
                {toolTestResult && (
                  <div className='tool-result-box'>
                    <div className='result-header'>
                      <span>Tool Execution Result:</span>
                      <span className={`badge ${toolTestResult.error ? 'sev1' : 'status-open'}`}>
                        {toolTestResult.error ? 'FAILED' : 'SUCCESS'}
                      </span>
                    </div>
                    <pre className='code-preview small'>
                      {JSON.stringify(toolTestResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Database Connection & Ingestion Pipeline Hub */}
        {activeTab === 'pipeline' && (
          <div className='pipeline-view'>
            <header className='viewport-header'>
              <div>
                <h2>Enterprise Database Engine & Ingestion Pipeline</h2>
                <p className='subtext'>Persistent SQLite WAL Engine, Knowledge Distillation ETL, and Automated Vector/RAG Indexing</p>
              </div>
              <div className='header-actions'>
                <button className='btn outline' onClick={fetchDbAndPipeline} disabled={pipelineLoading}>
                  🔄 Refresh Telemetry
                </button>
              </div>
            </header>

            {/* REA Forensic & Verification Engine Suite */}
            <div className='rea-forensic-card'>
              <div className='rea-header-bar'>
                <div className='rea-title-group'>
                  <h3>🛡️ REA Forensic Integrity & Cryptographic Evidence</h3>
                  <span className='rea-evidence-id-pill'>{reaEvidence?.evidenceId || 'ev_live_quiescent'}</span>
                  <span className={`badge ${dbIntegrity?.ok ? 'status-resolved' : 'sev1'}`}>
                    {dbIntegrity?.ok ? '✓ B-TREE INTEGRITY HEALTHY' : 'CORRUPT'}
                  </span>
                </div>
                <div className='header-actions'>
                  <button
                    className='rea-optimize-btn'
                    onClick={handleRunDbOptimize}
                    disabled={pipelineLoading}
                  >
                    {pipelineLoading ? 'Optimizing...' : '⚡ PRAGMA Optimize & Truncate WAL'}
                  </button>
                </div>
              </div>

              <div className='rea-digest-row'>
                <div className='rea-digest-box'>
                  <div className='rea-digest-label'>SQLite File SHA-256 Digest</div>
                  <div className='rea-digest-value'>
                    {reaEvidence?.artifact?.sha256 ? `${reaEvidence.artifact.sha256.slice(0, 32)}...` : 'Synchronizing...'}
                  </div>
                  <div className='stat-desc'>
                    {reaEvidence?.artifact?.bytes ? `${(reaEvidence.artifact.bytes / 1024).toFixed(1)} KB` : '0 KB'} committed file
                  </div>
                </div>

                <div className='rea-digest-box'>
                  <div className='rea-digest-label'>WAL Checkpoint Status</div>
                  <div className='rea-digest-value'>
                    {reaEvidence?.wal?.bytes === 0 ? '✓ Fully Checkpointed (0 B pending)' : `${reaEvidence?.wal?.bytes || 0} bytes pending in log`}
                  </div>
                  <div className='stat-desc'>
                    WAL SHA-256: {reaEvidence?.wal?.sha256 ? `${reaEvidence.wal.sha256.slice(0, 16)}...` : 'None (clean)'}
                  </div>
                </div>

                <div className='rea-digest-box'>
                  <div className='rea-digest-label'>Schema Geometry</div>
                  <div className='rea-digest-value' style={{ color: '#34d399' }}>
                    {reaEvidence?.schema?.tableCount || 8} Tables • {reaEvidence?.schema?.indexCount || 18} Indexes
                  </div>
                  <div className='stat-desc'>
                    Integrity check duration: {dbIntegrity?.durationMs || 0}ms
                  </div>
                </div>
              </div>

              <div className='rea-meta-tags'>
                <span className='rea-meta-tag'><strong>Engine:</strong> {dbHealth?.engine || 'SQLite 3 Native'}</span>
                <span className='rea-meta-tag'><strong>Journal:</strong> {dbHealth?.journalMode || 'WAL'}</span>
                <span className='rea-meta-tag'><strong>Tables:</strong> {reaEvidence?.schema?.tables?.join(', ') || 'users, tickets, documents...'}</span>
              </div>
            </div>

            {/* Database Metrics Overview */}
            <div className='db-metrics-row'>
              <div className='stat-card'>
                <div className='stat-label'>Database Connection</div>
                <div className='stat-val status-val'>
                  <span className='dot live-dot' /> {dbHealth?.connected ? 'CONNECTED' : 'DISCONNECTED'}
                </div>
                <div className='stat-desc'>{dbHealth?.engine || 'SQLite Native'} ({dbHealth?.journalMode || 'WAL'}) • {dbHealth?.latencyMs || 0}ms ping</div>
              </div>

              <div className='stat-card'>
                <div className='stat-label'>Storage Footprint</div>
                <div className='stat-val'>{dbHealth?.fileSizeFormatted || '0 KB'}</div>
                <div className='stat-desc'>Mode: {dbHealth?.mode?.toUpperCase() || 'SQLITE'} • {dbStats?.totalRecords || 0} Total Rows</div>
              </div>

              <div className='stat-card'>
                <div className='stat-label'>Knowledge Base Size</div>
                <div className='stat-val'>{dbStats?.totalDocuments || 0} Docs</div>
                <div className='stat-desc'>{dbStats?.totalChunks || 0} Passage Chunks Indexed in RAG</div>
              </div>

              <div className='stat-card'>
                <div className='stat-label'>Operational Audit</div>
                <div className='stat-val'>{dbStats?.totalTickets || 0} Tickets</div>
                <div className='stat-desc'>{dbStats?.totalConversations || 0} Conversations • {dbStats?.totalPipelineJobs || 0} Pipeline Runs</div>
              </div>
            </div>

            <div className='pipeline-content-grid'>
              {/* Left Column: Triggers and Direct Ingestion */}
              <div className='pipeline-panel'>
                <div className='panel-header'>
                  <div>
                    <h3>Automated ETL Pipeline Runners</h3>
                    <p className='panel-sub'>Trigger batch extraction, transformation, PII scrubbing, and vector embedding</p>
                  </div>
                </div>

                <div className='pipeline-actions-group'>
                  <div className='pipeline-action-item'>
                    <div className='action-info'>
                      <strong>Corporate Policy Ingestion Pipeline</strong>
                      <span>Extracts internal wiki policies, chunks passages, and updates dense embeddings.</span>
                    </div>
                    <button
                      className='btn primary'
                      onClick={() => handleRunPipeline('corporate_docs_sync')}
                      disabled={pipelineLoading}
                    >
                      {pipelineLoading ? 'Running...' : '▶ Sync Policies'}
                    </button>
                  </div>

                  <div className='pipeline-action-item'>
                    <div className='action-info'>
                      <strong>Resolved Tickets Knowledge Distiller</strong>
                      <span>Transforms resolved support cases into verified Q&A knowledge articles with PII masking.</span>
                    </div>
                    <button
                      className='btn success'
                      onClick={() => handleRunPipeline('resolved_tickets_distillation')}
                      disabled={pipelineLoading}
                    >
                      {pipelineLoading ? 'Running...' : '▶ Distill Tickets'}
                    </button>
                  </div>

                  <div className='pipeline-action-item'>
                    <div className='action-info'>
                      <strong>External CRM & Webhook Feeds</strong>
                      <span>Simulates incoming enterprise Confluence, Zendesk, and cloud infrastructure guides.</span>
                    </div>
                    <button
                      className='btn outline'
                      onClick={() => handleRunPipeline('external_api_webhook')}
                      disabled={pipelineLoading}
                    >
                      {pipelineLoading ? 'Running...' : '▶ Sync Webhooks'}
                    </button>
                  </div>

                  <div className='pipeline-action-item'>
                    <div className='action-info'>
                      <strong>Full Vector & Chunk Re-index</strong>
                      <span>Re-evaluates BM25 frequencies and 256-dim embeddings for all documents in the DB.</span>
                    </div>
                    <button
                      className='btn outline'
                      onClick={() => handleRunPipeline('full_vector_reindex')}
                      disabled={pipelineLoading}
                    >
                      {pipelineLoading ? 'Running...' : '▶ Full Re-index'}
                    </button>
                  </div>
                </div>

                {/* Direct Document Ingestion Form */}
                <div className='ingest-card'>
                  <h4>Direct Document Ingestion (Live Pipeline)</h4>
                  <form onSubmit={handleIngestDocument} className='ingest-form'>
                    <div className='form-group'>
                      <label>Document Title</label>
                      <input
                        placeholder='e.g. Production Database Failover Runbook'
                        value={ingestForm.title}
                        onChange={(e) => setIngestForm({ ...ingestForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className='form-row-2'>
                      <div className='form-group'>
                        <label>Category</label>
                        <select
                          value={ingestForm.category}
                          onChange={(e) => setIngestForm({ ...ingestForm, category: e.target.value })}
                        >
                          <option value='it'>IT & Infrastructure</option>
                          <option value='security'>Security & Compliance</option>
                          <option value='hr'>HR & People Ops</option>
                          <option value='finance'>Finance & Payroll</option>
                          <option value='general'>General Operations</option>
                        </select>
                      </div>
                      <div className='form-group'>
                        <label>Keywords (Comma-separated)</label>
                        <input
                          placeholder='e.g. database, failover, postgres, aws'
                          value={ingestForm.keywords}
                          onChange={(e) => setIngestForm({ ...ingestForm, keywords: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className='form-group'>
                      <label>Policy / Runbook Content</label>
                      <textarea
                        rows={4}
                        placeholder='Enter official policy content, step-by-step procedures, or operational documentation...'
                        value={ingestForm.content}
                        onChange={(e) => setIngestForm({ ...ingestForm, content: e.target.value })}
                        required
                      />
                    </div>
                    <button type='submit' className='btn primary block' disabled={pipelineLoading}>
                      {pipelineLoading ? 'Ingesting & Indexing...' : '📥 Ingest into SQLite & RAG Index'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Sources and Job History */}
              <div className='pipeline-panel'>
                <div className='panel-header'>
                  <div>
                    <h3>Configured Pipeline Sources</h3>
                    <p className='panel-sub'>Active connectors feeding into the corporate knowledge database</p>
                  </div>
                </div>

                <div className='telemetry-table-wrapper'>
                  <table className='telemetry-table'>
                    <thead>
                      <tr>
                        <th>Source Name</th>
                        <th>Type</th>
                        <th>Frequency</th>
                        <th>Documents</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineSources.map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.name}</strong></td>
                          <td><code>{s.type}</code></td>
                          <td>{s.syncFrequency}</td>
                          <td><span className='badge status-open'>{s.docCount} docs</span></td>
                          <td><span className='badge status-resolved'>{s.status.toUpperCase()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className='panel-header' style={{ marginTop: '1rem' }}>
                  <div>
                    <h3>Pipeline Execution History & Telemetry</h3>
                    <p className='panel-sub'>Recent batch and ingestion job logs</p>
                  </div>
                </div>

                <div className='telemetry-table-wrapper'>
                  <table className='telemetry-table'>
                    <thead>
                      <tr>
                        <th>Job ID</th>
                        <th>Pipeline</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th>Duration</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineJobs.length === 0
                        ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                              No pipeline runs recorded yet.
                            </td>
                          </tr>
                          )
                        : (
                            pipelineJobs.map((j) => (
                              <tr key={j.id}>
                                <td><code>{j.id.slice(0, 12)}...</code></td>
                                <td><strong>{j.pipelineName}</strong></td>
                                <td>
                                  <span className={`badge ${j.status === 'COMPLETED' ? 'status-resolved' : j.status === 'RUNNING' ? 'status-open' : 'sev1'}`}>
                                    {j.status}
                                  </span>
                                </td>
                                <td>{j.processedItems} / {j.totalItems}</td>
                                <td>{j.durationMs}ms</td>
                                <td>{new Date(j.createdAt).toLocaleTimeString()}</td>
                              </tr>
                            ))
                          )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: AI-GTM Command Center */}
        {activeTab === 'gtm' && (
          <GTMCommandCenter
            request={request}
            showToast={showToast}
            user={user}
          />
        )}
      </main>
    </div>
  )
}
