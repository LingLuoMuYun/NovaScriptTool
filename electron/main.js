const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

// 后端和前端子进程
let backendProcess = null;
let frontendProcess = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 4000;
const FRONTEND_PORT = 3000;

// ─── 数据库迁移 ────────────────────────────────────
function runMigrations(backendDir, envVars) {
  return new Promise((resolve) => {
    console.log("[electron] Running database migrations...");
    const migrate = spawn("npx", ["prisma", "migrate", "deploy"], {
      cwd: backendDir,
      env: envVars,
      stdio: "pipe",
      shell: true,
    });
    migrate.stdout.on("data", (d) => console.log(`[migrate] ${d.toString().trim()}`));
    migrate.stderr.on("data", (d) => console.error(`[migrate] ${d.toString().trim()}`));
    migrate.on("close", (code) => {
      if (code === 0) console.log("[electron] Migrations applied successfully");
      else console.warn("[electron] Migration exited with code", code, "(may already be up-to-date)");
      resolve();
    });
    migrate.on("error", (err) => {
      console.warn("[electron] Migration error:", err.message);
      resolve();
    });
  });
}

// ─── 启动 Express 后端 ──────────────────────────────
async function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");

  const entryPoint = isDev
    ? path.join(backendDir, "src", "index.ts")
    : path.join(backendDir, "dist", "index.js");

  // 数据库路径：生产模式下放到用户数据目录（appData），确保可写
  const dbPath = isDev
    ? path.join(backendDir, "prisma", "dev.db")
    : path.join(app.getPath("userData"), "novascript.db");

  const envVars = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    DATABASE_URL: `file:${dbPath}`,
  };

  // 生产模式先运行迁移
  if (!isDev) {
    await runMigrations(backendDir, envVars);
  }

  if (isDev) {
    backendProcess = spawn("npx", ["tsx", entryPoint], {
      cwd: backendDir,
      env: envVars,
      stdio: "pipe",
      shell: true,
    });
  } else {
    backendProcess = spawn("node", [entryPoint], {
      cwd: backendDir,
      env: envVars,
      stdio: "pipe",
    });
  }

  backendProcess.stdout?.on("data", (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });
  backendProcess.stderr?.on("data", (data) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });
  backendProcess.on("error", (err) => {
    console.error("[backend] Failed to start:", err.message);
  });
}

// ─── 启动 Next.js 前端 ──────────────────────────────
function startFrontend() {
  const frontendDir = isDev
    ? path.join(__dirname, "..", "frontend")
    : path.join(process.resourcesPath, "frontend");

  if (isDev) {
    frontendProcess = spawn("npx", ["next", "dev", "-p", String(FRONTEND_PORT)], {
      cwd: frontendDir,
      env: { ...process.env, NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}` },
      stdio: "pipe",
      shell: true,
    });
  } else {
    frontendProcess = spawn("npx", ["next", "start", "-p", String(FRONTEND_PORT)], {
      cwd: frontendDir,
      env: { ...process.env, NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}` },
      stdio: "pipe",
    });
  }

  frontendProcess.stdout?.on("data", (data) => {
    console.log(`[frontend] ${data.toString().trim()}`);
  });
  frontendProcess.stderr?.on("data", (data) => {
    console.error(`[frontend] ${data.toString().trim()}`);
  });
}

// ─── 等待服务就绪 ──────────────────────────────────
function waitForServer(url, retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      const http = require(url.startsWith("https") ? "https" : "http");
      http
        .get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else if (attempt < retries) setTimeout(() => check(attempt + 1), interval);
          else reject(new Error(`Server ${url} not ready after ${retries} attempts`));
        })
        .on("error", () => {
          if (attempt < retries) setTimeout(() => check(attempt + 1), interval);
          else reject(new Error(`Server ${url} not ready`));
        });
    };
    check(1);
  });
}

// ─── 创建窗口 ───────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "NovaScriptTool — AI 小说转剧本",
    icon: path.join(__dirname, "..", "frontend", "public", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${FRONTEND_PORT}`);

  win.on("closed", () => {
    cleanup();
  });
}

// ─── IPC: 打开文件对话框 ───────────────────────────
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择小说文件",
    filters: [
      { name: "文本文件", extensions: ["txt", "md", "json"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fileName = path.basename(filePath);
    return { filePath, fileName, content };
  } catch (err) {
    console.error("Read file error:", err.message);
    return { error: err.message };
  }
});

// ─── IPC: 保存文件 ──────────────────────────────────
ipcMain.handle("save-file-dialog", async (_event, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog({
    title: "导出剧本",
    defaultPath: defaultName,
    filters: filters || [
      { name: "YAML", extensions: ["yaml", "yml"] },
      { name: "Final Draft", extensions: ["fdx"] },
      { name: "Fountain", extensions: ["fountain"] },
      { name: "文本文件", extensions: ["txt"] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content, "utf-8");
    return { filePath: result.filePath, success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ─── 清理 ───────────────────────────────────────────
function cleanup() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (frontendProcess) {
    frontendProcess.kill();
    frontendProcess = null;
  }
}

// ─── 应用生命周期 ───────────────────────────────────
app.whenReady().then(async () => {
  console.log("[electron] Starting backend...");
  await startBackend();
  await waitForServer(`http://localhost:${BACKEND_PORT}/api/health`).catch(() => {
    console.warn("[electron] Backend health check failed, continuing anyway...");
  });

  console.log("[electron] Starting frontend...");
  startFrontend();
  await waitForServer(`http://localhost:${FRONTEND_PORT}`).catch(() => {
    console.warn("[electron] Frontend not ready, continuing anyway...");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  cleanup();
  app.quit();
});

app.on("before-quit", () => {
  cleanup();
});
