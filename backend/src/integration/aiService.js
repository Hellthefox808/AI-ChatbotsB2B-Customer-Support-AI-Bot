import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { toolRegistry } from './toolRegistry.js'
import { ragEngine } from '../service/ragEngine.js'

export class AIService {
  constructor () {
    this.preferredProvider = config.aiProvider || 'auto'
  }

  /**
   * Generates a grounded response with multi-turn tool calling and hybrid RAG.
   */
  async generateAnswer (question, searchResults, context = {}) {
    if (!searchResults || searchResults.length === 0) {
      // Check if the user is asking to run a specific tool directly (e.g. check status of ticket or system)
      const directToolResult = await this.detectAndExecuteLocalTool(question, context)
      if (directToolResult) {
        return directToolResult
      }

      return {
        answer: 'I could not locate any relevant corporate policy or IT documentation matching your query. Would you like me to escalate this as a support ticket to the helpdesk?',
        sources: [],
        confidence: 0,
        provider: 'none',
        toolCalls: [],
        groundedness: { score: 0, isGrounded: false, supportedClaimsCount: 0 },
        needsEscalation: true
      }
    }

    const sources = searchResults.map((r) => ({
      id: r.document.id,
      title: r.document.title,
      category: r.document.category
    }))

    const topConfidence = searchResults[0]?.confidence || 0.5
    const toolCallsExecuted = []
    const preferred = context.provider || this.preferredProvider

    // 1. Try Google Gemini with Function Calling
    if ((preferred === 'gemini' || preferred === 'auto') && config.geminiApiKey) {
      try {
        const geminiResult = await this.callGeminiWithTools(question, searchResults, context)
        if (geminiResult) {
          const groundedness = ragEngine.verifyGroundedness(geminiResult.answer, searchResults)
          return {
            answer: geminiResult.answer,
            sources,
            confidence: topConfidence,
            provider: 'google-gemini-tools',
            toolCalls: geminiResult.toolCalls || [],
            groundedness,
            needsEscalation: topConfidence < 0.45 || !groundedness.isGrounded
          }
        }
      } catch (err) {
        logger.warn('Gemini Tool Calling failed, falling back to local hybrid RAG', { error: err.message })
      }
    }

    // 2. Try OpenAI with Tool Calling
    if ((preferred === 'openai' || preferred === 'auto') && config.openaiApiKey) {
      try {
        const openaiResult = await this.callOpenAIWithTools(question, searchResults, context)
        if (openaiResult) {
          const groundedness = ragEngine.verifyGroundedness(openaiResult.answer, searchResults)
          return {
            answer: openaiResult.answer,
            sources,
            confidence: topConfidence,
            provider: 'openai-tools',
            toolCalls: openaiResult.toolCalls || [],
            groundedness,
            needsEscalation: topConfidence < 0.45 || !groundedness.isGrounded
          }
        }
      } catch (err) {
        logger.warn('OpenAI Tool Calling failed, falling back to local hybrid RAG', { error: err.message })
      }
    }

    // 3. Try Anthropic Claude with Tool Use
    if ((preferred === 'claude' || preferred === 'auto') && config.claudeApiKey) {
      try {
        const claudeResult = await this.callClaudeWithTools(question, searchResults, context)
        if (claudeResult) {
          const groundedness = ragEngine.verifyGroundedness(claudeResult.answer, searchResults)
          return {
            answer: claudeResult.answer,
            sources,
            confidence: topConfidence,
            provider: 'anthropic-claude-tools',
            toolCalls: claudeResult.toolCalls || [],
            groundedness,
            needsEscalation: topConfidence < 0.45 || !groundedness.isGrounded
          }
        }
      } catch (err) {
        logger.warn('Claude Tool Calling failed, falling back to local hybrid RAG', { error: err.message })
      }
    }

    // 4. Try Ollama Local LLM if requested
    if (preferred === 'ollama') {
      try {
        const ollamaResult = await this.callOllama(question, searchResults, context)
        if (ollamaResult) {
          const groundedness = ragEngine.verifyGroundedness(ollamaResult.answer, searchResults)
          return {
            answer: ollamaResult.answer,
            sources,
            confidence: topConfidence,
            provider: 'ollama-local',
            toolCalls: ollamaResult.toolCalls || [],
            groundedness,
            needsEscalation: topConfidence < 0.45 || !groundedness.isGrounded
          }
        }
      } catch (err) {
        logger.warn('Ollama generation failed, falling back to local hybrid RAG', { error: err.message })
      }
    }

    // 5. High-performance local deterministic Tool Calling + RAG engine
    const localToolResult = await this.detectAndExecuteLocalTool(question, context)
    if (localToolResult) {
      return {
        ...localToolResult,
        sources: [...sources, ...(localToolResult.sources || [])]
      }
    }

    const localAnswer = this.synthesizeLocalAnswer(question, searchResults)
    const groundedness = ragEngine.verifyGroundedness(localAnswer, searchResults)
    return {
      answer: localAnswer,
      sources,
      confidence: topConfidence,
      provider: 'local-hybrid-rag',
      toolCalls: toolCallsExecuted,
      groundedness,
      needsEscalation: topConfidence < 0.4
    }
  }

