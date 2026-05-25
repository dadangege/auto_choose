#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildPrompt, buildTwoStagePrompts, routePreview } = require("../orchestrator");

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
  const promptMode = ["wiki", "full", "report", "two_stage"].includes(body.promptMode) ? body.promptMode : "wiki";
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
  return { apiKey, baseUrl, model, query, promptMode, temperature };
}

function validateChatInput(input) {
  if (!input.apiKey) return "请填写 MiniMax API key。";
  if (!input.query) return "请输入测试问题。";
  if (!/^https:\/\//.test(input.baseUrl)) return "Base URL 必须是 https 地址。";
  return null;
}

function chatPayload(input, promptBundle, stream, maxCompletionTokens = 2048) {
  return {
    model: input.model,
    messages: [
      { role: "system", content: promptBundle.prompt },
      { role: "user", content: input.query },
    ],
    temperature: input.temperature,
    max_completion_tokens: maxCompletionTokens,
    stream,
  };
}

function upstreamError(status, detail) {
  const error = new Error("MiniMax 请求失败。");
  error.isUpstream = true;
  error.status = status;
  error.detail = detail;
  return error;
}

async function requestCompletionText(input, promptBundle, maxCompletionTokens = 2048) {
  const upstream = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chatPayload(input, promptBundle, false, maxCompletionTokens)),
  });
  const responseText = await upstream.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = { raw: responseText };
  }

  if (!upstream.ok) {
    throw upstreamError(upstream.status, responseJson);
  }

  return {
    content: stripThinking(responseJson?.choices?.[0]?.message?.content || ""),
    usage: responseJson.usage || null,
    model: responseJson.model || input.model,
  };
}

function combineTwoStageProfile(plannerProfile, rendererProfile) {
  return {
    ...rendererProfile,
    mode: "two_stage",
    label: "两段式编排",
    charCount: (plannerProfile?.charCount || 0) + (rendererProfile?.charCount || 0),
    plannerCharCount: plannerProfile?.charCount || 0,
    rendererCharCount: rendererProfile?.charCount || 0,
    selectedSnippets: Array.from(new Set([
      ...(plannerProfile?.selectedSnippets || []),
      ...(rendererProfile?.selectedSnippets || []),
    ])),
  };
}

async function streamCompletionToSse(input, promptBundle, res, requestStartedAt) {
  let finalContent = "";
  let modelName = null;
  let usage = null;
  let firstDeltaAt = null;
  let doneSeen = false;
  const upstreamStartedAt = Date.now();

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
    return { ok: false };
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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

  return {
    ok: true,
    finalContent,
    modelName,
    usage,
    firstDeltaAt,
    upstreamStartedAt,
    finishedAt: Date.now(),
    doneSeen,
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

    const startedAt = Date.now();
    if (input.promptMode === "two_stage") {
      const twoStage = buildTwoStagePrompts(input.query);
      const plannerStartedAt = Date.now();
      const plannerResult = await requestCompletionText(input, twoStage.planner, 1200);
      const rendererStage = buildTwoStagePrompts(input.query, plannerResult.content);
      const rendererStartedAt = Date.now();
      const rendererResult = await requestCompletionText(input, rendererStage.renderer, 2048);
      const promptProfile = combineTwoStageProfile(twoStage.planner.profile, rendererStage.renderer.profile);
      jsonResponse(res, 200, {
        content: rendererResult.content,
        plannerContent: plannerResult.content,
        usage: {
          planner: plannerResult.usage,
          renderer: rendererResult.usage,
        },
        model: rendererResult.model || plannerResult.model || input.model,
        latencyMs: Date.now() - startedAt,
        timings: {
          plannerMs: rendererStartedAt - plannerStartedAt,
          rendererMs: Date.now() - rendererStartedAt,
        },
        routePreview: twoStage.orchestration.route,
        orchestration: twoStage.orchestration,
        promptProfile,
      });
      return;
    }

    const promptBundle = buildPrompt(input.query, input.promptMode);
    const response = await requestCompletionText(input, promptBundle, 2048);
    jsonResponse(res, 200, {
      content: response.content,
      usage: response.usage,
      model: response.model,
      latencyMs: Date.now() - startedAt,
      routePreview: promptBundle.orchestration.route,
      orchestration: promptBundle.orchestration,
      promptProfile: promptBundle.profile,
    });
  } catch (error) {
    if (error.isUpstream) {
      jsonResponse(res, error.status, {
        error: error.message,
        status: error.status,
        detail: error.detail,
      });
      return;
    }
    jsonResponse(res, 500, { error: error.message || "Server error." });
  }
}

