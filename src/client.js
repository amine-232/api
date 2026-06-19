import { getServerUrl } from "./opencode.js"

export class OpencodeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    
    // Handle both /api/* and direct paths
    const apiPath = path.startsWith('/api') ? path : `/api${path}`;
    
    try {
      const res = await fetch(`${this.baseUrl}${apiPath}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error(`Non-JSON response from ${method} ${path}:`, text.slice(0, 200));
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 100)}`);
      }
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`API ${method} ${path}: ${res.status} ${JSON.stringify(err)}`);
      }
      return res.json();
    } catch (e) {
      console.error(`Request failed ${method} ${path}:`, e);
      throw e;
    }
  }


  async health() {
    return this.request("GET", "/api/health")
  }

  async listAgents() {
    const result = await this.request("GET", "/api/agent")
    return result.data ?? result
  }

  async listProviders() {
    const result = await this.request("GET", "/api/provider")
    return result.data ?? result
  }

  async listModels() {
    const providers = await this.listProviders()
    const models = []
    const all = Array.isArray(providers) ? providers : (providers.all ?? [])
    for (const p of all) {
      if (!p.models) continue
      for (const key of Object.keys(p.models)) {
        const m = p.models[key]
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
    const body = {}
    if (input.directory) body.location = { directory: input.directory }
    if (input.agent) body.agent = input.agent
    if (input.model) body.model = typeof input.model === "string" ? { id: input.model, providerID: input.model } : input.model
    const result = await this.request("POST", "/api/session", body)
    return result.data ?? result
  }

  async listSessions() {
    const result = await this.request("GET", "/api/session")
    return result.data ?? result
  }

  async getSession(sessionId) {
    const result = await this.request("GET", `/api/session/${sessionId}`)
    return result.data ?? result
  }

  async prompt(input) {
    return this.request("POST", `/api/session/${input.sessionId}/prompt`, {
      prompt: { text: input.text || (Array.isArray(input.parts) ? input.parts.map(p => p.type === "text" ? p.text : "").join("\n") : "") },
    })
  }

  async getMessages(sessionId) {
    const result = await this.request("GET", `/api/session/${sessionId}/message`)
    return result.data ?? result
  }

  async runPrompt(input) {
    let sessionId = input.sessionId
    if (!sessionId) {
      const session = await this.createSession({ directory: input.directory, agent: input.agent, model: input.model })
      sessionId = session.id ?? session.sessionID
    }
    return this.prompt({ sessionId, parts: input.parts, text: input.text })
  }
}
