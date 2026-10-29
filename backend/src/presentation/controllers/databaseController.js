import { dbManager } from '../../data/database.js'
import { asyncHandler } from '../../utils/errors.js'

export const getDatabaseHealth = asyncHandler(async (req, res) => {
  const health = dbManager.getHealth()
  res.status(200).json({
    status: 'success',
    data: { health }
  })
})

export const getDatabaseStats = asyncHandler(async (req, res) => {
  const stats = dbManager.getStatistics()
  res.status(200).json({
    status: 'success',
    data: { stats }
  })
})

export const getDatabaseIntegrity = asyncHandler(async (req, res) => {
  const integrity = dbManager.checkIntegrity()
  res.status(200).json({
    status: 'success',
    data: { integrity }
  })
})

export const optimizeDatabase = asyncHandler(async (req, res) => {
  const result = dbManager.optimize()
  res.status(200).json({
    status: 'success',
    data: { result }
  })
})

export const getReaEvidence = asyncHandler(async (req, res) => {
  const evidence = dbManager.getReaEvidence()
  res.status(200).json({
    status: 'success',
    data: { evidence }
  })
})