async function handleTwoStageChatStream(input, res, requestStartedAt) {
  const twoStage = buildTwoStagePrompts(input.query);
  sseSend(res, "meta", {
    routePreview: twoStage.orchestration.route,
    orchestration: twoStage.orchestration,
    promptProfile: twoStage.planner.profile,
    timings: {
      requestStartedAt,
      promptBuiltMs: Date.now() - requestStartedAt,
    },
  });

  const plannerStartedAt = Date.now();
  sseSend(res, "stage", {
    name: "planner_started",
    label: "第一段结构草稿",
    promptProfile: twoStage.planner.profile,
  });

  let plannerResult;
  try {
    plannerResult = await requestCompletionText(input, twoStage.planner, 1200);
  } catch (error) {
    if (error.isUpstream) {
      sseSend(res, "error", {
        error: error.message,
        status: error.status,
        detail: error.detail,
      });
    } else {
      sseSend(res, "error", { error: error.message || "Server error." });
    }
    return;
  }

  const plannerFinishedAt = Date.now();
  sseSend(res, "timing", {
    name: "planner_done",
    ms: plannerFinishedAt - requestStartedAt,
    stageMs: plannerFinishedAt - plannerStartedAt,
  });
  sseSend(res, "stage", {
    name: "planner_done",
    label: "第一段草稿完成",
    content: plannerResult.content,
    model: plannerResult.model,
    promptProfile: twoStage.planner.profile,
    timings: {
      stageMs: plannerFinishedAt - plannerStartedAt,
      outputChars: plannerResult.content.length,
    },
  });

  const rendererStage = buildTwoStagePrompts(input.query, plannerResult.content);
  const promptProfile = combineTwoStageProfile(twoStage.planner.profile, rendererStage.renderer.profile);
  sseSend(res, "stage", {
    name: "renderer_started",
    label: "第二段事实补齐",
    promptProfile,
  });

  const streamResult = await streamCompletionToSse(input, rendererStage.renderer, res, requestStartedAt);
  if (!streamResult.ok) return;

  const finishedAt = streamResult.finishedAt;
  sseSend(res, "done", {
    content: stripThinking(streamResult.finalContent),
    plannerContent: plannerResult.content,
    model: streamResult.modelName || plannerResult.model || input.model,
    usage: {
      planner: plannerResult.usage,
      renderer: streamResult.usage,
    },
    promptProfile,
    routePreview: twoStage.orchestration.route,
    orchestration: twoStage.orchestration,
    timings: {
      totalMs: finishedAt - requestStartedAt,
      plannerMs: plannerFinishedAt - plannerStartedAt,
      upstreamMs: streamResult.upstreamStartedAt ? finishedAt - streamResult.upstreamStartedAt : null,
      rendererMs: streamResult.upstreamStartedAt ? finishedAt - streamResult.upstreamStartedAt : null,
      firstDeltaMs: streamResult.firstDeltaAt ? streamResult.firstDeltaAt - requestStartedAt : null,
      rendererFirstDeltaMs: streamResult.firstDeltaAt && streamResult.upstreamStartedAt
        ? streamResult.firstDeltaAt - streamResult.upstreamStartedAt
        : null,
      promptChars: promptProfile.charCount,
      plannerPromptChars: promptProfile.plannerCharCount,
      rendererPromptChars: promptProfile.rendererCharCount,
      plannerOutputChars: plannerResult.content.length,
      outputChars: streamResult.finalContent.length,
      doneSeen: streamResult.doneSeen,
    },
  });
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

    if (input.promptMode === "two_stage") {
      await handleTwoStageChatStream(input, res, requestStartedAt);
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
          stageMs: firstDeltaAt - upstreamStartedAt,
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
