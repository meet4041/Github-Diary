# GitHub Diary

A responsive GitHub repository portfolio built with plain HTML, CSS, and JavaScript.

## Run locally

Run the project through a local static server such as Vercel:

```bash
vercel dev
```

Then open `http://localhost:3000` and enter a GitHub username to load public repositories.

To include private repositories for a personal dashboard, optionally enter a GitHub fine-grained personal access token with read-only repository access. The token is held in memory only for the current page session and is not written to local storage, files, or a server. Never publish a token in source code.

Click the info button on any repository card to open its full details page.

No API key is required for public repositories. GitHub's unauthenticated API has a rate limit, so a future production version could add a small server-side cache if needed.
