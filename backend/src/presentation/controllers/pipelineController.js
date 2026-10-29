import { pipelineService } from '../../service/pipelineService.js'
import { asyncHandler } from '../../utils/errors.js'

export const getPipelineSources = asyncHandler(async (req, res) => {
  const sources = pipelineService.listSources()
  res.status(200).json({
    status: 'success',
    data: { sources }
  })
})

export const createPipelineSource = asyncHandler(async (req, res) => {
  const source = pipelineService.addSource(req.body)
  res.status(201).json({
    status: 'success',
    data: { source }
  })
})

export const getPipelineJobs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20
  const jobs = pipelineService.listJobs(limit)
  res.status(200).json({
    status: 'success',
    data: { jobs }
  })
})

export const getPipelineJobById = asyncHandler(async (req, res) => {
  const job = pipelineService.getJobById(req.params.id)
  if (!job) {
    return res.status(404).json({ status: 'fail', error: 'Pipeline job not found' })
  }
  res.status(200).json({
    status: 'success',
    data: { job }
  })
})

export const triggerPipeline = asyncHandler(async (req, res) => {
  const { pipelineName } = req.body
  const triggeredBy = req.user?.email || 'admin'
  const job = await pipelineService.runPipeline(pipelineName, triggeredBy)
  res.status(200).json({
    status: 'success',
    data: { job }
  })
})

export const ingestPipelineDocument = asyncHandler(async (req, res) => {
  const { title, category, content, keywords, sourceId } = req.body
  const doc = pipelineService.ingestDocument({
    title,
    category,
    content,
    keywords,
    sourceId: sourceId || 'manual-upload'
  })
  res.status(201).json({
    status: 'success',
    data: { document: doc }
  })
})
