import express from 'express'
import { authenticate, authorize } from './middleware/auth.js'
import { threatModelMiddleware } from './middleware/threatModel.js'
import {
  askQuestion,
  streamQuestion,
  getConversation,
  listConversations,
  getLLMProviders,
  selectLLMProvider,
  inspectRAG
} from './controllers/chatController.js'
import {
  register,
  login,
  me,
  listUsers
} from './controllers/authController.js'
import {
  createTicket,
  listTickets,
  getTicket,
  resolveTicket
} from './controllers/ticketController.js'
import {
  getFineTuningStats,
  regenerateSyntheticData,
  exportFineTuningData,
  listAgentTools,
  executeAgentTool
} from './controllers/fineTuningController.js'
import {
  getDatabaseHealth,
  getDatabaseStats,
  getDatabaseIntegrity,
  optimizeDatabase,
  getReaEvidence
} from './controllers/databaseController.js'
import {
  getPipelineSources,
  createPipelineSource,
  getPipelineJobs,
  getPipelineJobById,
  triggerPipeline,
  ingestPipelineDocument
} from './controllers/pipelineController.js'
import {
  qualifyLead,
  generateGTMResponse,
  analyzeAccountIntent,
  getGTMPlaybooks,
  generateOutreach,
  getAttribution,
  listCampaigns,
  createCampaign,
  approveCampaign,
  getCampaignQueue,
  enqueueCampaignMessage,
  dispatchCampaign,
  listAccounts,
  getAccountById,
  createAccount,
  listContacts,
  createContact,
  listOpportunities,
  createOpportunity,
  updateOpportunityStage,
  listSuppressions,
  addSuppression,
  removeSuppression,
  checkSuppression,
  filterAudience,
  syncCRM
} from './controllers/gtmController.js'
import { documentRepository } from '../data/documentRepository.js'

const router = express.Router()

// Public auth routes
router.post('/auth/register', register)
router.post('/auth/login', login)

// Protected routes (Authentication Required)
router.use(authenticate)

// User Profile & Management
router.get('/auth/me', me)
router.get('/auth/users', authorize('admin'), listUsers)

// Chat & AI Assistance
router.post('/chat/ask', threatModelMiddleware, askQuestion)
router.post('/chat/ask/stream', threatModelMiddleware, streamQuestion)
router.get('/chat/conversations', listConversations)
router.get('/chat/conversations/:conversationId', getConversation)

// Multi-Model LLM Provider Management
router.get('/llm/providers', getLLMProviders)
router.post('/llm/providers/select', selectLLMProvider)

// Advanced RAG Diagnostics & Telemetry
router.get('/rag/inspect', inspectRAG)
router.post('/rag/inspect', inspectRAG)

// Knowledge Base Access
router.get('/knowledge/search', (req, res) => {
  const query = req.query.q || ''
  const results = documentRepository.search(query)
  res.json({ status: 'success', data: { results } })
})
router.get('/knowledge/docs', (req, res) => {
  res.json({ status: 'success', data: { documents: documentRepository.findAll() } })
})

// Ticket SLA & Support Operations (omh-support-operations)
router.post('/tickets', threatModelMiddleware, createTicket)
router.get('/tickets', listTickets)
router.get('/tickets/:ticketId', getTicket)
router.patch('/tickets/:ticketId/resolve', authorize('admin', 'support_agent'), resolveTicket)

// Agent Tools & Fine-Tuning Operations
router.get('/tools', listAgentTools)
router.post('/tools/execute', threatModelMiddleware, executeAgentTool)
router.get('/finetuning/stats', getFineTuningStats)
router.post('/finetuning/generate', authorize('admin'), regenerateSyntheticData)
router.get('/finetuning/export', exportFineTuningData)

// Database Connection, Storage Stats & REA Verification Engine
router.get('/db/health', getDatabaseHealth)
router.get('/db/stats', getDatabaseStats)
router.get('/db/integrity', getDatabaseIntegrity)
router.post('/db/optimize', authorize('admin'), optimizeDatabase)
router.get('/db/rea-evidence', getReaEvidence)

// Data Ingestion & Indexing Pipeline Engine
router.get('/pipeline/sources', getPipelineSources)
router.post('/pipeline/sources', authorize('admin'), createPipelineSource)
router.get('/pipeline/jobs', getPipelineJobs)
router.get('/pipeline/jobs/:id', getPipelineJobById)
router.post('/pipeline/run', authorize('admin'), triggerPipeline)
router.post('/pipeline/ingest', authorize('admin', 'support_agent'), threatModelMiddleware, ingestPipelineDocument)

// GTM & Lead Qualification Engine
router.post('/gtm/qualify', threatModelMiddleware, qualifyLead)
router.post('/gtm/qualify-lead', threatModelMiddleware, qualifyLead)
router.post('/gtm/respond', threatModelMiddleware, generateGTMResponse)
router.post('/gtm/response', threatModelMiddleware, generateGTMResponse)
router.post('/gtm/intent', analyzeAccountIntent)
router.post('/gtm/account-intent', analyzeAccountIntent)
router.get('/gtm/playbooks', getGTMPlaybooks)
router.post('/gtm/outreach', threatModelMiddleware, generateOutreach)
router.get('/gtm/attribution', getAttribution)
router.post('/gtm/attribution', getAttribution)

// GTM Campaigns & Human-in-the-Loop Approval
router.get('/gtm/campaigns', listCampaigns)
router.post('/gtm/campaigns', createCampaign)
router.patch('/gtm/campaigns/:id/approve', authorize('admin'), approveCampaign)
router.get('/gtm/campaigns/:id/queue', getCampaignQueue)
router.post('/gtm/campaigns/enqueue', enqueueCampaignMessage)
router.post('/gtm/campaigns/:id/dispatch', authorize('admin'), dispatchCampaign)

// GTM Accounts & Contacts Data Model
router.get('/gtm/accounts', listAccounts)
router.get('/gtm/accounts/:id', getAccountById)
router.post('/gtm/accounts', createAccount)
router.get('/gtm/contacts', listContacts)
router.post('/gtm/contacts', createContact)

// GTM Opportunities & Pipeline Attribution
router.get('/gtm/opportunities', listOpportunities)
router.post('/gtm/opportunities', createOpportunity)
router.patch('/gtm/opportunities/:id/stage', updateOpportunityStage)

// GTM Suppression & Opt-Out Registry
router.get('/gtm/suppression', listSuppressions)
router.post('/gtm/suppression', addSuppression)
router.delete('/gtm/suppression/:id', removeSuppression)
router.get('/gtm/suppression/check', checkSuppression)
router.post('/gtm/suppression/filter', filterAudience)

// GTM CRM Sync
router.post('/gtm/sync-crm', syncCRM)

export default router
