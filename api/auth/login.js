const crypto = require("crypto");

module.exports = (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) return res.status(500).send("Missing GITHUB_CLIENT_ID environment variable.");
  const state = crypto.randomBytes(24).toString("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `github_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: `${process.env.APP_URL}/api/auth/callback`, scope: "read:user repo", state });
  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params}` });
  res.end();
};
