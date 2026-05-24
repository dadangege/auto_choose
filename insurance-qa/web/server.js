#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildPrompt, routePreview } = require("../orchestrator");

const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const DEFAULT_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
const DEFAULT_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1";

function stripThinking(content) {
  return String(content || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sseStart(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relative);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".js" ? "application/javascript; charset=utf-8" :
      "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function parseChatBody(body) {
  const apiKey = String(body.apiKey || process.env.MINIMAX_API_KEY || "").trim();
  const baseUrl = String(body.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  const model = String(body.model || DEFAULT_MODEL).trim();
  const query = String(body.query || "").trim();
  const promptMode = body.promptMode === "full" ? "full" : "wiki";
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
  return { apiKey, baseUrl, model, query, promptMode, temperature };
}

function validateChatInput(input) {
  if (!input.apiKey) return "请填写 MiniMax API key。";
  if (!input.query) return "请输入测试问题。";
  if (!/^https:\/\//.test(input.baseUrl)) return "Base URL 必须是 https 地址。";
  return null;
}

function chatPayload(input, promptBundle, stream) {
  return {
    model: input.model,
    messages: [
      { role: "system", content: promptBundle.prompt },
      { role: "user", content: input.query },
    ],
    temperature: input.temperature,
    max_completion_tokens: 2048,
    stream,
  };
}

async function handleChat(req, res) {
  try {
    const input = parseChatBody(await readJsonBody(req));
    const validationError = validateChatInput(input);
    if (validationError) {
      jsonResponse(res, 400, { error: validationError });
      return;
    }

    const promptBundle = buildPrompt(input.query, input.promptMode);
    const startedAt = Date.now();
    const upstream = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatPayload(input, promptBundle, false)),
    });
    const responseText = await upstream.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    if (!upstream.ok) {
      jsonResponse(res, upstream.status, {
        error: "MiniMax 请求失败。",
        status: upstream.status,
        detail: responseJson,
      });
      return;
    }

    jsonResponse(res, 200, {
      content: stripThinking(responseJson?.choices?.[0]?.message?.content || ""),
      usage: responseJson.usage || null,
      model: responseJson.model || input.model,
      latencyMs: Date.now() - startedAt,
      routePreview: promptBundle.orchestration.route,
      orchestration: promptBundle.orchestration,
      promptProfile: promptBundle.profile,
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Server error." });
  }
}

async function handleChatStream(req, res) {
  const requestStartedAt = Date.now();
  let finalContent = "";
  let upstreamStartedAt = null;
  let firstDeltaAt = null;
  let modelName = null;
  let usage = null;

  try {
    const input = parseChatBody(await readJsonBody(req));
    sseStart(res);

    const validationError = validateChatInput(input);
    if (validationError) {
      sseSend(res, "error", { error: validationError });
      res.end();
      return;
    }

    const promptBundle = buildPrompt(input.query, input.promptMode);
    sseSend(res, "meta", {
      routePreview: promptBundle.orchestration.route,
      orchestration: promptBundle.orchestration,
      promptProfile: promptBundle.profile,
      timings: {
        requestStartedAt,
        promptBuiltMs: Date.now() - requestStartedAt,
      },
    });

    upstreamStartedAt = Date.now();
    sseSend(res, "timing", {
      name: "upstream_request_started",
      ms: upstreamStartedAt - requestStartedAt,
    });

    const upstream = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatPayload(input, promptBundle, true)),
    });

    sseSend(res, "timing", {
      name: "upstream_headers",
      ms: Date.now() - requestStartedAt,
      upstreamStatus: upstream.status,
    });

    if (!upstream.ok) {
      const responseText = await upstream.text();
      let detail;
      try {
        detail = JSON.parse(responseText);
      } catch {
        detail = responseText;
      }
      sseSend(res, "error", {
        error: "MiniMax 请求失败。",
        status: upstream.status,
        detail,
      });
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneSeen = false;

    function handleSseBlock(block) {
      const dataLines = block
        .split(/\r?\n/)
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trimStart());
      if (!dataLines.length) return;

      const dataText = dataLines.join("\n").trim();
      if (!dataText) return;
      if (dataText === "[DONE]") {
        doneSeen = true;
        return;
      }

      let chunk;
      try {
        chunk = JSON.parse(dataText);
      } catch {
        sseSend(res, "debug", { raw: dataText });
        return;
      }

      if (chunk.model) modelName = chunk.model;
      if (chunk.usage) usage = chunk.usage;

      const deltaText = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? "";
      if (!deltaText) return;

      if (!firstDeltaAt) {
        firstDeltaAt = Date.now();
        sseSend(res, "timing", {
          name: "first_delta",
          ms: firstDeltaAt - requestStartedAt,
        });
      }
      finalContent += deltaText;
      sseSend(res, "delta", { text: deltaText });
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) handleSseBlock(block);
    }

    buffer += decoder.decode();
    if (buffer.trim()) handleSseBlock(buffer);

    const finishedAt = Date.now();
    sseSend(res, "done", {
      content: stripThinking(finalContent),
      model: modelName || input.model,
      usage,
      promptProfile: promptBundle.profile,
      routePreview: promptBundle.orchestration.route,
      orchestration: promptBundle.orchestration,
      timings: {
        totalMs: finishedAt - requestStartedAt,
        upstreamMs: upstreamStartedAt ? finishedAt - upstreamStartedAt : null,
        firstDeltaMs: firstDeltaAt ? firstDeltaAt - requestStartedAt : null,
        promptChars: promptBundle.profile.charCount,
        outputChars: finalContent.length,
        doneSeen,
      },
    });
    res.end();
  } catch (error) {
    if (!res.headersSent) sseStart(res);
    sseSend(res, "error", { error: error.message || "Server error." });
    res.end();
  }
}

async function handleRoute(req, res) {
  try {
    const body = await readJsonBody(req);
    jsonResponse(res, 200, routePreview(body.query || ""));
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Server error." });
  }
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (req.method === "POST" && pathname === "/api/chat-stream") {
    handleChatStream(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/chat") {
    handleChat(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/route") {
    handleRoute(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Insurance QA tester: http://localhost:${PORT}`);
});

