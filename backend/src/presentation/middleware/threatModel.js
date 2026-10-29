import { logger } from '../../utils/logger.js'
import { AppError } from '../../utils/errors.js'

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt\s+(reveal|dump|leak|display)/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /bypass\s+(security|policy|filters)/i,
  /(?:\[INST\]|<<SYS>>|<\|im_start\|>|<\|system\|>|<tool_call>| Georgia)/i,
  /---(START|END)\s+(OF\s+)?(SYSTEM(\s+PROMPT)?|PROMPT)---/i,
  /===\s*(?:SYSTEM\s+)?(?:SYSTEM|OVERRIDE)\s*===/i,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
]

const MAX_QUESTION_LENGTH = 1500
const MAX_DESCRIPTION_LENGTH = 5000
const MAX_CONTENT_LENGTH = 50000

export const threatModelMiddleware = (req, res, next) => {
  const body = req.body || {}

  // 1. Length checks
  if (typeof body.question === 'string' && body.question.length > MAX_QUESTION_LENGTH) {
    logger.audit('security.overflow_attempt', req.user?.id || 'anonymous', {
      field: 'question',
      length: body.question.length,
      maxAllowed: MAX_QUESTION_LENGTH
    })
    throw new AppError(`Prompt length exceeds the allowed limit of ${MAX_QUESTION_LENGTH} characters.`, 400)
  }

  if (typeof body.description === 'string' && body.description.length > MAX_DESCRIPTION_LENGTH) {
    logger.audit('security.overflow_attempt', req.user?.id || 'anonymous', {
      field: 'description',
      length: body.description.length,
      maxAllowed: MAX_DESCRIPTION_LENGTH
    })
    throw new AppError(`Description length exceeds the allowed limit of ${MAX_DESCRIPTION_LENGTH} characters.`, 400)
  }

  if (typeof body.content === 'string' && body.content.length > MAX_CONTENT_LENGTH) {
    logger.audit('security.overflow_attempt', req.user?.id || 'anonymous', {
      field: 'content',
      length: body.content.length,
      maxAllowed: MAX_CONTENT_LENGTH
    })
    throw new AppError(`Content length exceeds the allowed limit of ${MAX_CONTENT_LENGTH} characters.`, 400)
  }

  // 2. Collect all string fields for pattern scanning
  const candidateTexts = []
  if (typeof body.question === 'string') candidateTexts.push({ field: 'question', text: body.question })
  if (typeof body.description === 'string') candidateTexts.push({ field: 'description', text: body.description })
  if (typeof body.subject === 'string') candidateTexts.push({ field: 'subject', text: body.subject })
  if (typeof body.content === 'string') candidateTexts.push({ field: 'content', text: body.content })
  if (typeof body.query === 'string') candidateTexts.push({ field: 'query', text: body.query })
  if (body.args && typeof body.args === 'object') {
    if (typeof body.args.description === 'string') candidateTexts.push({ field: 'args.description', text: body.args.description })
    if (typeof body.args.subject === 'string') candidateTexts.push({ field: 'args.subject', text: body.args.subject })
    if (typeof body.args.query === 'string') candidateTexts.push({ field: 'args.query', text: body.args.query })
  }

  for (const { field, text } of candidateTexts) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        logger.audit('security.prompt_injection_blocked', req.user?.id || 'anonymous', {
          field,
          matchedPattern: pattern.toString(),
          sample: text.slice(0, 100)
        })
        return res.status(400).json({
          status: 'fail',
          error: 'Security Warning: Your input contains prohibited instructions or prompt-injection patterns.',
          code: 'PROMPT_INJECTION_FLAGGED'
        })
      }
    }
  }

  next()
}
