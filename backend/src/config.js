import dotenv from 'dotenv'
dotenv.config()

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production')) {
  throw new Error('SECURITY VIOLATION: JWT_SECRET must be configured with a cryptographically secure key in production mode.')
}

export const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  claudeApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  aiProvider: process.env.AI_PROVIDER || 'auto',
  dbPath: process.env.DATABASE_PATH || './data/support_bot.db',
  dbMode: process.env.DATABASE_MODE || 'sqlite'
}
