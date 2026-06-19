import { spawn, execSync } from "node:child_process"

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
  try {
    execSync("opencode --version", { stdio: "pipe" })
    return "opencode"
  } catch {
    return null
  }
}
