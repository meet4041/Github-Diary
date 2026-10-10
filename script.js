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
const profileCard = document.querySelector("#profile-card");
const featuredSection = document.querySelector("#featured-section");
const featuredGrid = document.querySelector("#featured-grid");
const analyticsSection = document.querySelector("#analytics-section");
const languageChart = document.querySelector("#language-chart");
const activitySection = document.querySelector("#activity-section");
const activityChart = document.querySelector("#activity-chart");
const activityYearSelect = document.querySelector("#activity-year");
const activityTooltip = document.createElement("div");
activityTooltip.className = "activity-tooltip";
activityTooltip.setAttribute("role", "tooltip");
document.body.append(activityTooltip);
const viewToggle = document.querySelector("#view-toggle");
const exportButton = document.querySelector("#export-button");
const compareButton = document.querySelector("#compare-button");
const dashboard = document.querySelector("#dashboard");
const repoDetail = document.querySelector("#repo-detail");
const themeToggle = document.querySelector("#theme-toggle");

let repositories = [];
let selectedLanguage = "All";
let listView = false;
let favorites = new Set(JSON.parse(localStorage.getItem("github-diary-favorites") || "[]"));
let compareSelection = new Set();
const activityCountCache = new Map();
let activityUsername = "";
let activityTopEvents = [];

document.querySelector("#year").textContent = new Date().getFullYear();
applyTheme();
themeToggle.addEventListener("click", toggleTheme);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, "");
  if (username) loadProfile(username);
});

searchInput.addEventListener("input", renderRepositories);
sortSelect.addEventListener("change", renderRepositories);
viewToggle.addEventListener("click", () => { listView = !listView; repoGrid.classList.toggle("list-view", listView); viewToggle.textContent = listView ? "▦" : "☷"; viewToggle.setAttribute("aria-label", listView ? "Switch to grid view" : "Switch to list view"); });
exportButton.addEventListener("click", exportRepositories);
compareButton.addEventListener("click", compareRepositories);
activityYearSelect.addEventListener("change", async () => {
  if (!activityUsername) return;
  activityYearSelect.disabled = true;
  const year = Number(activityYearSelect.value);
  const counts = await fetchCommitCounts(activityUsername, year);
  renderActivityYear(year, counts, activityTopEvents);
  activityYearSelect.disabled = false;
});
repoGrid.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    event.stopPropagation();
    toggleFavorite(favoriteButton.dataset.favoriteId);
    return;
  }
  const compareControl = event.target.closest("[data-compare-id]");
  if (compareControl) {
    event.stopPropagation();
    toggleCompare(compareControl.dataset.compareId);
    return;
  }
  const infoButton = event.target.closest("[data-repo-id]");
  if (!infoButton) return;
  const repo = repositories.find((item) => String(item.id) === infoButton.dataset.repoId);
  if (repo) openRepositoryDetails(repo);
});

activityChart.addEventListener("mouseover", (event) => {
  const cell = event.target.closest(".activity-cell");
  if (!cell) return;
  activityTooltip.textContent = cell.dataset.tooltip || "";
  activityTooltip.classList.add("visible");
  positionActivityTooltip(cell);
});
activityChart.addEventListener("mousemove", (event) => {
  if (activityTooltip.classList.contains("visible")) positionActivityTooltip(event);
});
activityChart.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget || !event.relatedTarget.closest?.(".activity-cell")) activityTooltip.classList.remove("visible");
});

function positionActivityTooltip(target) {
  const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: target.clientX, top: target.clientY, width: 0 };
  const left = rect.left + rect.width / 2;
  const top = rect.top - 10;
  activityTooltip.style.left = `${left}px`;
  activityTooltip.style.top = `${top}px`;
}

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
    if (!token) localStorage.setItem(`github-diary-cache:${profile.login}`, JSON.stringify({ profile, repositories, savedAt: Date.now() }));
    renderProfileCard(profile);
    renderFeaturedRepositories();
    renderLanguageChart();
    scheduleActivityChart(profile.login);
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

function renderFeaturedRepositories() {
  const featured = repositories.filter((repo) => !repo.fork && !repo.archived).sort((a, b) => {
    const scoreA = (a.stargazers_count || 0) * 10 + new Date(a.updated_at).getTime() / 1000000000;
    const scoreB = (b.stargazers_count || 0) * 10 + new Date(b.updated_at).getTime() / 1000000000;
    return scoreB - scoreA;
  }).slice(0, 3);
  if (!featured.length) return;
  featuredGrid.innerHTML = featured.map((repo, index) => `<article class="featured-card"><div class="featured-number">0${index + 1}</div><div class="featured-card-body"><div class="featured-card-top"><span class="featured-language">${repo.language ? escapeHtml(repo.language) : "Project"}</span><span>★ ${repo.stargazers_count || 0}</span></div><h3>${escapeHtml(repo.name)}</h3><p>${escapeHtml(repo.description || "A project from the collection.")}</p><a href="${repo.html_url}" target="_blank" rel="noreferrer">Explore project ↗</a></div></article>`).join("");
  featuredSection.classList.remove("hidden");
}

