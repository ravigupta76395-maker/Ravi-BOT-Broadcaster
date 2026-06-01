const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = 3000;

// Helper: Telegram API call
function telegramRequest(token, method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${token}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from Telegram")); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// Helper: Send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

// Helper: Read request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // Serve index.html
  if (req.method === "GET" && pathname === "/") {
    const filePath = path.join(__dirname, "index.html");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(filePath));
    }
    return sendJSON(res, 404, { error: "index.html not found" });
  }

  // GET /api/getUsers?token=...
  if (req.method === "GET" && pathname === "/api/getUsers") {
    const token = parsed.query.token;
    if (!token) return sendJSON(res, 400, { ok: false, error: "Token missing" });

    try {
      const data = await telegramRequest(token, "getUpdates", {
        limit: 100,
        allowed_updates: ["message"],
      });

      if (!data.ok) return sendJSON(res, 200, { ok: false, error: data.description });

      const seen = new Set();
      const users = [];
      for (const upd of data.result) {
        const msg = upd.message || upd.edited_message;
        if (msg && msg.from && !msg.from.is_bot) {
          const u = msg.from;
          if (!seen.has(u.id)) {
            seen.add(u.id);
            users.push({
              id: u.id,
              name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Unknown",
              username: u.username || "",
            });
          }
        }
      }
      return sendJSON(res, 200, { ok: true, users });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  // POST /api/send  { token, chat_id, text }
  if (req.method === "POST" && pathname === "/api/send") {
    const body = await readBody(req);
    const { token, chat_id, text } = body;
    if (!token || !chat_id || !text)
      return sendJSON(res, 400, { ok: false, error: "token, chat_id, text required" });

    try {
      const result = await telegramRequest(token, "sendMessage", {
        chat_id,
        text,
        parse_mode: "HTML",
      });
      return sendJSON(res, 200, result);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  sendJSON(res, 404, { error: "Route not found" });
});

server.listen(PORT, () => {
  console.log(`\n✅ Server chal raha hai: http://localhost:${PORT}`);
  console.log(`📡 Browser mein kholo: http://localhost:${PORT}\n`);
});
