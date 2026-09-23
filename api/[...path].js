// Export the Express application itself as the Vercel Node function handler.
// Keeping this catch-all entrypoint lets Express own every nested /api route.
import app from '../server/index.js'

export default app
