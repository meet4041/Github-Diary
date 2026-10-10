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
const signOutButton = document.querySelector("#sign-out");

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
signOutButton.addEventListener("click", () => { window.location.href = "/api/auth/logout"; });

loadAuthenticatedSession();

async function loadAuthenticatedSession() {
  try {
    const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const session = await response.json();
    repositories = session.repositories;
    usernameInput.value = session.profile.login;
    profileTitle.textContent = `${session.profile.login}'s repositories`;
    profileSummary.innerHTML = `<strong>${repositories.length}</strong> repos loaded · <a href="${session.profile.html_url}" target="_blank" rel="noreferrer">View profile ↗</a>`;
    signOutButton.classList.remove("hidden");
    toolbar.classList.remove("hidden");
    buildFilters();
    renderRepositories();
  } catch {
    // The public username form remains available when OAuth is not configured.
  }
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
  return `<article class="repo-card"><h3><a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)} ↗</a></h3><p class="repo-description">${description}</p><div class="card-bottom">${language}<span class="stats">★ ${repo.stargazers_count} · ⑂ ${repo.forks_count}${visibility}</span></div></article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const initialUser = new URLSearchParams(window.location.search).get("user");
if (initialUser) {
  usernameInput.value = initialUser;
  loadProfile(initialUser);
}
