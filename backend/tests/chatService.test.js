import test from 'node:test'
import assert from 'node:assert/strict'
import { chatService } from '../src/service/chatService.js'

test('ChatService: Asks question and tracks conversation context', async () => {
  const result = await chatService.askQuestion({
    userId: 'user-chat-1',
    conversationId: null,
    question: 'How do I submit an expense report over $25?'
  })

  assert.ok(result.conversationId, 'A conversation ID should be created')
  assert.equal(result.userMessage.content, 'How do I submit an expense report over $25?')
  assert.ok(result.assistantMessage.content.includes('Corporate Expense Reimbursement'))
  assert.ok(result.sources.length > 0)
  assert.equal(result.sources[0].id, 'doc-3')

  // Verify conversation history retrieval
  const history = chatService.getConversation(result.conversationId, 'user-chat-1')
  assert.equal(history.messages.length, 2, 'Should have user and assistant messages')
})

test('ChatService: Multi-turn conversation chaining', async () => {
  // First turn
  const turn1 = await chatService.askQuestion({
    userId: 'user-chat-2',
    conversationId: null,
    question: 'What is the PTO rollover limit?'
  })

  // Second turn on same conversationId
  const turn2 = await chatService.askQuestion({
    userId: 'user-chat-2',
    conversationId: turn1.conversationId,
    question: 'And how many sick days do we get?'
  })

  assert.equal(turn2.conversationId, turn1.conversationId)
  const history = chatService.getConversation(turn1.conversationId, 'user-chat-2')
  assert.equal(history.messages.length, 4)
})
