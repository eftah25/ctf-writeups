import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { search_ctftime_writeups, fetch_writeup, get_writeup_template, list_categories } from "./tools.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;
  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;
  const latency = formatLatency(latencyMs);
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`);
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("✓")} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);
  let errorMsg: string;
  if (error instanceof Error) errorMsg = error.message;
  else if (typeof error === "object" && error !== null) {
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || "unknown"}`;
  } else errorMsg = String(error);
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`);
}

// ============================================================================
// MCP Server Setup
// ============================================================================

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "CTF Writeup Toolkit",
    version: "1.2.0",
  });

  server.registerTool(
    "search_ctftime_writeups",
    {
      title: "Search CTFtime Writeups",
      description: "Search public CTFtime writeups by keyword, challenge name, technique, or event. Returns relevant writeup links with available metadata for research and learning.",
      inputSchema: {
        query: z.string().describe("Search query (challenge name, keyword, technique, or CTF)"),
        limit: z.number().int().min(1).max(25).optional().describe("Max results to return (1-25, default 10)"),
      },
    },
    async ({ query, limit }) => {
      const output = await search_ctftime_writeups(query, limit ?? 10);
      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  server.registerTool(
    "fetch_writeup",
    {
      title: "Fetch Writeup Content",
      description: "Retrieve a writeup or article from a URL and extract cleaned, readable text (HTML removed). Useful for review, analysis, and summarization.",
      inputSchema: {
        url: z.string().url().describe("Absolute http(s) URL of the writeup to fetch"),
        max_chars: z.number().int().min(1000).max(100000).optional().describe("Max characters of extracted text (default 20000)"),
      },
    },
    async ({ url, max_chars }) => {
      const output = await fetch_writeup(url, max_chars ?? 20000);
      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  server.registerTool(
    "get_writeup_template",
    {
      title: "Generate Writeup Template",
      description: "Generate a structured Markdown template for documenting a CTF challenge solution by category (web, pwn, crypto, rev, forensics, osint, misc).",
      inputSchema: {
        category: z.string().optional().describe("Challenge category: web, pwn, crypto, rev, forensics, osint, misc"),
        challenge_name: z.string().optional().describe("Challenge name"),
        ctf_name: z.string().optional().describe("CTF/event name"),
      },
    },
    async ({ category, challenge_name, ctf_name }) => {
      const output = get_writeup_template(category ?? "misc", challenge_name ?? "Challenge Name", ctf_name ?? "CTF Name");
      return { content: [{ type: "text", text: output.markdown }], structuredContent: output };
    }
  );

  server.registerTool(
    "list_ctf_categories",
    {
      title: "List CTF Categories",
      description: "List common CTF challenge categories with concise descriptions and typical tooling.",
      inputSchema: {},
    },
    async () => {
      const output = list_categories();
      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  return server;
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", name: "CTF Writeup Toolkit", version: "1.2.0" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;
  const method = body?.method || "unknown";
  const params = body?.params;

  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    logRequest(`tools/call ${chalk.bold(toolName)}`, params?.arguments);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;
      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };
        if (rpcResponse?.error) logError(method, rpcResponse.error, latency);
        else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          logResponse(method, content?.[0]?.text, latency);
        } else logResponse(method, null, latency);
      } catch { logResponse(method, null, latency); }
    }
    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => { transport.close(); });

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("CTF Writeup Toolkit MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);
  if (isDev) { console.log(); console.log(chalk.gray("─".repeat(50))); console.log(); }
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => { process.exit(0); });
});