function renderLanguageChart() {
  const counts = repositories.reduce((result, repo) => { if (repo.language) result[repo.language] = (result[repo.language] || 0) + 1; return result; }, {});
  const languages = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = languages[0]?.[1] || 1;
  if (!languages.length) return;
  languageChart.innerHTML = languages.map(([language, count]) => `<div class="language-row"><div class="language-row-label"><span>${escapeHtml(language)}</span><strong>${count}</strong></div><div class="language-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></div></div>`).join("");
  analyticsSection.classList.remove("hidden");
}

async function loadActivityChart(username) {
  try {
    activityUsername = username;
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error();
    const events = await response.json();
    const eventCounts = events.reduce((result, event) => { result[event.type] = (result[event.type] || 0) + 1; return result; }, {});
    const topEvents = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    activityTopEvents = topEvents;
    const currentYear = new Date().getFullYear();
    activityYearSelect.innerHTML = Array.from({ length: 5 }, (_, index) => { const year = currentYear - index; return `<option value="${year}">${year}</option>`; }).join("");
    const counts = await fetchCommitCounts(username, currentYear);
    renderActivityYear(currentYear, counts, topEvents);
    activitySection.classList.remove("hidden");
  } catch {
    activitySection.classList.add("hidden");
  }
}

function scheduleActivityChart(username) {
  const run = () => loadActivityChart(username);
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1200 });
  else window.setTimeout(run, 120);
}

