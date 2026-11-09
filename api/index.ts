// Vercel serverless entrypoint: Vercel deploys this file as a Node.js function and
// rewrites every request to it (see vercel.json). The Hono app lives in src/index.ts,
// which also still runs as a standalone Node server for local development under
// `bun run dev`.
import { handle } from '@hono/vercel'
import app from '../src/index'

export default handle(app)
