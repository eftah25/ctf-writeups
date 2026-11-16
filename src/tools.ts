/**
 * Pure tool functions — business logic only, no MCP dependency.
 * CTF writeup discovery, retrieval, and structuring helpers.
 */

export interface WriteupSearchItem {
  title: string;
  url: string;
  ctf?: string;
  task?: string;
  tags?: string[];
  rating?: string;
  snippet?: string;
}

export interface SearchWriteupsResult {
  [key: string]: unknown;
  query: string;
  count: number;
  results: WriteupSearchItem[];
  source: string;
  note?: string;
}

export interface FetchWriteupResult {
  [key: string]: unknown;
  url: string;
  title?: string;
  contentType?: string;
  text: string;
  truncated: boolean;
  length: number;
}

export interface TemplateResult {
  [key: string]: unknown;
  markdown: string;
  category: string;
}

export interface CategoriesResult {
  [key: string]: unknown;
  categories: Array<{ id: string; name: string; description: string; common_tools: string[] }>;
}

const UA = "ctf-writeups-mcp/1.1 (+https://ctf-writeups.mcpize.run)";
const TIMEOUT_MS = 15000;

async function fetchText(url: string): Promise<{ res: Response; body: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    });
    const body = await res.text();
    return { res, body };
  } finally {
    clearTimeout(t);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|pre|blockquote)>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function absUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export async function search_ctftime_writeups(query: string, limit = 10): Promise<SearchWriteupsResult> {
  const q = (query || "").trim();
  if (!q) throw new Error("query is required");
  const lim = Math.max(1, Math.min(25, Number(limit) || 10));
  const url = `https://ctftime.org/writeups?tags=&hidden-tags=&q=${encodeURIComponent(q)}`;
  try {
    const { res, body } = await fetchText(url);
    if (!res.ok) {
      return { query: q, count: 0, results: [], source: "ctftime", note: `CTFtime returned HTTP ${res.status}` };
    }
    const results: WriteupSearchItem[] = [];
    // CTFtime writeups table rows contain links to /writeup/<id> and event/task info
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    const rows = body.match(rowRe) || [];
    for (const row of rows) {
      const writeupMatch = row.match(/href="(\/writeup\/\d+)"/i);
      if (!writeupMatch) continue;
      const writeupUrl = absUrl("https://ctftime.org", writeupMatch[1]);
      const tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const texts = tdMatches.map(td => stripTags(td).replace(/\s+/g, " ").trim());
      // Typical columns: event, task, tags, author, rating, writeup/name
      const links = Array.from(row.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)).map(m => ({
        href: m[1], text: stripTags(m[2]).trim()
      }));
      const wuLink = links.find(l => /\/writeup\//.test(l.href));
      const eventLink = links.find(l => /\/event\//.test(l.href));
      const taskText = texts.find(t => t && !/^(original|rated)?$/i.test(t)) || "";
      const ratingMatch = row.match(/class="[^"]*rating[^"]*"[\s\S]*?>([\s\S]*?)</i) || row.match(/>\s*([0-5](?:\.\d+)?)\s*</);
      const title = wuLink?.text || taskText || `Writeup ${writeupMatch[1]}`;
      const item: WriteupSearchItem = {
        title,
        url: writeupUrl,
        ctf: eventLink?.text || undefined,
        task: taskText || undefined,
        rating: ratingMatch ? stripTags(ratingMatch[1]).trim() : undefined,
      };
      if (results.find(r => r.url === item.url)) continue;
      results.push(item);
      if (results.length >= lim) break;
    }
    // fallback: collect any writeup links if table parsing missed
    if (results.length === 0) {
      const seen = new Set<string>();
      for (const m of body.matchAll(/href="(\/writeup\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = absUrl("https://ctftime.org", m[1]);
        if (seen.has(u)) continue; seen.add(u);
        results.push({ title: stripTags(m[2]).trim() || u, url: u });
        if (results.length >= lim) break;
      }
    }
    return { query: q, count: results.length, results, source: "ctftime" };
  } catch (e: any) {
    return { query: q, count: 0, results: [], source: "ctftime", note: `Search failed: ${e?.message || String(e)}` };
  }
}

export async function fetch_writeup(url: string, max_chars = 20000): Promise<FetchWriteupResult> {
  const u = (url || "").trim();
  if (!u) throw new Error("url is required");
  let parsed: URL;
  try { parsed = new URL(u); } catch { throw new Error("url must be a valid absolute URL"); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("only http(s) URLs are supported");
  const cap = Math.max(1000, Math.min(100000, Number(max_chars) || 20000));
  const { res, body } = await fetchText(parsed.toString());
  if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  let text = "";
  let title: string | undefined;
  if (/html/i.test(ct) || /<html/i.test(body)) {
    const t = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) title = stripTags(t[1]).trim();
    // try to prefer main/article content
    const main = body.match(/<article[\s\S]*?<\/article>/i)?.[0]
      || body.match(/<main[\s\S]*?<\/main>/i)?.[0]
      || body.match(/<div[^>]+class="[^"]*(?:writeup|content|post|markdown|entry)[^"]*"[\s\S]*?<\/div>/i)?.[0]
      || body;
    text = stripTags(main);
  } else {
    text = body.replace(/\r/g, "").trim();
  }
  const truncated = text.length > cap;
  if (truncated) text = text.slice(0, cap) + "\n\n[...truncated]";
  return { url: parsed.toString(), title, contentType: ct || undefined, text, truncated, length: text.length };
}

export function get_writeup_template(category = "misc", challenge_name = "Challenge Name", ctf_name = "CTF Name"): TemplateResult {
  const cat = (category || "misc").toLowerCase();
  const byCat: Record<string, string> = {
    web: "## Vulnerability\n- Type (e.g. SQLi/XSS/SSRF/IDOR/SSTI):\n- Entry point / parameter:\n\n## Exploitation\n1. Recon & observations\n2. Payload / steps\n```http\n\n```\n3. Bypass notes\n\n## Flag extraction\n",
    pwn: "## Binary analysis\n- Protections (checksec):\n- Arch / libc:\n\n## Vulnerability\n- Bug class:\n- Primitive gained:\n\n## Exploit strategy\n1. Leak\n2. Control flow / write\n3. Shell / flag\n```python\n# exploit.py\n```\n",
    crypto: "## Challenge description\n- Given:\n- Goal:\n\n## Analysis\n- Scheme / weakness:\n- Math/observations:\n\n## Solution\n```python\n# solve.py\n```\n",
    rev: "## Analysis\n- Platform/format:\n- Key routines:\n\n## Approach\n- Static (decomp/strings):\n- Dynamic (debug/trace):\n\n## Solution / key recovery\n```text\n\n```\n",
    forensics: "## Artifacts\n- Files provided:\n- File types / hashes:\n\n## Analysis\n- Tools used:\n- Findings (metadata, streams, carved data, memory, pcap):\n\n## Extraction\n```bash\n\n```\n",
    misc: "## Observations\n- Clues:\n\n## Steps\n1. \n2. \n\n## Solution\n",
    osint: "## Target / clues\n\n## Investigation steps\n- Sources:\n- Pivot points:\n\n## Findings\n",
  };
  const extra = byCat[cat] || byCat.misc;
  const md = `# ${challenge_name} — ${ctf_name}\n\n**Category:** ${cat}  \n**Points:**   \n**Solves:**   \n\n## Summary\nOne-paragraph description of the challenge and the core idea of the solve.\n\n${extra}\n## Flag\n\`flag{...}\`\n\n## Lessons learned\n- \n`;
  return { markdown: md, category: cat };
}

export function list_categories(): CategoriesResult {
  return {
    categories: [
      { id: "web", name: "Web", description: "Web app vulnerabilities and exploitation.", common_tools: ["burpsuite", "curl", "sqlmap", "browser devtools"] },
      { id: "pwn", name: "Pwn/Binary Exploitation", description: "Memory corruption and binary exploitation.", common_tools: ["pwntools", "gdb", "ghidra", "checksec"] },
      { id: "crypto", name: "Cryptography", description: "Crypto weaknesses and math attacks.", common_tools: ["sage", "python", "RsaCtfTool", "CyberChef"] },
      { id: "rev", name: "Reverse Engineering", description: "Binary/program reversing and logic recovery.", common_tools: ["ghidra", "ida", "radare2", "gdb"] },
      { id: "forensics", name: "Forensics", description: "Disk, memory, network, and file analysis.", common_tools: ["volatility", "wireshark", "binwalk", "strings"] },
      { id: "osint", name: "OSINT", description: "Open-source intelligence gathering.", common_tools: ["search engines", "sherlock", "exiftool"] },
      { id: "misc", name: "Misc", description: "Mixed/uncategorized challenges.", common_tools: ["python", "CyberChef"] },
    ],
  };
}