async function fetchCommitCounts(username, year) {
  const cacheKey = `${username}:${year}`;
  if (activityCountCache.has(cacheKey)) return activityCountCache.get(cacheKey);
  const saved = localStorage.getItem(`github-diary-activity:${cacheKey}`);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Date.now() - parsed.savedAt < 10 * 60 * 1000) {
        activityCountCache.set(cacheKey, parsed.counts);
        return parsed.counts;
      }
    } catch {
      localStorage.removeItem(`github-diary-activity:${cacheKey}`);
    }
  }
  const counts = {};
  try {
    for (let page = 1; page <= 10; page += 1) {
      const query = encodeURIComponent(`author:${username} committer-date:${year}-01-01..${year}-12-31`);
      const response = await fetch(`https://api.github.com/search/commits?q=${query}&per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      data.items.forEach((commit) => { const date = (commit.commit?.author?.date || commit.commit?.committer?.date || "").slice(0, 10); if (date) counts[date] = (counts[date] || 0) + 1; });
      if (data.items.length < 100) break;
    }
  } catch {
    // Keep the calendar usable when GitHub's search rate limit is reached.
  }
  activityCountCache.set(cacheKey, counts);
  localStorage.setItem(`github-diary-activity:${cacheKey}`, JSON.stringify({ savedAt: Date.now(), counts }));
  return counts;
}

function renderActivityYear(year, counts, topEvents) {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) days.push(dateKey(date));
  const max = Math.max(1, ...days.map((day) => counts[day] || 0));
  const total = days.reduce((sum, day) => sum + (counts[day] || 0), 0);
  activityChart.innerHTML = days.map((day) => { const isInYear = day.startsWith(`${year}-`); if (!isInYear) return '<span class="activity-cell outside-year" aria-hidden="true"></span>'; const count = counts[day] || 0; const level = count ? Math.min(4, Math.ceil((count / max) * 4)) : 0; const readableDate = formatContributionDate(day); const tooltip = `${count} commit${count === 1 ? "" : "s"} on ${readableDate}`; return `<span class="activity-cell level-${level}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></span>`; }).join("");
  document.querySelector("#activity-summary").textContent = `${total.toLocaleString()} public commits in ${year}`;
  document.querySelector("#activity-months").innerHTML = Array.from({ length: 12 }, (_, index) => { const monthStart = new Date(year, index, 1); const column = Math.floor((monthStart - start) / (7 * 24 * 60 * 60 * 1000)) + 1; return `<span style="grid-column: ${column}">${new Intl.DateTimeFormat(undefined, { month: "short" }).format(monthStart)}</span>`; }).join("");
  const overviewEvents = topEvents.map(([type, count]) => `<span><b>${count}</b> ${escapeHtml(type.replace("Event", "").replace(/([A-Z])/g, " $1").trim())}</span>`).join("");
  document.querySelector("#activity-overview").innerHTML = `<strong>Activity overview</strong><div><span><b>${total}</b> commits</span>${overviewEvents || ""}</div>`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatContributionDate(value) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${new Intl.DateTimeFormat(undefined, { month: "short" }).format(date)}, ${date.getFullYear()}`;
}

function renderProfileCard(profile) {
  const totalStars = repositories.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const website = profile.blog ? `<a href="${normaliseUrl(profile.blog)}" target="_blank" rel="noreferrer">${escapeHtml(profile.blog.replace(/^https?:\/\//, ""))} ↗</a>` : "";
  const location = profile.location ? `<span>⌖ ${escapeHtml(profile.location)}</span>` : "";
  profileCard.innerHTML = `<div class="profile-identity"><img src="${profile.avatar_url}" alt="${escapeHtml(profile.login)} avatar" width="82" height="82" loading="lazy" decoding="async" /><div><p class="section-label">GitHub profile</p><h2>${escapeHtml(profile.name || profile.login)}</h2><a class="profile-handle" href="${profile.html_url}" target="_blank" rel="noreferrer">@${escapeHtml(profile.login)} ↗</a><p class="profile-bio">${profile.bio ? escapeHtml(profile.bio) : "Building, experimenting, and shipping ideas."}</p><div class="profile-location">${location}${website}</div></div></div><div class="profile-metrics"><div><strong>${profile.followers ?? 0}</strong><span>Followers</span></div><div><strong>${profile.following ?? 0}</strong><span>Following</span></div><div><strong>${repositories.length}</strong><span>Repositories</span></div><div><strong>${totalStars}</strong><span>Total stars</span></div></div>`;
  profileCard.classList.remove("hidden");
}

function normaliseUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function applyTheme() {
  const dark = localStorage.getItem("github-diary-theme") === "dark";
  document.body.classList.toggle("dark-mode", dark);
  themeToggle.textContent = dark ? "☀" : "☾";
}

function toggleTheme() {
  const dark = !document.body.classList.contains("dark-mode");
  localStorage.setItem("github-diary-theme", dark ? "dark" : "light");
  applyTheme();
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
  const isFavorite = favorites.has(String(repo.id));
  const isCompared = compareSelection.has(String(repo.id));
  return `<article class="repo-card"><div class="repo-card-head"><h3><a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)} ↗</a></h3><div class="repo-card-actions"><button class="favorite-button ${isFavorite ? "active" : ""}" type="button" data-favorite-id="${repo.id}" aria-label="${isFavorite ? "Remove" : "Add"} ${escapeHtml(repo.name)} ${isFavorite ? "from" : "to"} favorites">★</button><button class="compare-select ${isCompared ? "active" : ""}" type="button" data-compare-id="${repo.id}" aria-label="${isCompared ? "Remove" : "Add"} ${escapeHtml(repo.name)} ${isCompared ? "from" : "to"} comparison">Compare</button><button class="info-button" type="button" data-repo-id="${repo.id}" aria-label="View details for ${escapeHtml(repo.name)}">i</button></div></div><p class="repo-description">${description}</p><div class="card-bottom">${language}<span class="stats">★ ${repo.stargazers_count} · ⑂ ${repo.forks_count}${visibility}</span></div></article>`;
}

function toggleFavorite(repositoryId) {
  const id = String(repositoryId);
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  localStorage.setItem("github-diary-favorites", JSON.stringify([...favorites]));
  renderRepositories();
}

function exportRepositories() {
  const blob = new Blob([JSON.stringify(repositories, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "github-diary-repositories.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function toggleCompare(repositoryId) {
  const id = String(repositoryId);
  if (compareSelection.has(id)) compareSelection.delete(id);
  else if (compareSelection.size < 2) compareSelection.add(id);
  renderRepositories();
  compareButton.textContent = `Compare ${compareSelection.size}`;
  compareButton.classList.toggle("hidden", compareSelection.size !== 2);
}

function compareRepositories() {
  const selected = repositories.filter((repo) => compareSelection.has(String(repo.id)));
  if (selected.length !== 2) return;
  repoDetail.innerHTML = `<button class="back-button" type="button" id="close-comparison">← Back to repositories</button><div class="detail-header"><div><p class="section-label">Comparison</p><h2>${escapeHtml(selected[0].name)} vs ${escapeHtml(selected[1].name)}</h2></div></div><div class="comparison-grid">${selected.map((repo) => `<div class="detail-block"><h3>${escapeHtml(repo.name)}</h3><span>Language</span><strong>${escapeHtml(repo.language || "—")}</strong><span>Stars</span><strong>${repo.stargazers_count || 0}</strong><span>Forks</span><strong>${repo.forks_count || 0}</strong><span>Open issues</span><strong>${repo.open_issues_count || 0}</strong><span>Size</span><strong>${repo.size ? `${repo.size.toLocaleString()} KB` : "—"}</strong></div>`).join("")}</div>`;
  dashboard.classList.add("hidden");
  repoDetail.classList.remove("hidden");
  document.querySelector("#close-comparison").addEventListener("click", () => { repoDetail.classList.add("hidden"); dashboard.classList.remove("hidden"); });
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
