import test from "node:test";
import assert from "node:assert/strict";

import { deleteFileAndRecord } from "../lib/download-actions.js";

test("先删除磁盘文件，再移除下载记录", async () => {
  const calls = [];
  const api = {
    async removeFile(id) {
      calls.push(["removeFile", id]);
    },
    async erase(query) {
      calls.push(["erase", query]);
      return [42];
    }
  };

  const result = await deleteFileAndRecord(42, api);
  assert.deepEqual(calls, [["removeFile", 42], ["erase", { id: 42 }]]);
  assert.deepEqual(result, { ok: true, diskFileRemoved: true });
});

test("磁盘文件删除失败时保留下载记录", async () => {
  let eraseCalled = false;
  const api = {
    async removeFile() {
      throw new Error("file in use");
    },
    async erase() {
      eraseCalled = true;
      return [42];
    }
  };

  const result = await deleteFileAndRecord(42, api);
  assert.equal(eraseCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.diskFileRemoved, false);
});

test("记录移除失败时报告磁盘文件已删除", async () => {
  const api = {
    async removeFile() {},
    async erase() {
      throw new Error("history unavailable");
    }
  };

  const result = await deleteFileAndRecord(42, api);
  assert.equal(result.ok, false);
  assert.equal(result.diskFileRemoved, true);
  assert.match(result.error, /history unavailable/);
});

test("erase 未命中记录时视为失败", async () => {
  const api = {
    async removeFile() {},
    async erase() {
      return [];
    }
  };

  const result = await deleteFileAndRecord(42, api);
  assert.deepEqual(result, {
    ok: false,
    diskFileRemoved: true,
    error: "下载记录未能移除"
  });
});
