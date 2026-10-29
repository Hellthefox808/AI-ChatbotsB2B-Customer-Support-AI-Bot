import { DOCUMENTS } from '../data/documentStore.js'

// Enterprise Corporate Domain Synonyms for Query Expansion
const DOMAIN_SYNONYMS = {
  vpn: ['anyconnect', 'wireguard', 'remote access', 'tunnel', 'network'],
  pto: ['vacation', 'leave', 'sick days', 'time off', 'workday', 'rollover'],
  vacation: ['pto', 'leave', 'holiday', 'rollover', 'workday', 'time off'],
  password: ['credentials', 'reset', 'portal', 'lockout', 'recovery', 'login'],
  login: ['sso', 'okta', 'password', 'credentials', 'mfa', 'two-factor'],
  expense: ['reimbursement', 'concur', 'receipt', 'per-diem', 'travel', 'finance'],
  reimbursement: ['expense', 'concur', 'receipt', 'finance', 'direct deposit'],
  sla: ['response time', 'severity', 'sev 1', 'helpdesk', 'incident', 'outage'],
  outage: ['sev 1', 'critical', 'downtime', 'emergency', 'incident', 'sla'],
  hardware: ['laptop', 'macbook', 'thinkpad', 'equipment', 'monitor', 'procurement'],
  onboarding: ['new hire', 'buddy', 'equipment', 'laptop', 'provisioning', 'badge'],
  gdpr: ['privacy', 'soc2', 'compliance', 'encryption', 'pii', 'security', 'audit']
}

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
])

export class RAGEngine {
  constructor (documents = DOCUMENTS) {
    this.documents = documents
    this.vectorDim = 256
    this.bm25K1 = 1.5
    this.bm25B = 0.75
    this.docVectors = new Map()
    this.chunks = []
    this.initializeEngine()
  }

  tokenize (text) {
    if (!text || typeof text !== 'string') return []
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  }