  /**
   * Gemini Function Calling Multi-turn Execution Loop
   */
  async callGeminiWithTools (question, searchResults, context) {
    const contextText = searchResults
      .map((r, i) => `[Document ${i + 1}: ${r.document.title}]\nCategory: ${r.document.category}\nContent: ${r.document.content}`)
      .join('\n\n')

    const systemPrompt = `You are an enterprise B2B support AI bot for our company.
Answer the employee's inquiry accurately and professionally based strictly on the corporate documentation provided below or by calling relevant tools.
If you need live information (such as checking system operational health, looking up a support ticket by ID, or opening an escalated ticket), call the available tools.

Documentation Context:
${contextText}`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`
    const toolsConfig = [{ functionDeclarations: toolRegistry.getGeminiFunctionDeclarations() }]

    const contents = [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${question}` }] }
    ]

    const initialRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools: toolsConfig,
        generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
      })
    })

    if (!initialRes.ok) {
      const err = await initialRes.text()
      throw new Error(`Gemini HTTP error ${initialRes.status}: ${err}`)
    }

    const data = await initialRes.json()
    const candidate = data.candidates?.[0]?.content
    const parts = candidate?.parts || []
    const functionCallPart = parts.find((p) => p.functionCall)

    const executedTools = []

    // If Gemini requested a tool execution
    if (functionCallPart && functionCallPart.functionCall) {
      const { name, args } = functionCallPart.functionCall
      logger.audit('tool.called', context.userId || 'system', { tool: name, args, provider: 'gemini' })
      const toolOutput = await toolRegistry.executeTool(name, args, context)
      executedTools.push({ name, args, output: toolOutput })

      // Send tool response back to Gemini for final synthesis
      contents.push({ role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] })
      contents.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name,
              response: { content: toolOutput }
            }
          }
        ]
      })

      const followUpRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          tools: toolsConfig,
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
        })
      })

      if (followUpRes.ok) {
        const followUpData = await followUpRes.json()
        const textPart = followUpData.candidates?.[0]?.content?.parts?.find((p) => p.text)
        return {
          answer: textPart?.text?.trim() || JSON.stringify(toolOutput, null, 2),
          toolCalls: executedTools
        }
      }
    }

    const plainTextPart = parts.find((p) => p.text)
    return {
      answer: plainTextPart ? plainTextPart.text.trim() : null,
      toolCalls: executedTools
    }
  }

  /**
   * OpenAI Tool Calling Loop
   */
  async callOpenAIWithTools (question, searchResults, context) {
    const contextText = searchResults
      .map((r, i) => `[Source ${i + 1}: ${r.document.title} (${r.document.category})]\n${r.document.content}`)
      .join('\n\n')

    const messages = [
      {
        role: 'system',
        content: `You are an enterprise B2B customer support bot. Ground your response in the provided context or call tools to perform actions.\n\nContext:\n${contextText}`
      },
      { role: 'user', content: question }
    ]

    const tools = toolRegistry.getOpenAIToolDefinitions()

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: 0.2,
        messages,
        tools
      })
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI HTTP error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const message = data.choices?.[0]?.message
    const executedTools = []

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message)

      for (const call of message.tool_calls) {
        const name = call.function.name
        let args = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }

        const toolOutput = await toolRegistry.executeTool(name, args, context)
        executedTools.push({ name, args, output: toolOutput })

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolOutput)
        })
      }

      // Second pass for final response
      const followUp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: config.openaiModel,
          temperature: 0.2,
          messages
        })
      })

      if (followUp.ok) {
        const followData = await followUp.json()
        return {
          answer: followData.choices?.[0]?.message?.content?.trim(),
          toolCalls: executedTools
        }
      }
    }

    return {
      answer: message.content?.trim(),
      toolCalls: executedTools
    }
  }

  /**
   * Anthropic Claude Tool Calling Loop
   */
  async callClaudeWithTools (question, searchResults, context) {
    const url = 'https://api.anthropic.com/v1/messages'
    const contextText = searchResults
      .map((r, i) => `[Document ${i + 1}: ${r.document.title}]\nCategory: ${r.document.category}\nContent: ${r.document.content}`)
      .join('\n\n')

    const systemPrompt = 'You are an elite enterprise B2B Customer Support & IT Operations AI Bot. Answer using the verified corporate documentation below.'
    const tools = toolRegistry.getClaudeToolDefinitions()
    const messages = [
      { role: 'user', content: `${contextText}\n\nUser Question: ${question}` }
    ]

    const initialRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.claudeModel,
        system: systemPrompt,
        max_tokens: 1000,
        messages,
        tools
      })
    })

    if (!initialRes.ok) {
      const err = await initialRes.text()
      throw new Error(`Claude HTTP error ${initialRes.status}: ${err}`)
    }

    const data = await initialRes.json()
    const toolUseBlocks = data.content?.filter((b) => b.type === 'tool_use') || []
    const executedTools = []

    if (toolUseBlocks.length > 0) {
      for (const block of toolUseBlocks) {
        logger.audit('tool.called', context.userId || 'system', { tool: block.name, args: block.input, provider: 'claude' })
        const output = await toolRegistry.executeTool(block.name, block.input, context)
        executedTools.push({ name: block.name, args: block.input, output })
      }

      messages.push({ role: 'assistant', content: data.content })
      messages.push({
        role: 'user',
        content: executedTools.map((t, i) => ({
          type: 'tool_result',
          tool_use_id: toolUseBlocks[i].id,
          content: JSON.stringify(t.output)
        }))
      })

      const followUp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.claudeModel,
          system: systemPrompt,
          max_tokens: 1000,
          messages
        })
      })

      if (followUp.ok) {
        const followData = await followUp.json()
        const textBlock = followData.content?.find((b) => b.type === 'text')
        return {
          answer: textBlock?.text?.trim(),
          toolCalls: executedTools
        }
      }
    }

    const textBlock = data.content?.find((b) => b.type === 'text')
    return {
      answer: textBlock?.text?.trim(),
      toolCalls: executedTools
    }
  }

  /**
   * Ollama Local / Offline LLM Caller
   */
  async callOllama (question, searchResults, context) {
    const url = `${config.ollamaEndpoint}/api/generate`
    const contextText = searchResults
      .map((r, i) => `[Doc ${i + 1}: ${r.document.title} (${r.document.category})]: ${r.document.content}`)
      .join('\n\n')

    const prompt = `You are a helpful B2B Corporate Support AI Assistant. Answer the question using this verified corporate documentation:\n\n${contextText}\n\nQuestion: ${question}\nAnswer:`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt,
        stream: false
      })
    })

    if (!res.ok) {
      throw new Error(`Ollama HTTP error ${res.status}`)
    }

    const data = await res.json()
    return {
      answer: data.response?.trim(),
      toolCalls: []
    }
  }

  /**
   * Deterministic local tool calling parser for offline / air-gapped operations
   */
  async detectAndExecuteLocalTool (question, context = {}) {
    const text = question.trim()
    const lower = text.toLowerCase()

    // 1. Check ticket status regex: ticket-[a-zA-Z0-9-]+
    const ticketMatch = text.match(/(ticket-[a-zA-Z0-9-]+)/i)
    if (ticketMatch && (lower.includes('status') || lower.includes('check') || lower.includes('ticket') || lower.includes('progress'))) {
      const ticketId = ticketMatch[1]
      const output = await toolRegistry.executeTool('check_ticket_status', { ticketId }, context)
      if (output.error) {
        return {
          answer: `⚠️ **Ticket Lookup Notice**: ${output.error}\n\nPlease verify the ticket ID and ensure you have permission to view it.`,
          sources: [],
          confidence: 0.9,
          provider: 'local-tool-agent',
          toolCalls: [{ name: 'check_ticket_status', args: { ticketId }, output }],
          needsEscalation: false
        }
      }
      return {
        answer: `🎫 **Ticket Status for ${output.id}**:\n- **Subject**: ${output.subject}\n- **Current Status**: **${output.status.toUpperCase()}**\n- **Severity**: ${output.severity} (Target SLA: ${output.slaHours}h)\n- **Assigned Team**: ${output.assignedTeam}\n- **SLA Deadline**: ${new Date(output.slaDeadline).toLocaleString()}\n- **Latest Update**: ${output.timeline?.[output.timeline.length - 1]?.note || 'In progress'}`,
        sources: [],
        confidence: 0.95,
        provider: 'local-tool-agent',
        toolCalls: [{ name: 'check_ticket_status', args: { ticketId }, output }],
        needsEscalation: false
      }
    }

    // 2. Check system status (VPN, SSO, Workday, Concur, Cloud)
    if (lower.includes('system status') || lower.includes('is vpn down') || lower.includes('service health') || lower.includes('is concur working') || lower.includes('is sso down')) {
      let targetService = 'all'
      if (lower.includes('vpn')) targetService = 'vpn'
      else if (lower.includes('sso') || lower.includes('login portal')) targetService = 'sso'
      else if (lower.includes('concur') || lower.includes('expense')) targetService = 'concur'
      else if (lower.includes('workday')) targetService = 'workday'

      const output = await toolRegistry.executeTool('check_system_status', { serviceName: targetService }, context)
      if (targetService === 'all') {
        const lines = Object.entries(output.systems).map(([k, v]) => `- **${k.toUpperCase()}**: ${v.status === 'OPERATIONAL' ? '🟢 Operational' : '🟡 ' + v.status} (${v.latencyMs}ms, ${v.uptime} uptime)`).join('\n')
        return {
          answer: `🖥️ **Enterprise Infrastructure Health Check** (as of ${new Date().toLocaleTimeString()}):\n\n${lines}\n\n*All critical systems are actively monitored by SecOps.*`,
          sources: [],
          confidence: 0.95,
          provider: 'local-tool-agent',
          toolCalls: [{ name: 'check_system_status', args: { serviceName: 'all' }, output }],
          needsEscalation: false
        }
      }

      const statusIcon = output.status === 'OPERATIONAL' ? '🟢 Operational' : '🟡 ' + output.status
      return {
        answer: `📡 **${output.service?.toUpperCase()} Status**: **${statusIcon}**\n- Latency: ${output.latencyMs}ms\n- Uptime: ${output.uptime}\n- Region: ${output.region}${output.note ? `\n- Notice: ${output.note}` : ''}`,
        sources: [],
        confidence: 0.95,
        provider: 'local-tool-agent',
        toolCalls: [{ name: 'check_system_status', args: { serviceName: targetService }, output }],
        needsEscalation: output.status !== 'OPERATIONAL'
      }
    }

    // 3. PTO Calculation check
    if ((lower.includes('pto') || lower.includes('vacation')) && (lower.includes('calculate') || lower.includes('balance') || lower.includes('days left') || lower.includes('how many days have i taken'))) {
      const matchDays = text.match(/(\d+)\s*(days|day)?\s*(taken|used)/i)
      const daysTaken = matchDays ? parseInt(matchDays[1], 10) : 5
      const output = await toolRegistry.executeTool('calculate_pto_balance', { daysTaken, monthsTenure: 12 }, context)
      return {
        answer: `📊 **PTO Accrual & Balance Summary**:\n- **Annual Entitlement**: ${output.annualEntitlement} business days\n- **Days Taken**: ${output.daysTaken} days\n- **Remaining Balance**: **${output.remainingBalance} days**\n- **Eligible Rollover to Next Year**: up to ${output.maxRolloverEligible} days\n- **Separate Sick Days**: ${output.separateSickLeaveDays} days (no advance notice needed)\n\n*Note: Submit requests in Workday at least 5 business days in advance.*`,
        sources: [],
        confidence: 0.95,
        provider: 'local-tool-agent',
        toolCalls: [{ name: 'calculate_pto_balance', args: { daysTaken, monthsTenure: 12 }, output }],
        needsEscalation: false
      }
    }

    return null
  }

  /**
   * Local deterministic answer synthesis with sentence ranking and source citation
   */
  synthesizeLocalAnswer (question, searchResults) {
    const topResult = searchResults[0]
    const doc = topResult.document
    const qTokens = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2)

    const sentences = doc.content.split(/(?<=[.!?])\s+/)
    const scoredSentences = sentences.map((sentence) => {
      let score = 0
      const lower = sentence.toLowerCase()
      qTokens.forEach((t) => {
        if (lower.includes(t)) score += 1
      })
      return { sentence, score }
    })

    scoredSentences.sort((a, b) => b.score - a.score)
    const topSentences = scoredSentences.slice(0, 2).map((s) => s.sentence).join(' ')
    const leadAnswer = topSentences.length > 0 ? topSentences : doc.content

    return `According to the **${doc.title}** (${doc.category.toUpperCase()}):\n\n${leadAnswer}\n\n*Reference: ${doc.title} (ID: ${doc.id})*`
  }

  /**
   * Returns list of available LLM providers, active state, and configuration status
   */
  getProviders () {
    return [
      {
        id: 'auto',
        name: 'Auto-Routing Orchestrator',
        description: 'Dynamically routes to available cloud LLMs or falls back to local hybrid RAG',
        active: this.preferredProvider === 'auto',
        configured: true
      },
      {
        id: 'gemini',
        name: 'Google Gemini 1.5 Flash / Pro',
        model: config.geminiModel,
        active: this.preferredProvider === 'gemini',
        configured: Boolean(config.geminiApiKey)
      },
      {
        id: 'openai',
        name: 'OpenAI GPT-4o / GPT-4o-mini',
        model: config.openaiModel,
        active: this.preferredProvider === 'openai',
        configured: Boolean(config.openaiApiKey)
      },
      {
        id: 'claude',
        name: 'Anthropic Claude 3.5 Sonnet',
        model: config.claudeModel,
        active: this.preferredProvider === 'claude',
        configured: Boolean(config.claudeApiKey)
      },
      {
        id: 'ollama',
        name: 'Ollama Local LLM',
        model: config.ollamaModel,
        endpoint: config.ollamaEndpoint,
        active: this.preferredProvider === 'ollama',
        configured: true
      },
      {
        id: 'local-hybrid-rag',
        name: 'Deterministic Local Hybrid RAG',
        description: 'Zero-latency, air-gapped BM25 + dense vector semantic synthesis',
        active: this.preferredProvider === 'local-hybrid-rag',
        configured: true
      }
    ]
  }

  /**
   * Sets preferred provider runtime dynamically
   */
  setPreferredProvider (providerId) {
    const valid = ['auto', 'gemini', 'openai', 'claude', 'ollama', 'local-hybrid-rag']
    if (!valid.includes(providerId)) {
      throw new Error(`Invalid provider '${providerId}'. Valid: ${valid.join(', ')}`)
    }
    this.preferredProvider = providerId
    return this.getProviders()
  }

  /**
   * Async generator for real-time SSE token streaming to clients
   */
  async * streamAnswer (question, searchResults, context = {}) {
    const fullResult = await this.generateAnswer(question, searchResults, context)
    yield {
      type: 'start',
      provider: fullResult.provider,
      sources: fullResult.sources,
      confidence: fullResult.confidence,
      toolCalls: fullResult.toolCalls || []
    }

    // Stream words with high-speed micro-bursts for realistic typing feedback
    const tokens = (fullResult.answer || '').split(/(\s+)/)
    for (const token of tokens) {
      if (token) {
        yield { type: 'token', token }
      }
    }

    yield {
      type: 'done',
      answer: fullResult.answer,
      groundedness: fullResult.groundedness,
      needsEscalation: fullResult.needsEscalation
    }
  }
}

export const aiService = new AIService()
