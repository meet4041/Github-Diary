const page = document.querySelector("#repository-page");
const storedRepository = sessionStorage.getItem("github-diary-selected-repo");
const themeToggle = document.querySelector("#theme-toggle");
const repositoryName = new URLSearchParams(window.location.search).get("repo");

applyTheme();
themeToggle.addEventListener("click", toggleTheme);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});

if (storedRepository && (!repositoryName || JSON.parse(storedRepository).full_name === repositoryName)) {
  renderRepository(JSON.parse(storedRepository));
} else if (repositoryName) {
  loadSharedRepository(repositoryName);
} else {
  showMissingRepository();
}

async function loadSharedRepository(fullName) {
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(fullName)}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error();
    renderRepository(await response.json());
  } catch {
    showMissingRepository("This shared page is unavailable. Private repositories must be opened from the original collection.");
  }
}

function showMissingRepository(message = "Return to your collection and choose a repository again.") {
  page.innerHTML = `<div class="empty-state"><h2>Repository not found</h2><p>${escapeHtml(message)}</p><a class="detail-github-link" href="index.html">Back to collection ↗</a></div>`;
}

function renderRepository(repo) {
  const topics = repo.topics?.length ? repo.topics.map((topic) => `<span class="detail-tag">${escapeHtml(topic)}</span>`).join("") : '<span class="detail-muted">No topics added</span>';
  const license = repo.license?.spdx_id || repo.license?.name || "No license specified";
  const homepage = repo.homepage ? `<a href="${escapeHtml(repo.homepage)}" target="_blank" rel="noreferrer">Live project ↗</a>` : '<span class="detail-muted">No live URL</span>';
  const state = repo.archived ? "Archived" : repo.disabled ? "Disabled" : repo.fork ? "Fork" : "Active";
  const capabilities = [["Issues", repo.has_issues], ["Projects", repo.has_projects], ["Wiki", repo.has_wiki], ["Pages", repo.has_pages], ["Discussions", repo.has_discussions], ["Downloads", repo.has_downloads]].filter(([, enabled]) => enabled !== undefined).map(([label, enabled]) => `<span class="capability ${enabled ? "enabled" : "disabled"}">${enabled ? "✓" : "–"} ${label}</span>`).join("");
  page.innerHTML = `<a class="back-button" href="index.html">← Back to repositories</a><div class="detail-header"><div><p class="section-label">Repository details</p><h1>${escapeHtml(repo.name)}</h1><p class="detail-description">${repo.description ? escapeHtml(repo.description) : "No description added yet."}</p></div><a class="detail-github-link" href="${repo.html_url}" target="_blank" rel="noreferrer">Open on GitHub ↗</a></div><div class="detail-meta"><span class="visibility-badge ${repo.private ? "private" : "public"}">${repo.private ? "Private" : "Public"}</span><span class="state-badge">${state}</span><span>${repo.language ? escapeHtml(repo.language) : "No language detected"}</span><span>Updated ${formatDate(repo.updated_at)}</span></div><div class="detail-stats"><div><strong>${repo.stargazers_count ?? 0}</strong><span>Stars</span></div><div><strong>${repo.forks_count ?? 0}</strong><span>Forks</span></div><div><strong>${repo.open_issues_count ?? 0}</strong><span>Open issues</span></div><div><strong>${repo.watchers_count ?? 0}</strong><span>Watchers</span></div></div><div class="detail-section"><span class="detail-label">Repository information</span><div class="detail-grid"><div class="detail-block"><span>Full name</span><strong>${escapeHtml(repo.full_name || "—")}</strong></div><div class="detail-block"><span>Owner</span><strong>${escapeHtml(repo.owner?.login || "—")}</strong></div><div class="detail-block"><span>Default branch</span><strong>${escapeHtml(repo.default_branch || "—")}</strong></div><div class="detail-block"><span>License</span><strong>${escapeHtml(license)}</strong></div><div class="detail-block"><span>Repository size</span><strong>${repo.size ? `${repo.size.toLocaleString()} KB` : "—"}</strong></div><div class="detail-block"><span>Created</span><strong>${formatDate(repo.created_at)}</strong></div><div class="detail-block"><span>Last updated</span><strong>${formatDate(repo.updated_at)}</strong></div><div class="detail-block"><span>Last pushed</span><strong>${formatDate(repo.pushed_at)}</strong></div></div></div><div class="detail-section"><span class="detail-label">Available features</span><div class="capabilities">${capabilities || '<span class="detail-muted">No feature information available</span>'}</div></div><div class="detail-section"><span class="detail-label">Topics</span><div class="detail-tags">${topics}</div></div><div class="detail-section"><span class="detail-label">Links</span><div class="detail-links"><div><span>Project</span>${homepage}</div><div><span>GitHub repository</span><a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.html_url)} ↗</a></div></div></div><div class="detail-section"><span class="detail-label">Clone repository</span><code class="clone-command">${escapeHtml(repo.clone_url ? `git clone ${repo.clone_url}` : "—")}</code><code class="clone-command">${escapeHtml(repo.ssh_url ? `git clone ${repo.ssh_url}` : "—")}</code></div><div id="readme-preview" class="detail-section"><span class="detail-label">README preview</span><div class="readme-loading">Loading README…</div></div>`;
  document.title = `${repo.name} · GitHub Diary`;
  const detailHeader = document.querySelector(".detail-header");
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const copyButton = document.createElement("button");
  copyButton.id = "copy-link";
  copyButton.className = "copy-link";
  copyButton.type = "button";
  copyButton.textContent = "Copy page link";
  copyButton.addEventListener("click", copyPageLink);
  const printButton = document.createElement("button");
  printButton.className = "copy-link";
  printButton.type = "button";
  printButton.textContent = "Save as PDF";
  printButton.addEventListener("click", () => window.print());
  const githubLink = detailHeader.querySelector(".detail-github-link");
  actions.append(copyButton, printButton, githubLink);
  detailHeader.appendChild(actions);
  addPersonalWorkspace(repo);
  loadReadme(repo);
  loadActivity(repo);
}

