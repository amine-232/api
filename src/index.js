import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { OpencodeClient } from "./client.js"
import { startServer, getServerUrl } from "./opencode.js"

const app = new Hono()
app.use("*", logger())
app.use("*", cors())

let client

const getClient = () => {
  if (!client) client = new OpencodeClient(getServerUrl())
  return client
}

app.get("/health", async (c) => {
  try {
    const health = await getClient().health()
    return c.json({ ...health, opencode: "connected" })
  } catch (e) {
    return c.json({ status: "error", opencode: "disconnected", message: String(e) }, 503)
  }
})

app.get("/agents", async (c) => {
  const agents = await getClient().listAgents()
  return c.json(agents)
})

app.get("/providers", async (c) => {
  const providers = await getClient().listProviders()
  return c.json(providers)
})

app.get("/models", async (c) => {
  const models = await getClient().listModels()
  return c.json(models)
})

app.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const session = await getClient().createSession({
    directory: body.directory,
    agent: body.agent,
    model: body.model,
  })
  return c.json(session, 201)
})

app.get("/sessions", async (c) => {
  const sessions = await getClient().listSessions()
  return c.json(sessions)
})

app.get("/sessions/:id", async (c) => {
  const session = await getClient().getSession(c.req.param("id"))
  return c.json(session)
})

app.post("/sessions/:id/prompt", async (c) => {
  const body = await c.req.json()
  const result = await getClient().prompt({
    sessionId: c.req.param("id"),
    parts: body.parts || [{ type: "text", text: body.text || "" }],
    agent: body.agent,
    model: body.model,
  })
  return c.json(result)
})

app.get("/sessions/:id/messages", async (c) => {
  const messages = await getClient().getMessages(c.req.param("id"))
  return c.json(messages)
})

app.post("/sessions/:id/abort", async (c) => {
  await getClient().abortSession(c.req.param("id"))
  return c.json({ ok: true })
})

app.post("/run", async (c) => {
  const body = await c.req.json()
  const result = await getClient().runPrompt({
    parts: body.parts || [{ type: "text", text: body.text || "" }],
    directory: body.directory,
    agent: body.agent,
    model: body.model,
    sessionId: body.sessionId,
  })
  return c.json(result)
})

const PORT = parseInt("3000", 10)
const HOST = "0.0.0.0"
const OPENCODE_PORT = parseInt("4096", 10)

async function main() {
  try {
    console.log("Starting opencode server...")
    const server = await startServer({ port: OPENCODE_PORT })
    console.log(`opencode listening at ${server.url}`)

    console.log(`API server starting on http://${HOST}:${PORT}`)
    serve({ port: PORT, hostname: HOST, fetch: app.fetch })
  } catch (e) {
    console.error("Failed to start:", e)
  }
}

main()
