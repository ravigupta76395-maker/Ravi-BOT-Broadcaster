const https = require("https");

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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ ok: false, error: "Token missing" });

  try {
    const data = await telegramRequest(token, "getUpdates", {
      limit: 100,
      allowed_updates: ["message"],
    });

    if (!data.ok) return res.status(200).json({ ok: false, error: data.description });

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

    return res.status(200).json({ ok: true, users });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
