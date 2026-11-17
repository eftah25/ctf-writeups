# CTF Writeup Toolkit

CTF Writeup Toolkit is an MCP server that helps security researchers and CTF players discover, retrieve, and structure capture-the-flag writeups. It provides tools to search public CTFtime writeups, extract readable content from writeup pages, and generate category-specific Markdown templates for documenting solutions.

## Features
- **Writeup discovery:** Search public CTFtime writeups by challenge name, keyword, technique, or event.
- **Content extraction:** Fetch a writeup URL and return cleaned, readable text for analysis or summarization.
- **Structured documentation:** Generate Markdown templates tailored to common CTF categories.
- **Category guidance:** List common challenge categories with descriptions and typical tooling.

## MCP Tools
| Tool | Description |
|---|---|
| `search_ctftime_writeups` | Search public CTFtime writeups by query (`query`, optional `limit` 1–25). Returns matching writeup links and metadata. |
| `fetch_writeup` | Fetch and extract readable text from a writeup/article URL (`url`, optional `max_chars` 1000–100000). |
| `get_writeup_template` | Generate a structured Markdown writeup template (`category`, `challenge_name`, `ctf_name`). Categories: `web`, `pwn`, `crypto`, `rev`, `forensics`, `osint`, `misc`. |
| `list_ctf_categories` | List common CTF categories with descriptions and typical tools. |

## Local Development
```bash
npm install
npm run dev
# MCP endpoint: http://localhost:8080/mcp
# Health check:  http://localhost:8080/health
```

## Build & Test
```bash
npm test
npm run build
npm start
```

## Deployment (MCPize)
```bash
npx mcpize login   # or set MCPIZE_TOKEN
npx mcpize deploy
```
Runtime is configured for HTTP in `mcpize.yaml` (`node dist/index.js` on `$PORT`).

## Notes
- `search_ctftime_writeups` and `fetch_writeup` perform outbound requests to public sources (CTFtime and user-provided URLs). Results depend on source availability and page structure.
- Use responsibly: respect target site terms/rate limits and access only content you are authorized to retrieve.
