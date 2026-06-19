import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export class OpencodeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  async request(method, path, body) {
    const headers = {}
    if (body) headers["Content-Type"] = "application/json"

    // Add /api/ prefix for API endpoints
    const apiPath = path.startsWith('/api') ? path : `/api${path}`
    
    const res = await fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`API ${method} ${path}: ${res.status} ${err}`)
    }
    return res.json()
  }

  async health() {
    return await this.request("GET", "/health")
  }

  async listAgents() {
    return await this.request("GET", "/agent")
  }

  async listProviders() {
    return await this.request("GET", "/provider")
  }

  async listModels() {
    const providers = await this.listProviders()
    const models = []
    for (const p of providers.all ?? []) {
      if (!p.models) continue
      for (const [key, m] of Object.entries(p.models)) {
        models.push({
          id: key,
          providerID: p.id,
          providerName: p.name,
          name: m.name ?? key,
          context: m.limit?.context ?? 0,
          releaseDate: m.release_date ?? "",
          reasoning: m.reasoning ?? false,
          experimental: m.experimental,
          status: m.status,
        })
      }
    }
    return models
  }

  async createSession(input = {}) {
    const body = { directory: input.directory || process.cwd() }
    if (input.agent) body.agent = input.agent
    if (input.model) body.model = input.model

    return await this.request("POST", "/session", body)
  }

  async listSessions() {
    return await this.request("GET", "/session")
  }

  async getSession(sessionId) {
    return await this.request("GET", `/session/${sessionId}`)
  }

  async prompt(input) {
    const body = { parts: input.parts }
    if (input.agent) body.agent = input.agent
    if (input.model) body.model = input.model
    return await this.request("POST", `/session/${input.sessionId}/message`, body)
  }

  async getMessages(sessionId) {
    return await this.request("GET", `/session/${sessionId}/message`)
  }

  async abortSession(sessionId) {
    return await this.request("POST", `/session/${sessionId}/abort`)
  }

  async runPrompt(input) {
    let sessionId
    if (input.sessionId) {
      sessionId = input.sessionId
    } else {
      const session = await this.createSession({
        directory: input.directory || "/home",
        agent: input.agent,
        model: input.model,
      })
      sessionId = session.id ?? session.sessionID
    }
    return this.prompt({ 
      sessionId, 
      parts: input.parts, 
      agent: input.agent, 
      model: input.model 
    })
  }
}
