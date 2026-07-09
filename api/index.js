// Vercel serverless entry — the Express app handles all /api/* routes.
// Static frontend (dist) is served by Vercel's CDN, configured in vercel.json.
import app from '../server/app.js'

export default app
