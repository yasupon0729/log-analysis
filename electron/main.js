const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  nativeImage,
} = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const APP_URL = process.env.APP_URL || "http://localhost:3729";
const REPO_ROOT = path.resolve(__dirname, "..");
const MAKE_BIN = process.env.MAKE_BIN || "make";
const START_TARGET = process.env.DOCKER_START_TARGET || "up";
const STOP_TARGET = process.env.DOCKER_STOP_TARGET || "down";
const WAIT_TIMEOUT_MS = parseNumber(
  process.env.APP_WAIT_TIMEOUT_MS,
  120000,
);
const WAIT_INTERVAL_MS = parseNumber(
  process.env.APP_WAIT_INTERVAL_MS,
  1000,
);
const STOP_ON_EXIT =
  (process.env.ELECTRON_STOP_ON_EXIT ?? "true").toLowerCase() !== "false";
const SKIP_DOCKER_START =
  (process.env.ELECTRON_SKIP_DOCKER_START ?? "")
    .toLowerCase()
    .trim() === "true" ||
  (process.env.ELECTRON_SKIP_DOCKER_START ?? "")
    .toLowerCase()
    .trim() === "1";
const CLOSE_TO_TRAY =
  (process.env.ELECTRON_CLOSE_TO_TRAY ?? "true").toLowerCase() !== "false";
const TRAY_ICON_PATH =
  process.env.ELECTRON_TRAY_ICON ||
  path.join(REPO_ROOT, "nextjs", "src", "app", "favicon.ico");

let mainWindow = null;
let actionPromise = null;
let isQuitting = false;
let tray = null;
let trayAvailable = false;

function parseNumber(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function statusPage(title, message, detail) {
  const detailBlock = detail
    ? `<pre class="detail">${escapeHtml(detail)}</pre>`
    : "";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        color: #e2e8f0;
        font-family: "Segoe UI", "Noto Sans", "Helvetica Neue", sans-serif;
      }
      main {
        width: min(720px, 92vw);
        padding: 32px;
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.6);
        box-shadow: 0 30px 60px rgba(2, 6, 23, 0.45);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        letter-spacing: 0.02em;
      }
      p {
        margin: 0;
        color: #cbd5f5;
        line-height: 1.6;
      }
      .detail {
        margin-top: 20px;
        padding: 16px;
        background: rgba(2, 6, 23, 0.55);
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.15);
        font-size: 13px;
        white-space: pre-wrap;
        color: #f8fafc;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detailBlock}
    </main>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showStatus(title, message, detail) {
  if (!mainWindow) {
    return;
  }
  mainWindow.loadURL(statusPage(title, message, detail));
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createWindow();
}

function createTray() {
  if (tray) {
    return;
  }
  if (!fs.existsSync(TRAY_ICON_PATH)) {
    return;
  }
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(icon);
  trayAvailable = true;
  tray.setToolTip("Log Analysis");
  tray.on("click", () => showMainWindow());

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show", click: () => showMainWindow() },
    { type: "separator" },
    { label: "Start", click: () => startDockerAndLoad() },
    { label: "Stop", click: () => stopDocker() },
    { label: "Restart", click: () => restartDocker() },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function runMake(target) {
  return new Promise((resolve, reject) => {
    const proc = spawn(MAKE_BIN, [target], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_ELECTRON: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    proc.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `"${MAKE_BIN}" was not found. Set MAKE_BIN to the full path.`,
          ),
        );
        return;
      }
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(
        new Error(
          `make ${target} failed with code ${code}${detail ? `\n${detail}` : ""}`,
        ),
      );
    });
  });
}

function parseAppUrl() {
  const url = new URL(APP_URL);
  const host = url.hostname || "localhost";
  const port = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid port in APP_URL: ${APP_URL}`);
  }
  return { host, port, url: url.toString() };
}

function waitForAppReady(appUrl, timeoutMs, intervalMs) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const url = new URL(appUrl);
      const client = url.protocol === "https:" ? https : http;
      const req = client.request(
        url,
        { method: "GET", headers: { "User-Agent": "electron-healthcheck" } },
        (res) => {
          res.resume();
          resolve();
        },
      );

      req.setTimeout(2000, () => {
        req.destroy();
      });

      req.on("error", () => {
        if (Date.now() - startTime >= timeoutMs) {
          reject(new Error("Timed out waiting for the app to respond."));
          return;
        }
        setTimeout(attempt, intervalMs);
      });

      req.end();
    };

    attempt();
  });
}

async function runAction(action) {
  if (actionPromise) {
    await actionPromise;
  }
  actionPromise = action();
  try {
    await actionPromise;
  } finally {
    actionPromise = null;
  }
}

async function loadAppWithoutDocker() {
  await runAction(async () => {
    const { url } = parseAppUrl();
    showStatus("Starting", "Waiting for the local app...", `Target: ${url}`);
    await waitForAppReady(url, WAIT_TIMEOUT_MS, WAIT_INTERVAL_MS);
    if (mainWindow) {
      await mainWindow.loadURL(url);
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showStatus("Error", "Failed to load the app.", message);
    dialog.showErrorBox("Launch error", message);
  });
}

async function startDockerAndLoad() {
  await runAction(async () => {
    const { url } = parseAppUrl();
    showStatus("Starting", "Starting Docker containers...", `Target: ${url}`);
    await runMake(START_TARGET);
    await waitForAppReady(url, WAIT_TIMEOUT_MS, WAIT_INTERVAL_MS);
    if (mainWindow) {
      await mainWindow.loadURL(url);
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showStatus("Error", "Failed to start the app.", message);
    dialog.showErrorBox("Launch error", message);
  });
}

async function stopDocker() {
  await runAction(async () => {
    showStatus("Stopping", "Stopping Docker containers...", "");
    await runMake(STOP_TARGET);
    showStatus("Stopped", "Containers stopped.", "");
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showStatus("Error", "Failed to stop containers.", message);
    dialog.showErrorBox("Stop error", message);
  });
}

async function restartDocker() {
  await runAction(async () => {
    showStatus("Restarting", "Restarting Docker containers...", "");
    await runMake(STOP_TARGET);
    await runMake(START_TARGET);
    const { url } = parseAppUrl();
    await waitForAppReady(url, WAIT_TIMEOUT_MS, WAIT_INTERVAL_MS);
    if (mainWindow) {
      await mainWindow.loadURL(url);
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showStatus("Error", "Failed to restart containers.", message);
    dialog.showErrorBox("Restart error", message);
  });
}

function buildMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
          },
        ]
      : []),
    {
      label: "Docker",
      submenu: [
        { label: "Start", click: () => startDockerAndLoad() },
        { label: "Stop", click: () => stopDocker() },
        { label: "Restart", click: () => restartDocker() },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forcereload" },
        { role: "toggledevtools" },
        { type: "separator" },
        { role: "resetzoom" },
        { role: "zoomin" },
        { role: "zoomout" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("close", (event) => {
    if (!CLOSE_TO_TRAY || isQuitting) {
      return;
    }
    event.preventDefault();
    if (trayAvailable) {
      mainWindow?.hide();
      return;
    }
    mainWindow?.minimize();
  });

  showStatus("Starting", "Preparing the local app...", `Target: ${APP_URL}`);
  if (SKIP_DOCKER_START) {
    void loadAppWithoutDocker();
  } else {
    void startDockerAndLoad();
  }
}

app.on("before-quit", (event) => {
  if (!STOP_ON_EXIT || isQuitting) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  stopDocker().finally(() => {
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(() => {
  buildMenu();
  createTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    showMainWindow();
  });
});
