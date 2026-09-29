import { deleteFileAndRecord } from "./lib/download-actions.js";

let badgeUpdateTimer = null;
let badgeUpdateVersion = 0;

async function updateBadge(version) {
  try {
    const activeDownloads = await chrome.downloads.search({ state: "in_progress" });
    if (version !== badgeUpdateVersion) return;
    const count = activeDownloads.length;
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color: "#2563eb" }),
      chrome.action.setBadgeText({ text: count ? (count > 99 ? "99+" : String(count)) : "" }),
      chrome.action.setTitle({
        title: count ? `download-tool · ${count} 个下载任务进行中` : "download-tool"
      })
    ]);
  } catch {
    // Chrome 启动或退出期间，Downloads API 可能暂时不可用。
  }
}

function scheduleBadgeUpdate() {
  badgeUpdateVersion += 1;
  const version = badgeUpdateVersion;
  clearTimeout(badgeUpdateTimer);
  badgeUpdateTimer = setTimeout(() => void updateBadge(version), 80);
}

chrome.runtime.onInstalled.addListener(scheduleBadgeUpdate);
chrome.runtime.onStartup.addListener(scheduleBadgeUpdate);
chrome.downloads.onCreated.addListener(scheduleBadgeUpdate);
chrome.downloads.onChanged.addListener(scheduleBadgeUpdate);
chrome.downloads.onErased.addListener(scheduleBadgeUpdate);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "delete-file-and-record") return false;
  const downloadId = Number(message.downloadId);
  if (!Number.isInteger(downloadId) || downloadId < 0) {
    sendResponse({ ok: false, diskFileRemoved: false, error: "下载任务编号无效" });
    return false;
  }

  void deleteFileAndRecord(downloadId, chrome.downloads).then(sendResponse);
  return true;
});

scheduleBadgeUpdate();
