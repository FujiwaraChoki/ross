"use strict";
const child_process = require("child_process");
const electron = require("electron");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const promises = require("fs/promises");
const utils = require("@electron-toolkit/utils");
const ignore = require("ignore");
const readline = require("readline");
const fs = require("fs");
const util = require("util");
function fixPath() {
  if (process.platform !== "darwin" && process.platform !== "linux") return;
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const result = child_process.execFileSync(shell, ["-lc", 'printf "%s" "$PATH"'], {
      encoding: "utf8",
      timeout: 5e3
    }).trim();
    if (result) {
      process.env.PATH = result;
    }
  } catch {
    const additions = [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.cargo/bin`
    ];
    const current = (process.env.PATH || "").split(":");
    process.env.PATH = [...additions.filter((p) => !current.includes(p)), ...current].join(":");
  }
}
class CodexServer {
  proc = null;
  rl = null;
  stderrRl = null;
  requestId = 0;
  pendingRequests = /* @__PURE__ */ new Map();
  win = null;
  initPromise = null;
  setWindow(win) {
    this.win = win;
  }
  start() {
    if (this.proc && this.initPromise) {
      return this.initPromise;
    }
    this.proc = child_process.spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.proc.on("error", (err) => {
      console.error("Failed to start codex app-server:", err);
      this.win?.webContents.send("codex:event", {
        method: "server/error",
        params: { message: err.message }
      });
      this.failPendingRequests(err);
      this.resetServerState();
    });
    this.proc.on("close", (code) => {
      console.log("codex app-server exited with code", code);
      this.win?.webContents.send("codex:event", {
        method: "server/stopped",
        params: { code }
      });
      this.failPendingRequests(new Error(`Codex server exited (code: ${code ?? "unknown"})`));
      this.resetServerState();
    });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this.handleMessage(line));
    this.stderrRl = readline.createInterface({ input: this.proc.stderr });
    this.stderrRl.on("line", (line) => this.handleStderr(line));
    this.initPromise = this.request("initialize", {
      clientInfo: { name: "ross-desktop", title: "Ross", version: "1.0.1" }
    }).then(() => this.notify("initialized", {})).then(() => void 0);
    return this.initPromise;
  }
  stop() {
    if (!this.proc && !this.rl && !this.stderrRl) return;
    if (this.proc) {
      this.proc.kill();
    }
    this.failPendingRequests(new Error("Server stopped"));
    this.resetServerState();
  }
  async request(method, params = {}) {
    if (!this.proc?.stdin?.writable) {
      throw new Error("Codex server is not running");
    }
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const sent = this.send({ jsonrpc: "2.0", id, method, params });
      if (!sent) {
        this.pendingRequests.delete(id);
        reject(new Error("Failed to send request to Codex server"));
      }
    });
  }
  notify(method, params) {
    this.send({ jsonrpc: "2.0", method, params });
  }
  respond(id, result) {
    this.send({ jsonrpc: "2.0", id, result });
  }
  async threadStart(params) {
    const requestedThreadId = this.getThreadId(params);
    const result = await this.request("thread/start", params);
    const actualThreadId = this.getThreadIdFromThreadStartResult(result);
    if (requestedThreadId && actualThreadId && requestedThreadId !== actualThreadId) {
      this.win?.webContents.send("codex:event", {
        method: "thread/remapped",
        params: {
          fromThreadId: requestedThreadId,
          toThreadId: actualThreadId
        }
      });
    }
    return result;
  }
  async turnStart(params) {
    try {
      return await this.request("turn/start", params);
    } catch (error) {
      if (!this.matchesError(error, ["thread not found", "invalid thread id"])) {
        throw error;
      }
      const previousThreadId = this.getThreadId(params);
      const threadStartResult = await this.request("thread/start", {});
      const newThreadId = this.getThreadIdFromThreadStartResult(threadStartResult);
      if (!newThreadId) {
        throw error;
      }
      if (previousThreadId && previousThreadId !== newThreadId) {
        this.win?.webContents.send("codex:event", {
          method: "thread/remapped",
          params: {
            fromThreadId: previousThreadId,
            toThreadId: newThreadId
          }
        });
      }
      return this.request("turn/start", { ...params, threadId: newThreadId });
    }
  }
  send(msg) {
    if (!this.proc?.stdin?.writable) return false;
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
    return true;
  }
  handleMessage(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    } else if (msg.method) {
      this.win?.webContents.send("codex:event", {
        method: msg.method,
        params: msg.params,
        requestId: msg.id
      });
    }
  }
  handleStderr(line) {
    if (!line.trim()) return;
    const text = line.toLowerCase();
    if (text.includes("tokenrefreshfailed") || text.includes("invalid_grant") || text.includes("refresh token is invalid")) {
      if (text.includes("rmcp::transport::worker") || text.includes("mcp")) {
        return;
      }
      this.win?.webContents.send("codex:event", {
        method: "auth/expired",
        params: { message: line }
      });
    }
  }
  resetServerState() {
    this.proc = null;
    this.initPromise = null;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.stderrRl) {
      this.stderrRl.close();
      this.stderrRl = null;
    }
  }
  failPendingRequests(reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
  getThreadId(params) {
    const value = params.threadId;
    return typeof value === "string" && value ? value : null;
  }
  getThreadIdFromThreadStartResult(result) {
    if (typeof result !== "object" || result === null) return null;
    const maybeThread = result.thread;
    if (typeof maybeThread !== "object" || maybeThread === null) return null;
    const maybeId = maybeThread.id;
    return typeof maybeId === "string" && maybeId ? maybeId : null;
  }
  matchesError(error, needles) {
    const message = error instanceof Error ? error.message.toLowerCase() : typeof error === "string" ? error.toLowerCase() : "";
    return needles.some((needle) => message.includes(needle));
  }
}
function getAuthPath() {
  return path.join(os.homedir(), ".codex", "auth.json");
}
function isAuthenticated() {
  return fs.existsSync(getAuthPath());
}
function login() {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn("codex", ["login"], { stdio: "inherit" });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error("Login failed")));
    proc.on("error", reject);
  });
}
const execFileAsync = util.promisify(child_process.execFile);
const DEFAULT_WHISPER_COMMANDS = ["whisper-cli", "main"];
const DEFAULT_MODEL_CANDIDATES = [
  path.join(os.homedir(), ".cache", "whisper", "ggml-base.en.bin"),
  path.join(os.homedir(), ".cache", "whisper.cpp", "ggml-base.en.bin"),
  "/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin",
  "/usr/local/share/whisper.cpp/models/ggml-base.en.bin"
];
const EXEC_MAX_BUFFER = 10 * 1024 * 1024;
class MissingCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "MissingCommandError";
  }
}
function expandHome(path$1) {
  if (!path$1.startsWith("~/")) return path$1;
  return path.join(os.homedir(), path$1.slice(2));
}
async function fileExists(path2) {
  try {
    await promises.access(path2);
    return true;
  } catch {
    return false;
  }
}
async function resolveWhisperModelPath() {
  const envModelPath = process.env.WHISPER_MODEL_PATH?.trim();
  const candidates = envModelPath ? [expandHome(envModelPath)] : DEFAULT_MODEL_CANDIDATES;
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return path.resolve(candidate);
    }
  }
  throw new Error(
    "No local Whisper model found. Set WHISPER_MODEL_PATH to a GGML model file (for example: ggml-base.en.bin)."
  );
}
async function runCommand$1(command, args, missingHelp) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: EXEC_MAX_BUFFER
    });
    return stdout.toString();
  } catch (error) {
    const execError = error;
    if (execError.code === "ENOENT") {
      throw new MissingCommandError(missingHelp);
    }
    const stderr = execError.stderr?.toString().trim();
    throw new Error(stderr || `Command "${command}" failed.`);
  }
}
async function convertToWav(inputPath, outputPath) {
  const ffmpegCommand = process.env.FFMPEG_COMMAND?.trim() || "ffmpeg";
  const missingHelp = `Could not run "${ffmpegCommand}". Install ffmpeg locally or set FFMPEG_COMMAND to a valid ffmpeg binary path.`;
  await runCommand$1(
    ffmpegCommand,
    ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-f", "wav", outputPath],
    missingHelp
  );
}
async function runWhisper(inputPath, outputBasePath, modelPath) {
  const configuredCommand = process.env.WHISPER_COMMAND?.trim();
  const whisperCommands = configuredCommand ? [configuredCommand] : DEFAULT_WHISPER_COMMANDS;
  const language = process.env.WHISPER_LANGUAGE?.trim();
  const args = ["-m", modelPath, "-f", inputPath, "-otxt", "-of", outputBasePath];
  if (language) {
    args.push("-l", language);
  }
  let lastError = null;
  for (const command of whisperCommands) {
    const missingHelp = `Could not run "${command}". Install whisper.cpp locally or set WHISPER_COMMAND to the whisper executable path.`;
    try {
      await runCommand$1(command, args, missingHelp);
      return;
    } catch (error) {
      if (error instanceof MissingCommandError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error(
    "Could not run a local whisper command. Set WHISPER_COMMAND to a working whisper executable path."
  );
}
async function transcribeAudio(audioData) {
  const modelPath = await resolveWhisperModelPath();
  const tempDir = await promises.mkdtemp(path.join(os.tmpdir(), "ross-transcribe-"));
  const inputPath = path.join(tempDir, "recording.webm");
  const wavPath = path.join(tempDir, "recording.wav");
  const outputBasePath = path.join(tempDir, "transcript");
  const outputPath = `${outputBasePath}.txt`;
  try {
    await promises.writeFile(inputPath, Buffer.from(audioData));
    await convertToWav(inputPath, wavPath);
    await runWhisper(wavPath, outputBasePath, modelPath);
    const transcription = (await promises.readFile(outputPath, "utf-8")).trim();
    if (!transcription) {
      throw new Error("Transcription finished but returned no text.");
    }
    return transcription;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transcription error.";
    throw new Error(`Local transcription failed: ${message}`);
  } finally {
    await promises.rm(tempDir, { recursive: true, force: true });
  }
}
fixPath();
const codexServer = new CodexServer();
let keepAwakeBlockerId = null;
const MAX_PROJECT_FILE_REFERENCES = 1e4;
function toPositiveInteger(value) {
  if (!value) return void 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function parseLinkedFileTarget(rawHref) {
  let href = decodeURIComponent(rawHref.trim());
  if (href.startsWith("file://")) {
    href = href.slice("file://".length);
  }
  let line;
  let column;
  const hashMatch = href.match(/#L(\d+)(?:C(\d+))?$/i);
  if (hashMatch) {
    line = toPositiveInteger(hashMatch[1]);
    column = toPositiveInteger(hashMatch[2]) || (line ? 1 : void 0);
    href = href.slice(0, hashMatch.index);
  }
  if (!line) {
    const colonMatch = href.match(/^(\/.+):(\d+)(?::(\d+))?$/);
    if (colonMatch) {
      href = colonMatch[1];
      line = toPositiveInteger(colonMatch[2]);
      column = toPositiveInteger(colonMatch[3]) || (line ? 1 : void 0);
    }
  }
  return {
    path: href,
    line,
    column
  };
}
function runCommandCapture(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
async function openPathInDefaultApp(path2) {
  const errorMessage = await electron.shell.openPath(path2);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
}
function isSafeBundledDocumentPath(relativePath) {
  return !relativePath.startsWith("/") && !relativePath.includes("..") && (relativePath.endsWith(".md") || relativePath.endsWith(".txt"));
}
async function openBundledDocument(relativePath) {
  if (!isSafeBundledDocumentPath(relativePath)) {
    throw new Error("Invalid document path");
  }
  const bundledPath = path.join(electron.app.getAppPath(), relativePath);
  const content = await promises.readFile(bundledPath, "utf8");
  const tempDir = path.join(electron.app.getPath("temp"), "ross-documents");
  const tempPath = path.join(tempDir, path.basename(relativePath));
  await promises.mkdir(tempDir, { recursive: true });
  await promises.writeFile(tempPath, content, "utf8");
  await openPathInDefaultApp(tempPath);
}
function buildGotoTarget(path2, line, column) {
  if (!line) return path2;
  return `${path2}:${line}:${column || 1}`;
}
async function openFileInEditor(rawHref, editor) {
  const target = parseLinkedFileTarget(rawHref);
  switch (editor) {
    case "cursor":
      try {
        await runCommand("cursor", [
          "--goto",
          buildGotoTarget(target.path, target.line, target.column)
        ]);
        return;
      } catch {
        await runCommand("open", ["-a", "Cursor", target.path]);
        return;
      }
    case "zed":
      try {
        await runCommand("zed", [buildGotoTarget(target.path, target.line, target.column)]);
        return;
      } catch {
        await runCommand("open", ["-a", "Zed", target.path]);
        return;
      }
    case "vscode":
      try {
        await runCommand("code", [
          "--goto",
          buildGotoTarget(target.path, target.line, target.column)
        ]);
        return;
      } catch {
        await runCommand("open", ["-a", "Visual Studio Code", target.path]);
        return;
      }
    case "ghostty":
      try {
        await runCommand("ghostty", [target.path]);
        return;
      } catch {
        await runCommand("open", ["-a", "Ghostty", target.path]);
        return;
      }
  }
}
async function createIgnoreMatcher(rootPath) {
  const matcher = ignore();
  matcher.add([".git", ".git/**"]);
  try {
    const gitignore = await promises.readFile(path.join(rootPath, ".gitignore"), "utf8");
    matcher.add(gitignore);
  } catch {
  }
  return matcher;
}
async function listProjectFiles(rootPath) {
  const files = [];
  const queue = [rootPath];
  let truncated = false;
  const matcher = await createIgnoreMatcher(rootPath);
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;
    let entries;
    try {
      entries = await promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootPath, fullPath).split(path.sep).join("/");
      if (entry.isSymbolicLink()) continue;
      if (matcher.ignores(relativePath)) continue;
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const slashIndex = relativePath.lastIndexOf("/");
      files.push({
        path: fullPath,
        name: entry.name,
        relativePath,
        directory: slashIndex >= 0 ? relativePath.slice(0, slashIndex) : "."
      });
      if (files.length >= MAX_PROJECT_FILE_REFERENCES) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  files.sort(
    (a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" }) || a.directory.localeCompare(b.directory, void 0, { sensitivity: "base" })
  );
  return { files, truncated };
}
async function resolveProjectRootPath(projectPath) {
  const rawPath = typeof projectPath === "string" ? projectPath.trim() : "";
  const candidates = rawPath ? [rawPath, path.dirname(rawPath)] : [];
  for (const candidate of candidates) {
    try {
      const info = await promises.stat(candidate);
      if (info.isDirectory()) return candidate;
      if (info.isFile()) return path.dirname(candidate);
    } catch {
      continue;
    }
  }
  return process.cwd();
}
function createWindow() {
  const vibrancySupported = process.platform === "darwin";
  const titleBarHeight = 44;
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: "hidden",
    ...process.platform === "darwin" ? { trafficLightPosition: { x: 16, y: 16 } } : {
      titleBarOverlay: {
        color: "#00000000",
        symbolColor: "#808080",
        height: titleBarHeight
      }
    },
    ...vibrancySupported ? { vibrancy: "under-window", visualEffectState: "active" } : { backgroundColor: "#181818" },
    icon: path.join(__dirname, "../../resources/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  win.on("ready-to-show", () => {
    win.show();
  });
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(true);
  }
  win.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        electron.shell.openExternal(details.url);
      }
    } catch {
    }
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.samihindi.ross");
  electron.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = [
      "local-fonts",
      "clipboard-read",
      "clipboard-sanitized-write",
      "media",
      "notifications"
    ];
    callback(allowed.includes(permission));
  });
  if (process.platform === "darwin" && electron.app.dock) {
    electron.app.dock.setIcon(path.join(__dirname, "../../resources/icon.png"));
  }
  electron.app.setName("Ross");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  const win = createWindow();
  codexServer.setWindow(win);
  electron.ipcMain.handle("codex:is-authenticated", () => isAuthenticated());
  electron.ipcMain.handle("codex:login", () => login());
  electron.ipcMain.handle("codex:start-server", async () => {
    await codexServer.start();
    return true;
  });
  electron.ipcMain.handle("codex:stop-server", () => {
    codexServer.stop();
    return true;
  });
  electron.ipcMain.handle("codex:thread-start", (_, params) => codexServer.threadStart(params));
  electron.ipcMain.handle(
    "codex:thread-read",
    (_, params) => codexServer.request("thread/read", params || {})
  );
  electron.ipcMain.handle(
    "codex:thread-list",
    (_, params) => codexServer.request("thread/list", params || {})
  );
  electron.ipcMain.handle("codex:turn-start", (_, params) => codexServer.turnStart(params));
  electron.ipcMain.handle(
    "codex:turn-interrupt",
    (_, params) => codexServer.request("turn/interrupt", params || {})
  );
  electron.ipcMain.handle(
    "codex:config-value-write",
    (_, params) => codexServer.request("config/value/write", params || {})
  );
  electron.ipcMain.handle(
    "codex:config-read",
    (_, params) => codexServer.request("config/read", params || { includeLayers: false })
  );
  electron.ipcMain.handle(
    "codex:config-batch-write",
    (_, params) => codexServer.request("config/batchWrite", params || {})
  );
  electron.ipcMain.handle("codex:model-list", () => codexServer.request("model/list", {}));
  electron.ipcMain.handle(
    "codex:mcp-server-reload",
    () => codexServer.request("config/mcpServer/reload", {})
  );
  electron.ipcMain.handle(
    "codex:mcp-server-status-list",
    (_, params) => codexServer.request("mcpServerStatus/list", params || {})
  );
  electron.ipcMain.handle("codex:skills-list", (_, params) => {
    const requestParams = params && typeof params === "object" ? { ...params } : {};
    const hasCwds = Array.isArray(requestParams.cwds) && requestParams.cwds.every((cwd) => typeof cwd === "string");
    if (!hasCwds) {
      requestParams.cwds = [process.cwd()];
    }
    return codexServer.request("skills/list", requestParams);
  });
  electron.ipcMain.handle(
    "codex:skills-config-write",
    (_, params) => codexServer.request("skills/config/write", params || {})
  );
  electron.ipcMain.handle("codex:open-project", async () => {
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Open Project"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const fullPath = result.filePaths[0];
    const name = fullPath.split("/").pop() || fullPath;
    return { path: fullPath, name };
  });
  electron.ipcMain.handle("codex:list-project-files", async (_, projectPath) => {
    const rootPath = await resolveProjectRootPath(projectPath);
    return listProjectFiles(rootPath);
  });
  electron.ipcMain.handle("codex:open-config-file", async () => {
    const configPath = path.join(os.homedir(), ".codex", "config.toml");
    await promises.mkdir(path.dirname(configPath), { recursive: true });
    await promises.writeFile(configPath, "", { flag: "a" });
    await openPathInDefaultApp(configPath);
  });
  electron.ipcMain.handle("codex:open-attachments", async () => {
    const result = await electron.dialog.showOpenDialog(win, {
      title: "Attach Files",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Supported Files",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "svg",
            "heic",
            "heif",
            "tif",
            "tiff",
            "pdf",
            "txt",
            "md",
            "markdown",
            "csv",
            "json",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            "rtf",
            "odt"
          ]
        },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths.map((path$1) => ({
      path: path$1,
      name: path.basename(path$1)
    }));
  });
  electron.ipcMain.handle("codex:open-path", async (_, path2) => {
    if (typeof path2 !== "string" || !path2.startsWith("/")) {
      throw new Error("Invalid path");
    }
    await openPathInDefaultApp(path2);
  });
  electron.ipcMain.handle("codex:open-bundled-document", async (_, relativePath) => {
    if (typeof relativePath !== "string") {
      throw new Error("Invalid document path");
    }
    await openBundledDocument(relativePath);
  });
  electron.ipcMain.handle(
    "codex:stage-attachment",
    async (_, params) => {
      if (!(params?.data instanceof ArrayBuffer)) {
        throw new Error("Invalid attachment payload");
      }
      const inputName = typeof params?.name === "string" ? params.name : "attachment";
      const mimeType = typeof params?.mimeType === "string" ? params.mimeType : "";
      const extFromName = inputName.includes(".") ? inputName.slice(inputName.lastIndexOf(".")) : "";
      const fallbackExt = mimeType === "image/png" ? ".png" : mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/webp" ? ".webp" : mimeType === "image/gif" ? ".gif" : "";
      const ext = extFromName || fallbackExt;
      const safeBase = inputName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      const fileName = `${safeBase || "attachment"}-${crypto.randomUUID()}${ext}`;
      const targetDir = path.join(electron.app.getPath("userData"), "attachments");
      const targetPath = path.join(targetDir, fileName);
      await promises.mkdir(targetDir, { recursive: true });
      await promises.writeFile(targetPath, Buffer.from(params.data));
      return {
        path: targetPath,
        name: inputName
      };
    }
  );
  electron.ipcMain.handle(
    "codex:open-file-link",
    async (_, params) => {
      const href = typeof params?.href === "string" ? params.href : "";
      const editor = params?.editor;
      if (!href.startsWith("/") && !href.startsWith("file://")) {
        throw new Error("Invalid file link");
      }
      if (editor !== "cursor" && editor !== "zed" && editor !== "vscode" && editor !== "ghostty") {
        throw new Error("Invalid editor");
      }
      await openFileInEditor(href, editor);
    }
  );
  electron.ipcMain.handle("codex:reveal-in-finder", (_, path2) => {
    electron.shell.showItemInFolder(path2);
  });
  electron.ipcMain.handle("codex:transcribe", async (_, audioData) => {
    return transcribeAudio(audioData);
  });
  electron.ipcMain.handle("codex:set-keep-awake", (_, enabled) => {
    if (enabled) {
      if (keepAwakeBlockerId == null || !electron.powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
        keepAwakeBlockerId = electron.powerSaveBlocker.start("prevent-app-suspension");
      }
      return;
    }
    if (keepAwakeBlockerId != null && electron.powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
      electron.powerSaveBlocker.stop(keepAwakeBlockerId);
    }
    keepAwakeBlockerId = null;
  });
  electron.ipcMain.handle("codex:set-window-opaque", (_, enabled) => {
    if (process.platform !== "darwin") return;
    if (enabled) {
      win.setVibrancy(null);
      win.setBackgroundColor("#181818");
      return;
    }
    win.setBackgroundColor("#00000000");
    win.setVibrancy("under-window");
  });
  electron.ipcMain.handle("codex:get-custom-instructions", async () => {
    const configPath = path.join(os.homedir(), ".codex", "config.toml");
    try {
      const content = await promises.readFile(configPath, "utf-8");
      const match = content.match(
        /\[history\]\s*\n(?:[^\n]*\n)*?instructions\s*=\s*"""([\s\S]*?)"""/
      );
      if (match) return match[1].trim();
      const singleMatch = content.match(
        /\[history\]\s*\n(?:[^\n]*\n)*?instructions\s*=\s*"([^"]*)"/
      );
      if (singleMatch) return singleMatch[1];
      return "";
    } catch {
      return "";
    }
  });
  electron.ipcMain.handle("codex:set-custom-instructions", async (_, instructions) => {
    const configDir = path.join(os.homedir(), ".codex");
    const configPath = path.join(configDir, "config.toml");
    await promises.mkdir(configDir, { recursive: true });
    let content = "";
    try {
      content = await promises.readFile(configPath, "utf-8");
    } catch {
    }
    const historyBlock = instructions.trim() ? `[history]
instructions = """
${instructions.trim()}
"""` : "";
    const historyRegex = /\[history\]\s*\n(?:(?!\n\[)[^\n]*\n?)*/;
    if (historyRegex.test(content)) {
      content = content.replace(historyRegex, historyBlock ? historyBlock + "\n" : "");
    } else if (historyBlock) {
      content = content.trimEnd() + (content.trim() ? "\n\n" : "") + historyBlock + "\n";
    }
    await promises.writeFile(configPath, content, "utf-8");
    return true;
  });
  electron.ipcMain.handle(
    "codex:git-status",
    async (_, params) => {
      const cwd = params?.cwd || process.cwd();
      const branch = (await runCommandCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).trim();
      let filesChanged = 0;
      let additions = 0;
      let deletions = 0;
      try {
        const numstat = await runCommandCapture("git", ["diff", "HEAD", "--numstat"], { cwd });
        for (const line of numstat.trim().split("\n")) {
          if (!line) continue;
          const [add, del] = line.split("	");
          filesChanged++;
          if (add !== "-") additions += parseInt(add, 10) || 0;
          if (del !== "-") deletions += parseInt(del, 10) || 0;
        }
      } catch {
        try {
          const numstat = await runCommandCapture("git", ["diff", "--cached", "--numstat"], { cwd });
          for (const line of numstat.trim().split("\n")) {
            if (!line) continue;
            const [add, del] = line.split("	");
            filesChanged++;
            if (add !== "-") additions += parseInt(add, 10) || 0;
            if (del !== "-") deletions += parseInt(del, 10) || 0;
          }
        } catch {
        }
        try {
          const untracked = await runCommandCapture(
            "git",
            ["ls-files", "--others", "--exclude-standard"],
            { cwd }
          );
          for (const line of untracked.trim().split("\n")) {
            if (line) filesChanged++;
          }
        } catch {
        }
      }
      return { branch, filesChanged, additions, deletions };
    }
  );
  electron.ipcMain.handle(
    "codex:git-commit",
    async (_, params) => {
      const cwd = params?.cwd || process.cwd();
      try {
        if (params.includeUnstaged) {
          await runCommandCapture("git", ["add", "-A"], { cwd });
        }
        const commitArgs = ["commit"];
        if (params.message.trim()) {
          commitArgs.push("-m", params.message.trim());
        } else {
          commitArgs.push("-m", "Update changes");
        }
        await runCommandCapture("git", commitArgs, { cwd });
        if (params.push || params.createPr) {
          await runCommandCapture("git", ["push"], { cwd });
        }
        if (params.createPr) {
          try {
            await runCommandCapture("gh", ["pr", "create", "--fill"], { cwd });
          } catch (prError) {
            return {
              success: true,
              error: `Committed & pushed, but PR creation failed: ${prError.message}`
            };
          }
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  );
  electron.ipcMain.handle(
    "codex:approve-command",
    (_, params) => codexServer.notify("command/approve", params)
  );
  electron.ipcMain.handle(
    "codex:reject-command",
    (_, params) => codexServer.notify("command/reject", params)
  );
  electron.ipcMain.handle(
    "codex:resolve-server-request",
    (_, params) => {
      codexServer.respond(params.requestId, params.result);
    }
  );
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      codexServer.setWindow(newWin);
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (keepAwakeBlockerId != null && electron.powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    electron.powerSaveBlocker.stop(keepAwakeBlockerId);
    keepAwakeBlockerId = null;
  }
  codexServer.stop();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  if (keepAwakeBlockerId != null && electron.powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    electron.powerSaveBlocker.stop(keepAwakeBlockerId);
    keepAwakeBlockerId = null;
  }
  codexServer.stop();
});
