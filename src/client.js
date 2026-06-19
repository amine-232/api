function parseModel(input) {
  if (!input) return undefined;
  if (typeof input === "object" && input.id && input.providerID) return input;
  if (typeof input === "string") {
    const idx = input.indexOf("/");
    if (idx === -1) return { id: input, providerID: input };
    return { id: input.slice(idx + 1), providerID: input.slice(0, idx) };
  }
  return input;
}

function partsToText(parts) {
  if (!parts) return "";
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  }
  return String(parts);
}

export class OpencodeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let err;
      try {
        const json = await res.json();
        err = json.message || json.error || JSON.stringify(json);
      } catch {
        err = await res.text().catch(() => res.statusText);
      }
      throw new Error(`API ${method} ${path}: ${res.status} ${err}`);
    }
    return res.json();
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return await res.json();
    } catch {
      return await this.request("GET", "/api/health");
    }
  }

  async listAgents() {
    const result = await this.request("GET", "/api/agent");
    return result.data ?? result;
  }

  async listProviders() {
    const result = await this.request("GET", "/api/provider");
    return result.data ?? result;
  }

  async listModels() {
    const providers = await this.listProviders();
    const models = [];
    const all = Array.isArray(providers) ? providers : (providers.all ?? []);
    for (const p of all) {
      if (!p.models) continue;
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
        });
      }
    }
    return models;
  }

  async createSession(input = {}) {
    const body = {};
    if (input.directory) body.location = { directory: input.directory };
    if (input.agent) body.agent = input.agent;
    if (input.model) body.model = parseModel(input.model);
    const result = await this.request("POST", "/api/session", body);
    return result.data ?? result;
  }

  async listSessions() {
    const result = await this.request("GET", "/api/session");
    return result.data ?? result;
  }

  async getSession(sessionId) {
    const result = await this.request("GET", `/api/session/${sessionId}`);
    return result.data ?? result;
  }

  async prompt(input) {
    const sessionId = input.sessionId;
    const text = partsToText(input.parts);
    const body = { prompt: { text } };
    if (input.delivery) body.delivery = input.delivery;
    if (input.resume != null) body.resume = input.resume;

    return await this.request("POST", `/api/session/${sessionId}/prompt`, body);
  }

  async getMessages(sessionId) {
    const result = await this.request(
      "GET",
      `/api/session/${sessionId}/message`,
    );
    return result.data ?? result;
  }

  async abortSession(sessionId) {
    return await this.request("POST", `/api/session/${sessionId}/abort`);
  }

  async runPrompt(input) {
    let sessionId;
    if (input.sessionId) {
      sessionId = input.sessionId;
    } else {
      const session = await this.createSession({
        directory: input.directory,
        agent: input.agent,
        model: input.model,
      });
      sessionId = session.id ?? session.sessionID;
    }
    return this.prompt({ sessionId, parts: input.parts });
  }
}
