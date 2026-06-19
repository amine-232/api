import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

let proc = null;
let serverUrl = "";

export function isRunning() {
  return proc !== null && proc.exitCode === null;
}

export async function startServer(options = {}) {
  if (isRunning()) return { url: serverUrl };

  const port = options.port || 4096;
  const hostname = options.hostname || "127.0.0.1";
  const password = ""; // Empty password - disable auth
  const binary = options.binary || findBinary();

  if (!binary) {
    throw new Error(
      "opencode binary not found. Install it via:\n" +
        "  curl -fsSL https://opencode.ai/install | bash\n" +
        "or download from https://github.com/anomalyco/opencode/releases",
    );
  }

  return new Promise((resolve, reject) => {
    // Add --pure flag to disable plugins
    const args = [
      "serve",
      `--port=${port}`,
      `--hostname=${hostname}`,
      "--pure",
    ];

    console.log(`Spawning: ${binary} ${args.join(" ")}`);

    proc = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_DISABLE_AUTH: "true", // Try to disable auth
      },
    });

    let output = "";
    const timeout = setTimeout(() => {
      stopServer();
      reject(new Error("Timed out waiting for opencode server to start"));
    }, 15000);

    proc.stdout?.on("data", (chunk) => {
      const data = chunk.toString();
      output += data;
      console.log("stdout:", data.trim());
      const match = output.match(/listening on (https?:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        serverUrl = match[1];
        resolve({ url: serverUrl });
      }
    });

    proc.stderr?.on("data", (chunk) => {
      const data = chunk.toString();
      output += data;
      console.log("stderr:", data.trim());
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      proc = null;
      console.log(`Process exited with code ${code}`);
      console.log("Full output:", output);
      if (code !== 0) {
        reject(
          new Error(`opencode server exited with code ${code}\n${output}`),
        );
      } else {
        if (!serverUrl) {
          reject(new Error("Server exited without providing URL"));
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      proc = null;
      console.error("Spawn error:", err);
      reject(err);
    });
  });
}

export function getServerUrl() {
  if (!serverUrl) throw new Error("Server not started");
  return serverUrl;
}

export function getPassword() {
  const file = join(homedir(), ".opencode", "api-password");
  return existsSync(file) ? file : null;
}

export async function stopServer() {
  if (proc) {
    proc.kill("SIGTERM");
    proc = null;
    serverUrl = "";
  }
}

export function findBinary() {
  try {
    execSync("opencode --version", { stdio: "pipe" });
    return "opencode";
  } catch {
    return null;
  }
}