function addPersonalWorkspace(repo) {
  const key = `github-diary-notes:${repo.full_name || repo.id}`;
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  const section = document.createElement("section");
  section.className = "detail-section personal-workspace";
  section.innerHTML = `<span class="detail-label">Your workspace</span><div class="workspace-controls"><label>Label<select id="repo-label"><option value="">No label</option><option>Featured</option><option>Learning</option><option>Client</option><option>In progress</option><option>Archived</option></select></label><label class="notes-field">Private notes<textarea id="repo-notes" rows="3" placeholder="Add a note about this project..."></textarea></label></div><button id="save-workspace" type="button">Save notes</button><span id="workspace-status" class="detail-muted"></span>`;
  section.querySelector("#repo-label").value = saved.label || "";
  section.querySelector("#repo-notes").value = saved.notes || "";
  section.querySelector("#save-workspace").addEventListener("click", () => {
    localStorage.setItem(key, JSON.stringify({ label: section.querySelector("#repo-label").value, notes: section.querySelector("#repo-notes").value }));
    section.querySelector("#workspace-status").textContent = "Saved locally";
    window.setTimeout(() => { section.querySelector("#workspace-status").textContent = ""; }, 1600);
  });
  page.querySelector(".detail-meta").after(section);
}

async function copyPageLink(event) {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(window.location.href);
    button.textContent = "Link copied";
  } catch {
    button.textContent = "Copy unavailable";
  }
  window.setTimeout(() => { button.textContent = "Copy page link"; }, 1800);
}

async function loadReadme(repo) {
  const target = document.querySelector("#readme-preview");
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.full_name)}/readme`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, "")), (character) => character.charCodeAt(0));
    const markdown = new TextDecoder().decode(bytes).slice(0, 8000);
    target.innerHTML = `<span class="detail-label">README preview</span><pre class="readme-preview">${escapeHtml(markdown)}</pre><a class="detail-github-link" href="${data.html_url || repo.html_url}" target="_blank" rel="noreferrer">Read full README on GitHub ↗</a>`;
  } catch {
    target.innerHTML = '<span class="detail-label">README preview</span><p class="detail-muted">README preview is unavailable for this repository. Open it on GitHub to read the full documentation.</p>';
  }
}

async function loadActivity(repo) {
  const section = document.createElement("section");
  section.className = "detail-section activity-section";
  section.innerHTML = '<span class="detail-label">Recent activity</span><p class="detail-muted">Loading recent commits…</p>';
  page.append(section);
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.full_name)}/commits?per_page=5`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error();
    const commits = await response.json();
    section.innerHTML = `<span class="detail-label">Recent activity</span><div class="activity-list">${commits.map((commit) => `<a class="activity-item" href="${commit.html_url}" target="_blank" rel="noreferrer"><strong>${escapeHtml(commit.commit.message.split("\n")[0])}</strong><span>${escapeHtml(commit.commit.author?.name || commit.author?.login || "Unknown author")} · ${formatDate(commit.commit.author?.date)}</span></a>`).join("")}</div>`;
  } catch {
    section.innerHTML = '<span class="detail-label">Recent activity</span><p class="detail-muted">Recent activity is unavailable for this repository.</p>';
  }
}

function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function applyTheme() { const dark = localStorage.getItem("github-diary-theme") === "dark"; document.body.classList.toggle("dark-mode", dark); themeToggle.textContent = dark ? "☀" : "☾"; }
function toggleTheme() { const dark = !document.body.classList.contains("dark-mode"); localStorage.setItem("github-diary-theme", dark ? "dark" : "light"); applyTheme(); }
