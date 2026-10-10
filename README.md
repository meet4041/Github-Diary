# GitHub Diary

A responsive GitHub repository portfolio built with plain HTML, CSS, and JavaScript.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server. Enter a GitHub username to load public repositories through the GitHub API.

To include private repositories for a personal dashboard, optionally enter a GitHub fine-grained personal access token with read-only repository metadata/content access. The token is held in memory only for the current page session and is not written to local storage, files, or a server. Never publish a token in source code.

## GitHub sign-in

The project includes a secure GitHub OAuth flow under `api/auth/`. Deploy it to Vercel (or another Node serverless host), then create a GitHub OAuth App with:

- Homepage URL: your deployed `APP_URL`
- Authorization callback URL: `your deployed APP_URL/api/auth/callback`

Add the values from `.env.example` to the deployment environment. Use a long random `SESSION_SECRET`. The OAuth flow requests `read:user` and `repo` access, keeps the GitHub access token in an encrypted HTTP-only cookie, and loads repositories through the server rather than exposing the token to browser JavaScript.

No API key is required for public repositories. GitHub's unauthenticated API has a rate limit, so a future production version could add a small server-side cache or authentication if needed.
