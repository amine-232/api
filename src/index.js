import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { OpencodeClient } from "./client.js"
import { getServerUrl } from "./opencode.js"

const app = new Hono()
app.use("*", logger())
app.use("*", cors())

let client

function getClient() {
  if (!client) client = new OpencodeClient(getServerUrl())
  return client
}

app.get("/health", async (c) => {
  try {
    const health = await getClient().health()
    return c.json({ ...health, opencode: "connected" })
  } catch (e) {
    return c.json({ status: "ok", mode: "standalone", message: "no upstream opencode server" })
  }
})

function parseModel(input) {
  if (!input) return undefined
  if (typeof input === "object" && input.id) return input
  if (typeof input === "string") {
    const idx = input.indexOf("/")
    return idx === -1 ? { id: input, providerID: input } : { id: input.slice(idx + 1), providerID: input.slice(0, idx) }
  }
  return input
}

app.get("/agents", async (c) => {
  try { return c.json(await getClient().listAgents()) }
  catch { return c.json([]) }
})

app.get("/providers", async (c) => {
  try { return c.json(await getClient().listProviders()) }
  catch { return c.json([]) }
})

app.get("/models", async (c) => {
  try { return c.json(await getClient().listModels()) }
  catch { return c.json([]) }
})

app.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const session = await getClient().createSession({
      directory: body.directory,
      agent: body.agent,
      model: parseModel(body.model),
    })
    return c.json(session, 201)
  } catch (e) {
    return c.json({ id: Date.now().toString(36), created: true, mode: "standalone" }, 201)
  }
})

app.get("/sessions", async (c) => {
  try { return c.json(await getClient().listSessions()) }
  catch { return c.json([]) }
})

app.get("/sessions/:id", async (c) => {
  try { return c.json(await getClient().getSession(c.req.param("id"))) }
  catch { return c.json({ id: c.req.param("id"), notFound: true }, 404) }
})

app.post("/sessions/:id/prompt", async (c) => {
  const body = await c.req.json()
  const sessionId = c.req.param("id")
  try {
    return c.json(await getClient().prompt({ sessionId, parts: body.parts, text: body.text }))
  } catch (e) {
    return c.json({ text: "[mock] Received prompt for " + sessionId + ": " + (body.text || "") })
  }
})

app.get("/sessions/:id/messages", async (c) => {
  try { return c.json(await getClient().getMessages(c.req.param("id"))) }
  catch { return c.json([]) }
})

app.post("/run", async (c) => {
  const body = await c.req.json()
  try {
    return c.json(await getClient().runPrompt({
      parts: body.parts || [{ type: "text", text: body.text || "" }],
      directory: body.directory,
      agent: body.agent,
      model: parseModel(body.model),
      sessionId: body.sessionId,
    }))
  } catch (e) {
    return c.json({ text: "[mock] Run result for: " + (body.text || "") })
  }
})

const PORT = parseInt(process.env.PORT || "3000", 10)
serve({ port: PORT, hostname: "0.0.0.0", fetch: app.fetch })
