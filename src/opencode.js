import { spawn, execSync } from "node:child_process"
import { join } from "node:path"
import { existsSync } from "node:fs"

let proc = null
let serverUrl = ""

export function isRunning() {
  return proc !== null && proc.exitCode === null
}

export async function startServer(options = {}) {
  if (isRunning()) return { url: serverUrl }

  const port = options.port || 4096
  const hostname = options.hostname || "127.0.0.1"
  const binary = options.binary || findBinary()

  if (!binary) {
    throw new Error(
      "opencode binary not found. Install it via:\n" +
      "  curl -fsSL https://opencode.ai/install | bash\n" +
      "or download from https://github.com/anomalyco/opencode/releases",
    )
  }

  return new Promise((resolve, reject) => {
    const args = ["serve", `--port=${port}`, `--hostname=${hostname}`]

    proc = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: true,
    })

    let output = ""
    const timeout = setTimeout(() => {
      stopServer()
      reject(new Error("Timed out waiting for opencode server to start"))
    }, 15000)

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      const match = output.match(/listening on (https?:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timeout)
        serverUrl = match[1]
        resolve({ url: serverUrl })
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(timeout)
      proc = null
      reject(new Error(`opencode server exited with code ${code}\n${output}`))
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      proc = null
      reject(err)
    })
  })
}

export function getServerUrl() {
  if (!serverUrl) throw new Error("Server not started")
  return serverUrl
}

export async function stopServer() {
  if (proc) {
    proc.kill("SIGTERM")
    proc = null
    serverUrl = ""
  }
}

export function findBinary() {
  const candidates = ["opencode", "lildax"]

  // Search known global bin directories for the full path first (spawn needs exact path).
  const globalDirs = [].concat(
    process.env.APPDATA ? join(process.env.APPDATA, "npm") : [],
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "hermes", "node") : [],
  )
  for (const dir of globalDirs) {
    for (const name of candidates) {
      for (const ext of [".cmd", ".exe", ""]) {
        const full = join(dir, `${name}${ext}`)
        if (existsSync(full)) return full
      }
    }
  }

  // Fall back to bare command name (works if PATH is available).
  for (const name of candidates) {
    try {
      execSync(`${name} --version`, { stdio: "pipe" })
      return name
    } catch {
      // try next name
    }
  }

  return null
}
