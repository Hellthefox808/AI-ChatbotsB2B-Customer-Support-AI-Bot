export const validate = (rules) => (req, res, next) => {
  const errors = []

  if (typeof rules === 'function') {
    const errorMsg = rules(req.body)
    if (errorMsg) {
      errors.push({ message: errorMsg })
    }
  } else if (typeof rules === 'object' && rules !== null) {
    if (typeof rules.validate === 'function') {
      const { error } = rules.validate(req.body, { abortEarly: false })
      if (error && error.details) {
        return res.status(400).json({
          error: 'Validation failed',
          status: 'fail',
          details: error.details.map((d) => ({ field: d.path?.join('.'), message: d.message }))
        })
      }
    } else {
      for (const [field, rule] of Object.entries(rules)) {
        const val = req.body[field]
        if (rule.required && (val === undefined || val === null || val === '')) {
          errors.push({ field, message: `${field} is required` })
          continue
        }
        if (val !== undefined && rule.type) {
          const valType = typeof val
          if (valType !== rule.type) {
            errors.push({ field, message: `${field} must be of type ${rule.type}` })
          }
        }
        if (val !== undefined && rule.minLength && String(val).length < rule.minLength) {
          errors.push({ field, message: `${field} must be at least ${rule.minLength} characters` })
        }
        if (val !== undefined && rule.validator && !rule.validator(val)) {
          errors.push({ field, message: rule.message || `${field} failed validation` })
        }
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      status: 'fail',
      details: errors
    })
  }

  next()
}