  /**
   * Character n-gram hashing into a fixed-dimension dense vector space
   */
  embedText (text) {
    const vector = new Float32Array(this.vectorDim)
    const clean = (text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (clean.length < 3) return vector

    // Trigram hash projections
    for (let i = 0; i < clean.length - 2; i++) {
      const trigram = clean.substring(i, i + 3)
      let hash = 0
      for (let j = 0; j < trigram.length; j++) {
        hash = (hash << 5) - hash + trigram.charCodeAt(j)
        hash |= 0
      }
      const idx = Math.abs(hash) % this.vectorDim
      vector[idx] += 1.0
    }

    // L2-normalize dense vector
    let norm = 0
    for (let i = 0; i < this.vectorDim; i++) {
      norm += vector[i] * vector[i]
    }
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let i = 0; i < this.vectorDim; i++) {
        vector[i] /= norm
      }
    }
    return vector
  }

  initializeEngine () {
    // 1. Build Document Dense Vectors & Logical Chunks
    this.chunks = []
    let totalLen = 0

    this.documents.forEach((doc) => {
      const docText = `${doc.title} ${doc.content} ${doc.keywords.join(' ')}`
      this.docVectors.set(doc.id, this.embedText(docText))

      const docTokens = this.tokenize(docText)
      totalLen += docTokens.length

      // Split document into sentences/chunks
      const sentences = doc.content.split(/(?<=[.!?])\s+/)
      sentences.forEach((sentence, idx) => {
        if (sentence.trim().length > 10) {
          this.chunks.push({
            chunkId: `${doc.id}-c${idx + 1}`,
            parentDocId: doc.id,
            parentTitle: doc.title,
            category: doc.category,
            content: sentence.trim(),
            vector: this.embedText(`${doc.title} ${sentence}`)
          })
        }
      })
    })

    this.avgDocLength = totalLen / (this.documents.length || 1)
  }

  refreshIndex (documents) {
    if (Array.isArray(documents) && documents.length > 0) {
      this.documents = documents
    }
    this.initializeEngine()
  }

  chunkDocument (doc) {
    const chunks = []
    const sentences = (doc.content || '').split(/(?<=[.!?])\s+/)
    sentences.forEach((sentence, idx) => {
      if (sentence.trim().length > 10) {
        const text = `${doc.title} ${sentence}`
        chunks.push({
          chunkId: `${doc.id}-c${idx + 1}`,
          parentDocId: doc.id,
          parentTitle: doc.title,
          category: doc.category,
          chunkIndex: idx + 1,
          content: sentence.trim(),
          embedding: Array.from(this.embedText(text)),
          score: 1.0
        })
      }
    })
    return chunks
  }

  cosineSimilarity (vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    if (denom === 0) return 0
    return dot / denom
  }

  /**
   * Domain-Aware Query Expansion
   */
  expandQuery (query) {
    const rawTokens = this.tokenize(query)
    const expansions = new Set(rawTokens)

    rawTokens.forEach((token) => {
      if (DOMAIN_SYNONYMS[token]) {
        DOMAIN_SYNONYMS[token].forEach((syn) => {
          this.tokenize(syn).forEach((t) => expansions.add(t))
        })
      }
    })

    return Array.from(expansions)
  }

  /**
   * BM25 Sparse Scoring across documents
   */
  scoreBM25 (queryTokens) {
    const N = this.documents.length
    const docFreq = {}

    // Calculate document frequencies
    queryTokens.forEach((term) => {
      let count = 0
      this.documents.forEach((doc) => {
        const text = `${doc.title} ${doc.content} ${doc.keywords.join(' ')}`.toLowerCase()
        if (text.includes(term)) count++
      })
      docFreq[term] = count
    })

    return this.documents.map((doc) => {
      const titleTokens = this.tokenize(doc.title)
      const contentTokens = this.tokenize(doc.content)
      const keywordTokens = new Set(doc.keywords.map((k) => k.toLowerCase()))
      const docLength = titleTokens.length + contentTokens.length + doc.keywords.length

      // Term frequencies in title, content, keywords
      const tfTitle = {}
      const tfContent = {}
      titleTokens.forEach((t) => { tfTitle[t] = (tfTitle[t] || 0) + 1 })
      contentTokens.forEach((t) => { tfContent[t] = (tfContent[t] || 0) + 1 })

      let score = 0
      queryTokens.forEach((term) => {
        const df = docFreq[term] || 0
        if (df === 0) return

        // Smoothed IDF
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))

        // Weighted term frequency
        const weightedTf =
          (tfTitle[term] || 0) * 2.5 +
          (tfContent[term] || 0) * 1.0 +
          (keywordTokens.has(term) ? 2.0 : 0)

        // BM25 term saturation formula
        const lenNorm = 1 - this.bm25B + this.bm25B * (docLength / (this.avgDocLength || 1))
        const bm25Term = (weightedTf * (this.bm25K1 + 1)) / (weightedTf + this.bm25K1 * lenNorm)

        score += idf * bm25Term
      })

      return {
        document: doc,
        bm25Score: Number(score.toFixed(4))
      }
    })
  }

  /**
   * Dense Semantic Cosine Similarity Scoring
   */
  scoreDense (query) {
    const queryVector = this.embedText(query)

    return this.documents.map((doc) => {
      const docVector = this.docVectors.get(doc.id)
      const sim = docVector ? this.cosineSimilarity(queryVector, docVector) : 0
      return {
        document: doc,
        denseScore: Number(sim.toFixed(4))
      }
    })
  }

  /**
   * Reciprocal Rank Fusion (RRF) combining Sparse BM25 + Dense Semantic vectors
   */
  hybridSearch (query, limit = 5) {
    const expandedTokens = this.expandQuery(query)
    const sparseResults = this.scoreBM25(expandedTokens)
      .sort((a, b) => b.bm25Score - a.bm25Score)

    const denseResults = this.scoreDense(query)
      .sort((a, b) => b.denseScore - a.denseScore)

    const rrfK = 60
    const fusedMap = new Map()

    sparseResults.forEach((item, rank) => {
      const id = item.document.id
      const sparseRrf = 0.55 / (rrfK + rank + 1)
      fusedMap.set(id, {
        document: item.document,
        bm25Score: item.bm25Score,
        bm25Rank: rank + 1,
        denseScore: 0,
        denseRank: 0,
        rrfScore: sparseRrf
      })
    })

    denseResults.forEach((item, rank) => {
      const id = item.document.id
      const denseRrf = 0.45 / (rrfK + rank + 1)
      if (fusedMap.has(id)) {
        const existing = fusedMap.get(id)
        existing.denseScore = item.denseScore
        existing.denseRank = rank + 1
        existing.rrfScore += denseRrf
      } else {
        fusedMap.set(id, {
          document: item.document,
          bm25Score: 0,
          bm25Rank: 0,
          denseScore: item.denseScore,
          denseRank: rank + 1,
          rrfScore: denseRrf
        })
      }
    })

    const fusedList = Array.from(fusedMap.values())
      .filter((item) => item.bm25Score > 0.05 || item.denseScore > 0.35)
      .sort((a, b) => b.rrfScore - a.rrfScore)

    // Normalize confidence score between 0.05 and 0.98
    const maxRrf = fusedList[0]?.rrfScore || 0.01
    const results = fusedList.slice(0, limit).map((item) => {
      const normalizedScore = item.bm25Score > 0 ? item.bm25Score : item.denseScore * 10
      const confidence = Math.min(
        Math.max(Number(((item.rrfScore / maxRrf) * 0.95).toFixed(2)), 0.15),
        0.98
      )

      return {
        document: item.document,
        score: Number(normalizedScore.toFixed(3)),
        confidence,
        telemetry: {
          bm25Score: item.bm25Score,
          bm25Rank: item.bm25Rank,
          denseScore: item.denseScore,
          denseRank: item.denseRank,
          rrfScore: Number(item.rrfScore.toFixed(5))
        }
      }
    })

    return results
  }

  /**
   * Re-ranks document chunks for high-density prompt generation
   */
  retrieveTopChunks (query, topK = 4) {
    const queryVector = this.embedText(query)
    const queryTokens = new Set(this.tokenize(query))

    return this.chunks
      .map((chunk) => {
        const denseSim = this.cosineSimilarity(queryVector, chunk.vector)
        const chunkTokens = this.tokenize(chunk.content)
        let tokenOverlap = 0
        chunkTokens.forEach((t) => {
          if (queryTokens.has(t)) tokenOverlap++
        })
        const lexicalScore = tokenOverlap / (queryTokens.size || 1)
        const combinedScore = denseSim * 0.6 + lexicalScore * 0.4

        return {
          ...chunk,
          score: Number(combinedScore.toFixed(3))
        }
      })
      .filter((c) => c.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * Self-Reflective RAG (CRAG): Verifies groundedness of synthesized answers against context chunks
   */
  verifyGroundedness (answer, contextChunks = []) {
    if (!answer || contextChunks.length === 0) {
      return { groundednessScore: 0, isGrounded: false, supportedClaims: [], unverifiedTokens: [] }
    }

    const answerTokens = this.tokenize(answer)
    if (answerTokens.length === 0) {
      return { groundednessScore: 0.5, isGrounded: true, supportedClaims: [], unverifiedTokens: [] }
    }

    const contextTokenSet = new Set()
    contextChunks.forEach((c) => {
      const tokens = this.tokenize(typeof c === 'string' ? c : c.content || c.document?.content || '')
      tokens.forEach((t) => contextTokenSet.add(t))
    })

    let supportedCount = 0
    const unverified = []

    answerTokens.forEach((t) => {
      if (contextTokenSet.has(t)) {
        supportedCount++
      } else {
        unverified.push(t)
      }
    })

    const groundednessScore = Number((supportedCount / answerTokens.length).toFixed(2))
    return {
      groundednessScore,
      isGrounded: groundednessScore >= 0.6,
      supportedClaimsCount: supportedCount,
      totalTokensEvaluated: answerTokens.length,
      unverifiedTokens: unverified.slice(0, 10)
    }
  }

  /**
   * Detailed RAG Diagnostic Telemetry for developer inspection and UI debugger
   */
  inspectRAG (query) {
    const startTime = Date.now()
    const expandedTokens = this.expandQuery(query)
    const sparse = this.scoreBM25(expandedTokens).slice(0, 5)
    const dense = this.scoreDense(query).slice(0, 5)
    const hybrid = this.hybridSearch(query, 5)
    const topChunks = this.retrieveTopChunks(query, 4)
    const latencyMs = Date.now() - startTime

    return {
      query,
      expandedTokens,
      sparseResults: sparse,
      denseResults: dense,
      hybridResults: hybrid,
      topChunks,
      latencyMs
    }
  }
}

export const ragEngine = new RAGEngine()
