const { getAccessToken } = require("./_session");

module.exports = async (req, res) => {
  const token = getAccessToken(req);
  if (!token) return res.status(401).json({ authenticated: false });
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const profileResponse = await fetch("https://api.github.com/user", { headers });
    if (!profileResponse.ok) return res.status(401).json({ authenticated: false });
    const profile = await profileResponse.json();
    const repositories = [];
    let nextUrl = "https://api.github.com/user/repos?per_page=100&sort=updated&visibility=all&type=all&affiliation=owner,collaborator,organization_member";
    while (nextUrl) {
      const response = await fetch(nextUrl, { headers });
      if (!response.ok) throw new Error("GitHub repositories request failed");
      repositories.push(...await response.json());
      const link = response.headers.get("link") || "";
      const next = link.split(",").find((item) => item.includes('rel="next"'));
      nextUrl = next ? next.match(/<([^>]+)>/)?.[1] || null : null;
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ authenticated: true, profile, repositories });
  } catch {
    return res.status(502).json({ error: "Unable to load GitHub data." });
  }
};
