import { fineTuningService } from '../../service/fineTuningService.js'
import { toolRegistry } from '../../integration/toolRegistry.js'
import { asyncHandler } from '../../utils/errors.js'

export const getFineTuningStats = asyncHandler(async (req, res) => {
  const stats = fineTuningService.getStatistics()
  res.status(200).json({
    status: 'success',
    data: { stats }
  })
})

export const regenerateSyntheticData = asyncHandler(async (req, res) => {
  fineTuningService.initDataset()
  const stats = fineTuningService.getStatistics()
  res.status(200).json({
    status: 'success',
    message: 'Fine-tuning synthetic dataset regenerated successfully from corporate documentation.',
    data: { stats }
  })
})

export const exportFineTuningData = asyncHandler(async (req, res) => {
  const format = req.query.format || 'gemini'
  const split = req.query.split || 'train'
  const asJsonl = req.query.download === 'true' || req.query.jsonl === 'true'

  const dataset = fineTuningService.exportDataset(format, split)

  if (asJsonl) {
    const jsonlContent = dataset.map((d) => JSON.stringify(d)).join('\n')
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Content-Disposition', `attachment; filename="b2b-support-${format}-${split}.jsonl"`)
    return res.status(200).send(jsonlContent)
  }

  res.status(200).json({
    status: 'success',
    format,
    split,
    count: dataset.length,
    data: { dataset }
  })
})

export const listAgentTools = asyncHandler(async (req, res) => {
  const tools = toolRegistry.getSchemas()
  res.status(200).json({
    status: 'success',
    data: { tools }
  })
})

export const executeAgentTool = asyncHandler(async (req, res) => {
  const { name, args } = req.body
  if (!name) {
    return res.status(400).json({ status: 'fail', message: 'Tool name is required' })
  }
  const result = await toolRegistry.executeTool(name, args || {}, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    role: req.user?.role
  })
  res.status(200).json({
    status: 'success',
    data: { name, args: args || {}, result }
  })
})
