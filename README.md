# ctf-writeups

MCP server for discovering, fetching, and structuring CTF writeups.

## Tools
- **search_ctftime_writeups(query, limit?)** — Search public CTF writeups on CTFtime by keyword, challenge name, technique, or event. Returns links and metadata.
- **fetch_writeup(url, max_chars?)** — Fetch a writeup/article URL and extract readable text (HTML stripped) for study/summarization.
- **get_writeup_template(category?, challenge_name?, ctf_name?)** — Generate a structured Markdown writeup template (web, pwn, crypto, rev, forensics, osint, misc).
- **list_ctf_categories()** — List common CTF categories with descriptions and typical tools.

## Local development
```bash
npm install
npm run dev
# MCP endpoint: http://localhost:8080/mcp
# health:       http://localhost:8080/health
```

## Build & test
```bash
npm test
npm run build
npm start
```

## Deploy (MCPize)
```bash
npx mcpize login   # or set MCPIZE_TOKEN
npx mcpize deploy
```
Runtime is HTTP per `mcpize.yaml` (`node dist/index.js` on `$PORT`).

## Notes
- `search_ctftime_writeups` and `fetch_writeup` make outbound HTTP requests to public sources (CTFtime / provided URLs). Results depend on source availability and page structure.
- Respect target site terms/rate limits; fetch only URLs you are authorized to access.
