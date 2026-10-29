import { gtmService } from '../../service/gtmService.js'
import { ticketRepository } from '../../data/ticketRepository.js'
import { conversationRepository } from '../../data/conversationRepository.js'
import { asyncHandler } from '../../utils/errors.js'

export const qualifyLead = asyncHandler(async (req, res) => {
  const result = gtmService.qualifyLead(req.body)
  res.status(200).json({
    status: 'success',
    data: { qualification: result }
  })
})

export const generateGTMResponse = asyncHandler(async (req, res) => {
  const result = gtmService.generateGTMResponse(req.body)
  res.status(200).json({
    status: 'success',
    data: { response: result }
  })
})

export const analyzeAccountIntent = asyncHandler(async (req, res) => {
  let tickets = []
  let messages = []

  if (req.body.tickets && Array.isArray(req.body.tickets)) {
    tickets = req.body.tickets
  } else {
    tickets = ticketRepository.listTickets()
  }

  if (req.body.messages && Array.isArray(req.body.messages)) {
    messages = req.body.messages
  } else if (req.body.conversationId) {
    messages = conversationRepository.getMessages(req.body.conversationId)
  }

  const result = gtmService.analyzeAccountIntent(tickets, messages)
  res.status(200).json({
    status: 'success',
    data: { analysis: result }
  })
})

export const getGTMPlaybooks = asyncHandler(async (req, res) => {
  const playbooks = gtmService.listPlaybooks()
  res.status(200).json({
    status: 'success',
    data: { playbooks }
  })
})

export const generateOutreach = asyncHandler(async (req, res) => {
  const draft = gtmService.generateOutreachDraft(req.body)
  res.status(200).json({
    status: 'success',
    data: { draft }
  })
})

export const getAttribution = asyncHandler(async (req, res) => {
  const result = gtmService.calculateAttribution(req.body?.opportunities)
  res.status(200).json({
    status: 'success',
    data: { attribution: result }
  })
})

// ==========================================
// CAMPAIGN LIFECYCLE & DISPATCH QUEUE
// ==========================================

export const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = gtmService.listCampaigns()
  res.status(200).json({
    status: 'success',
    data: { campaigns }
  })
})

export const createCampaign = asyncHandler(async (req, res) => {
  const campaign = gtmService.createCampaign(req.body)
  res.status(201).json({
    status: 'success',
    data: { campaign }
  })
})

export const approveCampaign = asyncHandler(async (req, res) => {
  const campaign = gtmService.approveCampaign(req.params.id, req.user?.email || 'admin@company.com')
  res.status(200).json({
    status: 'success',
    data: { campaign }
  })
})

export const getCampaignQueue = asyncHandler(async (req, res) => {
  const queue = gtmService.getCampaignQueue(req.params.id || null)
  res.status(200).json({
    status: 'success',
    data: { queue }
  })
})

export const enqueueCampaignMessage = asyncHandler(async (req, res) => {
  const message = gtmService.enqueueCampaignMessage(req.body)
  res.status(201).json({
    status: 'success',
    data: { message }
  })
})

export const dispatchCampaign = asyncHandler(async (req, res) => {
  const batchLimit = Number(req.body?.batchLimit) || 5
  const result = gtmService.dispatchCampaign(req.params.id, batchLimit)
  res.status(200).json({
    status: 'success',
    data: { dispatch: result }
  })
})

// ==========================================
// ACCOUNTS & CONTACTS
// ==========================================

export const listAccounts = asyncHandler(async (req, res) => {
  const accounts = gtmService.listAccounts()
  res.status(200).json({
    status: 'success',
    data: { accounts }
  })
})

export const getAccountById = asyncHandler(async (req, res) => {
  const account = gtmService.getAccountById(req.params.id)
  if (!account) {
    return res.status(404).json({ status: 'error', error: 'Account not found' })
  }
  res.status(200).json({
    status: 'success',
    data: { account }
  })
})

export const createAccount = asyncHandler(async (req, res) => {
  const account = gtmService.createAccount(req.body)
  res.status(201).json({
    status: 'success',
    data: { account }
  })
})

export const listContacts = asyncHandler(async (req, res) => {
  const contacts = gtmService.listContacts(req.query?.accountId || null)
  res.status(200).json({
    status: 'success',
    data: { contacts }
  })
})

export const createContact = asyncHandler(async (req, res) => {
  const contact = gtmService.createContact(req.body)
  res.status(201).json({
    status: 'success',
    data: { contact }
  })
})

// ==========================================
// OPPORTUNITIES
// ==========================================

export const listOpportunities = asyncHandler(async (req, res) => {
  const opportunities = gtmService.listOpportunities(req.query?.accountId || null)
  res.status(200).json({
    status: 'success',
    data: { opportunities }
  })
})

export const createOpportunity = asyncHandler(async (req, res) => {
  const opportunity = gtmService.createOpportunity(req.body)
  res.status(201).json({
    status: 'success',
    data: { opportunity }
  })
})

export const updateOpportunityStage = asyncHandler(async (req, res) => {
  const opportunity = gtmService.updateOpportunityStage(req.params.id, req.body.stage, req.body.probability)
  res.status(200).json({
    status: 'success',
    data: { opportunity }
  })
})

// ==========================================
// SUPPRESSION & AUDIENCE FILTERING
// ==========================================

export const listSuppressions = asyncHandler(async (req, res) => {
  const suppressions = gtmService.listSuppressions()
  res.status(200).json({
    status: 'success',
    data: { suppressions }
  })
})

export const addSuppression = asyncHandler(async (req, res) => {
  const suppression = gtmService.addSuppression(req.body)
  res.status(201).json({
    status: 'success',
    data: { suppression }
  })
})

export const removeSuppression = asyncHandler(async (req, res) => {
  const removed = gtmService.removeSuppression(req.params.id)
  res.status(200).json({
    status: 'success',
    data: { removed }
  })
})

export const checkSuppression = asyncHandler(async (req, res) => {
  const value = req.query?.value || req.body?.value || ''
  const isSuppressed = gtmService.isSuppressed(value)
  res.status(200).json({
    status: 'success',
    data: { value, isSuppressed }
  })
})

export const filterAudience = asyncHandler(async (req, res) => {
  const result = gtmService.filterAudience(req.body?.audience || [])
  res.status(200).json({
    status: 'success',
    data: { filtering: result }
  })
})

// ==========================================
// CRM SYNC
// ==========================================

export const syncCRM = asyncHandler(async (req, res) => {
  const result = gtmService.syncToCRM(req.body)
  res.status(200).json({
    status: 'success',
    data: { sync: result }
  })
})
