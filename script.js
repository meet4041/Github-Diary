const form = document.querySelector("#profile-form");
const usernameInput = document.querySelector("#username");
const tokenInput = document.querySelector("#token");
const errorMessage = document.querySelector("#error-message");
const repoGrid = document.querySelector("#repo-grid");
const toolbar = document.querySelector("#toolbar");
const filters = document.querySelector("#language-filters");
const searchInput = document.querySelector("#search");
const sortSelect = document.querySelector("#sort");
const profileTitle = document.querySelector("#profile-title");
const profileSummary = document.querySelector("#profile-summary");
const dashboard = document.querySelector("#dashboard");
const repoDetail = document.querySelector("#repo-detail");

let repositories = [];
let selectedLanguage = "All";

document.querySelector("#year").textContent = new Date().getFullYear();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, "");
  if (username) loadProfile(username);
});

searchInput.addEventListener("input", renderRepositories);
sortSelect.addEventListener("change", renderRepositories);
repoGrid.addEventListener("click", (event) => {
  const infoButton = event.target.closest("[data-repo-id]");
  if (!infoButton) return;
  const repo = repositories.find((item) => String(item.id) === infoButton.dataset.repoId);
  if (repo) openRepositoryDetails(repo);
});

async function loadProfile(username) {
  setLoading(true);
  errorMessage.textContent = "";
  try {
    const token = tokenInput.value.trim();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const profileUrl = token ? "https://api.github.com/user" : `https://api.github.com/users/${encodeURIComponent(username)}`;
    const reposUrl = token ? "https://api.github.com/user/repos?per_page=100&sort=updated&visibility=all&type=all&affiliation=owner,collaborator,organization_member" : `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=all`;
    const [profileResponse, fetchedRepositories] = await Promise.all([fetch(profileUrl, { headers }), fetchAllRepositories(reposUrl, headers)]);

    if (!profileResponse.ok) throw new Error(token ? "That token is invalid or does not have access." : "We couldn't find that GitHub user.");

    const profile = await profileResponse.json();
    repositories = fetchedRepositories;
    profileTitle.textContent = `${profile.login}'s repositories`;
    const privateCount = repositories.filter((repo) => repo.private).length;
    const accessLabel = token ? `<strong>${privateCount}</strong> private repos included · ` : "";
    profileSummary.innerHTML = `${accessLabel}<strong>${repositories.length}</strong> repos loaded · <a href="${profile.html_url}" target="_blank" rel="noreferrer">View profile ↗</a>`;
    toolbar.classList.remove("hidden");
    buildFilters();
    renderRepositories();
    history.replaceState({}, "", `?user=${encodeURIComponent(profile.login)}`);
  } catch (error) {
    repositories = [];
    toolbar.classList.add("hidden");
    filters.classList.add("hidden");
    repoGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}<br /><small>Check the username and try again.</small></div>`;
    errorMessage.textContent = "Unable to load repositories.";
  } finally {
    setLoading(false);
  }
}

async function fetchAllRepositories(firstUrl, headers) {
  const allRepositories = [];
  let nextUrl = firstUrl;
  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw new Error("GitHub could not return the repositories right now.");
    const page = await response.json();
    allRepositories.push(...page);
    nextUrl = getNextPageUrl(response.headers.get("link"));
  }
  return allRepositories;
}

function getNextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const nextLink = linkHeader.split(",").find((link) => link.includes('rel="next"'));
  return nextLink ? nextLink.match(/<([^>]+)>/)?.[1] || null : null;
}

function setLoading(isLoading) {
  if (isLoading) repoGrid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
}

function buildFilters() {
  const languages = ["All", ...new Set(repositories.map((repo) => repo.language).filter(Boolean))].slice(0, 8);
  filters.innerHTML = languages.map((language) => `<button class="filter ${language === "All" ? "active" : ""}" data-language="${escapeHtml(language)}">${escapeHtml(language)}</button>`).join("");
  filters.classList.remove("hidden");
  filters.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    selectedLanguage = button.dataset.language;
    filters.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderRepositories();
  }));
}

function renderRepositories() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = repositories.filter((repo) => {
    const matchesLanguage = selectedLanguage === "All" || repo.language === selectedLanguage;
    const searchable = `${repo.name} ${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();
    return matchesLanguage && searchable.includes(query);
  }).sort((a, b) => {
    if (sortSelect.value === "stars") return b.stargazers_count - a.stargazers_count;
    if (sortSelect.value === "name") return a.name.localeCompare(b.name);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  repoGrid.innerHTML = visible.length ? visible.map(repoCard).join("") : '<div class="empty-state">No repositories match your filters.</div>';
}

function repoCard(repo) {
  const description = repo.description ? escapeHtml(repo.description) : "No description added yet.";
  const language = repo.language ? `<span class="language"><i class="language-dot"></i>${escapeHtml(repo.language)}</span>` : '<span class="language">Project</span>';
  const visibility = repo.private ? " · Private" : "";
  return `<article class="repo-card"><div class="repo-card-head"><h3><a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)} ↗</a></h3><button class="info-button" type="button" data-repo-id="${repo.id}" aria-label="View details for ${escapeHtml(repo.name)}">i</button></div><p class="repo-description">${description}</p><div class="card-bottom">${language}<span class="stats">★ ${repo.stargazers_count} · ⑂ ${repo.forks_count}${visibility}</span></div></article>`;
}

function openRepositoryDetails(repo) {
  sessionStorage.setItem("github-diary-selected-repo", JSON.stringify(repo));
  window.location.href = `repo.html?repo=${encodeURIComponent(repo.full_name || repo.name)}`;
}

function showRepositoryDetails(repo) {
  const topics = repo.topics?.length ? repo.topics.map((topic) => `<span class="detail-tag">${escapeHtml(topic)}</span>`).join("") : '<span class="detail-muted">No topics added</span>';
  const license = repo.license?.spdx_id || repo.license?.name || "No license specified";
  const homepage = repo.homepage ? `<a href="${escapeHtml(repo.homepage)}" target="_blank" rel="noreferrer">Live project ↗</a>` : '<span class="detail-muted">No live URL</span>';
  const repositoryState = repo.archived ? "Archived" : repo.disabled ? "Disabled" : repo.fork ? "Fork" : "Active";
  const capabilities = [["Issues", repo.has_issues], ["Projects", repo.has_projects], ["Wiki", repo.has_wiki], ["Pages", repo.has_pages], ["Discussions", repo.has_discussions], ["Downloads", repo.has_downloads]].filter(([, enabled]) => enabled !== undefined).map(([label, enabled]) => `<span class="capability ${enabled ? "enabled" : "disabled"}">${enabled ? "✓" : "–"} ${label}</span>`).join("");
  const owner = repo.owner?.login || "—";
  const cloneCommand = repo.clone_url ? `git clone ${repo.clone_url}` : "—";
  const sshCommand = repo.ssh_url ? `git clone ${repo.ssh_url}` : "—";
  repoDetail.innerHTML = `<button class="back-button" type="button" id="back-to-repos">← Back to repositories</button><div class="detail-header"><div><p class="section-label">Repository details</p><h2>${escapeHtml(repo.name)}</h2><p class="detail-description">${repo.description ? escapeHtml(repo.description) : "No description added yet."}</p></div><a class="detail-github-link" href="${repo.html_url}" target="_blank" rel="noreferrer">Open on GitHub ↗</a></div><div class="detail-meta"><span class="visibility-badge ${repo.private ? "private" : "public"}">${repo.private ? "Private" : "Public"}</span><span class="state-badge">${repositoryState}</span><span>${repo.language ? escapeHtml(repo.language) : "No language detected"}</span><span>Updated ${formatDate(repo.updated_at)}</span></div><div class="detail-stats"><div><strong>${repo.stargazers_count ?? 0}</strong><span>Stars</span></div><div><strong>${repo.forks_count ?? 0}</strong><span>Forks</span></div><div><strong>${repo.open_issues_count ?? 0}</strong><span>Open issues</span></div><div><strong>${repo.watchers_count ?? 0}</strong><span>Watchers</span></div></div><div class="detail-section"><span class="detail-label">Repository information</span><div class="detail-grid"><div class="detail-block"><span>Full name</span><strong>${escapeHtml(repo.full_name || "—")}</strong></div><div class="detail-block"><span>Owner</span><strong>${escapeHtml(owner)}</strong></div><div class="detail-block"><span>Default branch</span><strong>${escapeHtml(repo.default_branch || "—")}</strong></div><div class="detail-block"><span>License</span><strong>${escapeHtml(license)}</strong></div><div class="detail-block"><span>Repository size</span><strong>${repo.size ? `${repo.size.toLocaleString()} KB` : "—"}</strong></div><div class="detail-block"><span>Created</span><strong>${formatDate(repo.created_at)}</strong></div><div class="detail-block"><span>Last updated</span><strong>${formatDate(repo.updated_at)}</strong></div><div class="detail-block"><span>Last pushed</span><strong>${formatDate(repo.pushed_at)}</strong></div></div></div><div class="detail-section"><span class="detail-label">Available features</span><div class="capabilities">${capabilities || '<span class="detail-muted">No feature information available</span>'}</div></div><div class="detail-section"><span class="detail-label">Topics</span><div class="detail-tags">${topics}</div></div><div class="detail-section"><span class="detail-label">Links</span><div class="detail-links"><div><span>Project</span>${homepage}</div><div><span>GitHub repository</span><a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.html_url)} ↗</a></div></div></div><div class="detail-section"><span class="detail-label">Clone repository</span><code class="clone-command">${escapeHtml(cloneCommand)}</code><code class="clone-command">${escapeHtml(sshCommand)}</code></div>`;
  dashboard.classList.add("hidden");
  repoDetail.classList.remove("hidden");
  document.querySelector("#back-to-repos").addEventListener("click", () => { repoDetail.classList.add("hidden"); dashboard.classList.remove("hidden"); });
  repoDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const initialUser = new URLSearchParams(window.location.search).get("user");
if (initialUser) {
  usernameInput.value = initialUser;
  loadProfile(initialUser);
}
