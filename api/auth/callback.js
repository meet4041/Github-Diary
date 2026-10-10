const { setSessionCookie } = require("./_session");

function readCookie(req, name) {
  const match = (req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

module.exports = async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== readCookie(req, "github_oauth_state")) return res.status(400).send("Invalid GitHub sign-in request.");
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return res.status(500).send("GitHub OAuth is not configured.");

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) return res.status(401).send("GitHub did not grant access.");
  setSessionCookie(res, tokenData.access_token);
  res.writeHead(302, { Location: "/" });
  res.end();
};
