import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import routes from './presentation/routes.js'
import { errorHandler } from './utils/errors.js'
import { config } from './config.js'
import { logger } from './utils/logger.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(morgan('combined'))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'b2b-customer-support-ai-bot', time: new Date().toISOString() })
})

app.use('/api', routes)

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', status: 'fail' })
})

app.use(errorHandler)

const server = app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`, { env: config.nodeEnv })
})

export default server
