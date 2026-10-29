import { chatService } from '../../service/chatService.js'
import { aiService } from '../../integration/aiService.js'
import { documentRepository } from '../../data/documentRepository.js'
import { asyncHandler } from '../../utils/errors.js'

export const askQuestion = asyncHandler(async (req, res) => {
  const { conversationId, question, provider } = req.body
  const userId = req.user.id
  const userEmail = req.user.email
  const role = req.user.role

  const result = await chatService.askQuestion({ userId, userEmail, role, conversationId, question, provider })
  res.status(200).json({
    status: 'success',
    data: result
  })
})

export const streamQuestion = asyncHandler(async (req, res) => {
  const { question, provider } = req.body
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ status: 'fail', message: 'Question is required' })
  }
  const userId = req.user.id
  const userEmail = req.user.email
  const role = req.user.role

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const searchResults = documentRepository.search(question)
  for await (const chunk of aiService.streamAnswer(question, searchResults, { userId, userEmail, role, provider })) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  res.end()
})

export const getConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params
  const userId = req.user.id
  const result = chatService.getConversation(conversationId, userId)
  res.status(200).json({ status: 'success', data: result })
})

export const listConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const result = chatService.listConversations(userId)
  res.status(200).json({ status: 'success', data: result })
})

export const getLLMProviders = asyncHandler(async (req, res) => {
  const providers = aiService.getProviders()
  res.status(200).json({ status: 'success', data: { providers } })
})

export const selectLLMProvider = asyncHandler(async (req, res) => {
  const { provider } = req.body
  if (!provider) {
    return res.status(400).json({ status: 'fail', message: 'Provider identifier required' })
  }
  const providers = aiService.setPreferredProvider(provider)
  res.status(200).json({ status: 'success', data: { providers } })
})

export const inspectRAG = asyncHandler(async (req, res) => {
  const query = req.query.q || req.body.query || ''
  const telemetry = documentRepository.inspectRAG(query)
  res.status(200).json({ status: 'success', data: { telemetry } })
})
