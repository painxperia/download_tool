import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  formatRemaining,
  getFileName,
  getFileType,
  getProgress,
  getSourceHost,
  getStateKey,
  getStateMeta,
  matchesFilter,
  matchesSearch,
  sortNewestFirst
} from "../lib/download-utils.js";

test("从 Windows 和 POSIX 路径提取文件名", () => {
  assert.equal(getFileName("C:\\Users\\demo\\Downloads\\report.pdf"), "report.pdf");
  assert.equal(getFileName("/tmp/archive.zip"), "archive.zip");
  assert.equal(getFileName(""), "未命名文件");
});

test("识别常见文件类型", () => {
  assert.equal(getFileType("report.pdf"), "PDF");
  assert.equal(getFileType("photo.webp"), "IMG");
  assert.equal(getFileType("source.ts"), "CODE");
  assert.equal(getFileType("something.custom"), "CUST");
});

test("格式化文件大小", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.00 KB");
  assert.equal(formatBytes(10 * 1024 * 1024), "10.0 MB");
  assert.equal(formatBytes(-1), "—");
});

test("计算并限制下载百分比", () => {
  assert.deepEqual(getProgress({ bytesReceived: 50, totalBytes: 200 }), {
    received: 50,
    total: 200,
    percent: 25
  });
  assert.equal(getProgress({ bytesReceived: 300, totalBytes: 200 }).percent, 100);
  assert.equal(getProgress({ bytesReceived: 20, totalBytes: 0 }).percent, null);
});

test("把下载状态映射为界面状态", () => {
  assert.equal(getStateKey({ state: "in_progress", paused: false }), "in_progress");
  assert.equal(getStateKey({ state: "in_progress", paused: true }), "paused");
  assert.equal(getStateKey({ state: "complete", exists: true }), "complete");
  assert.equal(getStateKey({ state: "complete", exists: false }), "missing");
  assert.equal(getStateMeta({ state: "interrupted", error: "NETWORK_TIMEOUT" }).reason, "网络超时");
});

test("筛选和搜索文件名、路径与来源", () => {
  const item = {
    filename: "C:\\Downloads\\manual.pdf",
    finalUrl: "https://docs.example.com/manual.pdf",
    state: "complete",
    exists: true
  };
  assert.equal(matchesFilter(item, "complete"), true);
  assert.equal(matchesFilter(item, "active"), false);
  assert.equal(matchesSearch(item, "MANUAL"), true);
  assert.equal(matchesSearch(item, "docs.example.com"), true);
  assert.equal(matchesSearch(item, "missing"), false);
});

test("解析来源域名并按时间倒序排序", () => {
  assert.equal(getSourceHost("https://www.example.com/path"), "example.com");
  assert.equal(getSourceHost("not a url"), "未知来源");
  const sorted = sortNewestFirst([
    { id: 1, startTime: "2025-01-01T00:00:00Z" },
    { id: 2, startTime: "2026-01-01T00:00:00Z" }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), [2, 1]);
});

test("格式化预计剩余时间", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(formatRemaining("2026-01-01T00:00:03Z", now), "即将完成");
  assert.equal(formatRemaining("2026-01-01T00:00:30Z", now), "约剩 30 秒");
  assert.equal(formatRemaining("2026-01-01T00:10:00Z", now), "约剩 10 分钟");
});
