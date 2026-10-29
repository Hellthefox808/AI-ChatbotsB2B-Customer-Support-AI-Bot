import { documentRepository } from '../data/documentRepository.js'
import { conversationRepository } from '../data/conversationRepository.js'
import { aiService } from '../integration/aiService.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/errors.js'

export class ChatService {
  async askQuestion ({ userId, userEmail, role, conversationId, question, provider }) {
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new AppError('Question is required', 400)
    }

    let convId = conversationId
    if (!convId) {
      const conversation = conversationRepository.createConversation(userId, question.slice(0, 40))
      convId = conversation.id
    } else {
      const conversation = conversationRepository.getConversation(convId)
      if (!conversation) {
        throw new AppError('Conversation not found', 404)
      }
      if (conversation.userId !== userId) {
        throw new AppError('Not authorized for this conversation', 403)
      }
    }

    const userMessage = conversationRepository.addMessage(convId, {
      role: 'user',
      content: question.trim(),
      userId
    })

    const searchResults = documentRepository.search(question)
    const { answer, sources, confidence, provider: resolvedProvider, needsEscalation, toolCalls, groundedness } = await aiService.generateAnswer(
      question,
      searchResults,
      { userId, userEmail, role, provider }
    )

    const assistantMessage = conversationRepository.addMessage(convId, {
      role: 'assistant',
      content: answer,
      userId: null,
      metadata: {
        sources,
        confidence,
        provider: resolvedProvider,
        needsEscalation,
        toolCalls: toolCalls || [],
        groundedness: groundedness || null
      }
    })

    logger.audit('chat.question', userId, {
      conversationId: convId,
      questionLength: question.length,
      sourceCount: sources.length,
      confidence,
      provider: resolvedProvider,
      toolCount: toolCalls ? toolCalls.length : 0,
      groundednessScore: groundedness?.score,
      needsEscalation
    })

    return {
      conversationId: convId,
      userMessage,
      assistantMessage,
      sources,
      confidence,
      provider: resolvedProvider,
      toolCalls: toolCalls || [],
      groundedness,
      needsEscalation
    }
  }

  getConversation (conversationId, userId) {
    const conversation = conversationRepository.getConversation(conversationId)
    if (!conversation) {
      throw new AppError('Conversation not found', 404)
    }
    if (conversation.userId !== userId) {
      throw new AppError('Not authorized for this conversation', 403)
    }
    const messages = conversationRepository.getMessages(conversationId)
    return { conversation, messages }
  }

  listConversations (userId) {
    return conversationRepository.listConversations(userId).map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  }
}

export const chatService = new ChatService()
