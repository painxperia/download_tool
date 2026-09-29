import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const artifactDirectory = join(projectDirectory, "tests", "artifacts");
const screenshotPath = join(artifactDirectory, "popup.png");
const profileDirectory = mkdtempSync(join(tmpdir(), "download-tool-visual-"));

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) throw new Error("找不到 Chrome；可通过 CHROME_PATH 指定可执行文件。");

const now = new Date();
const mockItems = [
  {
    id: 101,
    filename: "C:\\Users\\demo\\Downloads\\product-design-assets.zip",
    finalUrl: "https://assets.example.com/product-design-assets.zip",
    url: "https://assets.example.com/product-design-assets.zip",
    state: "in_progress",
    paused: false,
    canResume: true,
    exists: true,
    bytesReceived: 34500000,
    totalBytes: 82000000,
    fileSize: 0,
    estimatedEndTime: new Date(now.getTime() + 36_000).toISOString(),
    startTime: new Date(now.getTime() - 64_000).toISOString(),
    danger: "safe"
  },
  {
    id: 102,
    filename: "C:\\Users\\demo\\Downloads\\季度数据分析报告.pdf",
    finalUrl: "https://docs.example.cn/reports/q3.pdf",
    url: "https://docs.example.cn/reports/q3.pdf",
    state: "complete",
    paused: false,
    canResume: false,
    exists: true,
    bytesReceived: 4841000,
    totalBytes: 4841000,
    fileSize: 4841000,
    startTime: new Date(now.getTime() - 3_600_000).toISOString(),
    endTime: new Date(now.getTime() - 3_590_000).toISOString(),
    danger: "safe"
  },
  {
    id: 103,
    filename: "C:\\Users\\demo\\Downloads\\chrome-installer.exe",
    finalUrl: "https://download.example.org/chrome-installer.exe",
    url: "https://download.example.org/chrome-installer.exe",
    state: "complete",
    paused: false,
    canResume: false,
    exists: false,
    bytesReceived: 62100000,
    totalBytes: 62100000,
    fileSize: 62100000,
    startTime: new Date(now.getTime() - 86_400_000).toISOString(),
    danger: "safe"
  },
  {
    id: 104,
    filename: "C:\\Users\\demo\\Downloads\\training-video.mp4",
    finalUrl: "https://media.example.net/training-video.mp4",
    url: "https://media.example.net/training-video.mp4",
    state: "interrupted",
    paused: false,
    canResume: true,
    exists: true,
    bytesReceived: 9100000,
    totalBytes: 120000000,
    fileSize: 0,
    startTime: new Date(now.getTime() - 172_800_000).toISOString(),
    error: "NETWORK_TIMEOUT",
    danger: "safe"
  }
];

const mockScript = `
  globalThis.chrome = {
    downloads: {
      search: async (query = {}) => query.state === "in_progress"
        ? globalThis.__downloadToolItems.filter((item) => item.state === "in_progress")
        : globalThis.__downloadToolItems,
      pause: async () => {}, resume: async () => {}, cancel: async () => {},
      open: async () => {}, show: () => {}, erase: async ({ id }) => [id],
      onCreated: { addListener() {} },
      onChanged: { addListener() {} },
      onErased: { addListener() {} }
    },
    runtime: { sendMessage: async () => ({ ok: true, diskFileRemoved: true }) }
  };
  globalThis.__downloadToolItems = ${JSON.stringify(mockItems)};
`;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relativePath = pathname === "/" ? "popup.html" : pathname.slice(1);
  const filePath = resolve(projectDirectory, relativePath);
  if (!filePath.startsWith(`${projectDirectory}\\`) && filePath !== projectDirectory) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    let body = readFileSync(filePath);
    if (relativePath === "popup.html") {
      const html = body.toString("utf8").replace(
        '<script type="module" src="popup.js"></script>',
        `<script>${mockScript}</script><script type="module" src="popup.js"></script>`
      );
      body = Buffer.from(html);
    }
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const { port } = server.address();
mkdirSync(artifactDirectory, { recursive: true });

try {
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--user-data-dir=${profileDirectory}`,
    "--window-size=416,600",
    "--force-device-scale-factor=1",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1800",
    `--screenshot=${screenshotPath}`,
    `http://127.0.0.1:${port}/popup.html`
  ];
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(chromePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(code);
      else rejectPromise(new Error(`Chrome 截图失败（退出码 ${code}）\n${errors}`));
    });
  });
  if (exitCode === 0 && !existsSync(screenshotPath)) throw new Error("Chrome 未生成截图。");
  process.stdout.write(`${screenshotPath}\n`);
} finally {
  server.close();
  rmSync(profileDirectory, { recursive: true, force: true });
}
