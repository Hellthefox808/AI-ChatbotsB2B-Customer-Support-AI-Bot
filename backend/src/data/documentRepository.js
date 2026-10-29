import crypto from 'node:crypto'
import { dbManager } from './database.js'
import { ragEngine } from '../service/ragEngine.js'

export class DocumentRepository {
  findAll () {
    const rows = dbManager.queryAll(
      'SELECT id, title, category, content, keywords_json, checksum, source_id as sourceId, created_at as createdAt, updated_at as updatedAt FROM documents ORDER BY title ASC;'
    )
    return rows.map((r) => {
      let keywords = []
      try {
        keywords = JSON.parse(r.keywords_json || '[]')
      } catch {
        keywords = []
      }
      return {
        id: r.id,
        title: r.title,
        category: r.category,
        content: r.content,
        keywords,
        checksum: r.checksum,
        sourceId: r.sourceId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }
    })
  }

  findById (id) {
    if (!id) return null
    const row = dbManager.queryOne(
      'SELECT id, title, category, content, keywords_json, checksum, source_id as sourceId, created_at as createdAt, updated_at as updatedAt FROM documents WHERE id = ?;',
      id
    )
    if (!row) return null

    let keywords = []
    try {
      keywords = JSON.parse(row.keywords_json || '[]')
    } catch {
      keywords = []
    }

    return {
      id: row.id,
      title: row.title,
      category: row.category,
      content: row.content,
      keywords,
      checksum: row.checksum,
      sourceId: row.sourceId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  upsertDocument ({ id, title, category, content, keywords = [], sourceId = 'manual' }) {
    const docId = id || `doc-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const checksum = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
    const keywordsJson = JSON.stringify(keywords)

    dbManager.run(
      `INSERT INTO documents (id, title, category, content, keywords_json, checksum, source_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         category = excluded.category,
         content = excluded.content,
         keywords_json = excluded.keywords_json,
         checksum = excluded.checksum,
         source_id = excluded.source_id,
         updated_at = excluded.updated_at;`,
      docId,
      title,
      category,
      content,
      keywordsJson,
      checksum,
      sourceId,
      now,
      now
    )

    // Chunk and index passages
    const docObj = { id: docId, title, category, content, keywords }
    const chunks = ragEngine.chunkDocument(docObj)

    // Remove existing chunks for this document
    dbManager.run('DELETE FROM document_chunks WHERE document_id = ?;', docId)

    // Insert new chunks
    const insertChunk = dbManager.db.prepare(`
      INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding_json, score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `)

    chunks.forEach((c) => {
      insertChunk.run(
        c.chunkId,
        docId,
        c.chunkIndex,
        c.content,
        JSON.stringify(c.embedding),
        c.score || 1.0,
        now
      )
    })

    // Update in-memory RAG index
    ragEngine.refreshIndex(this.findAll())

    return this.findById(docId)
  }

  deleteDocument (id) {
    dbManager.run('DELETE FROM document_chunks WHERE document_id = ?;', id)
    dbManager.run('DELETE FROM documents WHERE id = ?;', id)
    ragEngine.refreshIndex(this.findAll())
    return true
  }

  search (query, limit = 5) {
    return ragEngine.hybridSearch(query, limit)
  }

  retrieveTopChunks (query, topK = 4) {
    return ragEngine.retrieveTopChunks(query, topK)
  }

  inspectRAG (query) {
    return ragEngine.inspectRAG(query)
  }

  verifyGroundedness (answer, contextChunks) {
    return ragEngine.verifyGroundedness(answer, contextChunks)
  }
}

export const documentRepository = new DocumentRepository()
