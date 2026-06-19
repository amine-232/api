const SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:56817"

export function getServerUrl() {
  return SERVER_URL
}
