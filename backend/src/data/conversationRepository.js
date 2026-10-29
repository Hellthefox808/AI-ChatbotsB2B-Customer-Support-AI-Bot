import crypto from 'node:crypto'
import { dbManager } from './database.js'

export class ConversationRepository {
  createConversation (userId, title = 'New Conversation') {
    const id = `conv-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const conversation = {
      id,
      userId,
      title,
      createdAt: now,
      updatedAt: now
    }

    dbManager.run(
      'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
      id,
      userId,
      title,
      now,
      now
    )

    return conversation
  }

  getConversation (id) {
    if (!id) return null
    const row = dbManager.queryOne(
      'SELECT id, user_id as userId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?;',
      id
    )
    return row || null
  }

  listConversations (userId) {
    if (!userId) return []
    return dbManager.queryAll(
      'SELECT id, user_id as userId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE user_id = ? ORDER BY datetime(updated_at) DESC;',
      userId
    )
  }

  addMessage (conversationId, message) {
    const now = new Date().toISOString()
    const id = message.id || `msg-${crypto.randomUUID()}`
    const item = {
      ...message,
      id,
      conversationId,
      createdAt: now
    }

    dbManager.run(
      'INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?);',
      id,
      conversationId,
      message.role,
      message.content,
      JSON.stringify(message.metadata || {}),
      now
    )

    const conversation = this.getConversation(conversationId)
    if (conversation) {
      const newTitle = (!conversation.title || conversation.title === 'New Conversation')
        ? message.content.slice(0, 40)
        : conversation.title

      dbManager.run(
        'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?;',
        newTitle,
        now,
        conversationId
      )
    }

    return item
  }

  getMessages (conversationId) {
    if (!conversationId) return []
    const rows = dbManager.queryAll(
      'SELECT id, conversation_id as conversationId, role, content, metadata_json, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC;',
      conversationId
    )

    return rows.map((r) => {
      let metadata = {}
      try {
        metadata = JSON.parse(r.metadata_json || '{}')
      } catch {
        metadata = {}
      }
      return {
        id: r.id,
        conversationId: r.conversationId,
        role: r.role,
        content: r.content,
        metadata,
        createdAt: r.createdAt
      }
    })
  }

  updateConversationTitle (id, title) {
    const now = new Date().toISOString()
    dbManager.run(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?;',
      title,
      now,
      id
    )
    return this.getConversation(id)
  }

  clear () {
    dbManager.run('DELETE FROM messages;')
    dbManager.run('DELETE FROM conversations;')
  }
}

export const conversationRepository = new ConversationRepository()
