// Catch one-segment API routes; explicit nested route files delegate to the
// same Express app through this shared module.
import app from './_express.js'

export default app
