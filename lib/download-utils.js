const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

const INTERRUPT_REASONS = {
  FILE_FAILED: "文件系统错误",
  FILE_ACCESS_DENIED: "没有文件写入权限",
  FILE_NO_SPACE: "磁盘空间不足",
  FILE_NAME_TOO_LONG: "文件名过长",
  FILE_TOO_LARGE: "文件过大",
  FILE_VIRUS_INFECTED: "文件可能包含病毒",
  FILE_TRANSIENT_ERROR: "文件暂时不可用",
  FILE_BLOCKED: "文件已被安全策略拦截",
  FILE_SECURITY_CHECK_FAILED: "安全检查失败",
  FILE_TOO_SHORT: "文件内容不完整",
  FILE_HASH_MISMATCH: "文件校验失败",
  NETWORK_FAILED: "网络错误",
  NETWORK_TIMEOUT: "网络超时",
  NETWORK_DISCONNECTED: "网络连接已断开",
  NETWORK_SERVER_DOWN: "服务器不可用",
  NETWORK_INVALID_REQUEST: "下载请求无效",
  SERVER_FAILED: "服务器返回错误",
  SERVER_NO_RANGE: "服务器不支持断点续传",
  SERVER_BAD_CONTENT: "服务器返回了无效内容",
  SERVER_UNAUTHORIZED: "需要登录或授权",
  SERVER_CERT_PROBLEM: "服务器证书异常",
  SERVER_FORBIDDEN: "服务器拒绝访问",
  SERVER_UNREACHABLE: "无法连接服务器",
  SERVER_CONTENT_LENGTH_MISMATCH: "文件大小与服务器声明不一致",
  SERVER_CROSS_ORIGIN_REDIRECT: "服务器重定向被拦截",
  USER_CANCELED: "已由用户取消",
  USER_SHUTDOWN: "浏览器关闭时中断",
  CRASH: "浏览器异常退出"
};

const TYPE_GROUPS = {
  PDF: new Set(["pdf"]),
  DOC: new Set(["doc", "docx", "odt", "rtf", "txt", "md"]),
  XLS: new Set(["xls", "xlsx", "ods", "csv", "tsv"]),
  PPT: new Set(["ppt", "pptx", "odp"]),
  IMG: new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"]),
  VID: new Set(["mp4", "mkv", "mov", "avi", "webm", "m4v"]),
  AUD: new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg"]),
  ZIP: new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]),
  APP: new Set(["exe", "msi", "dmg", "pkg", "deb", "rpm", "apk"]),
  CODE: new Set(["js", "ts", "jsx", "tsx", "py", "java", "go", "rs", "c", "cpp", "h", "json", "xml", "yaml", "yml"])
};

export function getFileName(path = "") {
  const normalized = String(path).replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) || "未命名文件";
}

export function getFileType(path = "") {
  const fileName = getFileName(path);
  const extension = fileName.includes(".") ? fileName.split(".").at(-1).toLowerCase() : "";
  for (const [label, extensions] of Object.entries(TYPE_GROUPS)) {
    if (extensions.has(extension)) return label;
  }
  return extension ? extension.slice(0, 4).toUpperCase() : "FILE";
}

export function getSourceHost(url = "") {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "data:") return "内嵌数据";
    if (parsed.protocol === "blob:") return "浏览器数据";
    return parsed.hostname.replace(/^www\./, "") || "未知来源";
  } catch {
    return "未知来源";
  }
}

export function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const amount = bytes / 1024 ** index;
  const digits = amount >= 100 || index === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${BYTE_UNITS[index]}`;
}

export function formatDate(value, nowValue = Date.now()) {
  const date = new Date(value);
  const now = new Date(nowValue);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const nowKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (dateKey === nowKey) return `今天 ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  if (dateKey === yesterdayKey) return `昨天 ${time}`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatRemaining(estimatedEndTime, nowValue = Date.now()) {
  const end = new Date(estimatedEndTime).getTime();
  if (!Number.isFinite(end)) return "";
  const seconds = Math.max(0, Math.round((end - nowValue) / 1000));
  if (seconds < 5) return "即将完成";
  if (seconds < 60) return `约剩 ${seconds} 秒`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `约剩 ${minutes} 分钟`;
  return `约剩 ${Math.round(minutes / 60)} 小时`;
}

export function getProgress(item) {
  const received = Math.max(0, Number(item?.bytesReceived) || 0);
  const total = Math.max(0, Number(item?.totalBytes) || 0);
  return {
    received,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, Math.round((received / total) * 100))) : null
  };
}

export function getStateKey(item) {
  if (item?.state === "complete" && item?.exists === false) return "missing";
  if (item?.state === "in_progress" && item?.paused) return "paused";
  if (item?.state === "in_progress") return "in_progress";
  if (item?.state === "complete") return "complete";
  return "interrupted";
}

export function getStateMeta(item) {
  const key = getStateKey(item);
  if (key === "missing") return { key, label: "文件已不存在", tone: "muted" };
  if (key === "paused") return { key, label: "已暂停", tone: "warning" };
  if (key === "in_progress") return { key, label: "下载中", tone: "active" };
  if (key === "complete") return { key, label: "已完成", tone: "success" };
  return {
    key,
    label: item?.error === "USER_CANCELED" ? "已取消" : "下载失败",
    tone: "danger",
    reason: INTERRUPT_REASONS[item?.error] || "下载被中断"
  };
}

export function matchesFilter(item, filter) {
  const key = getStateKey(item);
  if (!filter || filter === "all") return true;
  if (filter === "active") return key === "in_progress" || key === "paused";
  if (filter === "complete") return key === "complete" || key === "missing";
  if (filter === "interrupted") return key === "interrupted";
  return true;
}

export function matchesSearch(item, query) {
  const normalized = String(query || "").trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  const haystack = [
    getFileName(item?.filename),
    item?.filename,
    item?.url,
    item?.finalUrl,
    getSourceHost(item?.finalUrl || item?.url)
  ]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase("zh-CN");
  return haystack.includes(normalized);
}

export function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const timeDifference = new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime();
    return timeDifference || Number(b.id) - Number(a.id);
  });
}

export function getDangerLabel(danger) {
  if (!danger || danger === "safe" || danger === "accepted") return "";
  return "Chrome 标记此文件可能不安全";
}

export function getDisplaySize(item) {
  const size = Number(item?.fileSize) > 0 ? item.fileSize : item?.totalBytes;
  return formatBytes(size);
}
