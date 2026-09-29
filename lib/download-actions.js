export async function deleteFileAndRecord(downloadId, downloadsApi) {
  let diskFileRemoved = false;
  try {
    await downloadsApi.removeFile(downloadId);
    diskFileRemoved = true;
    const erasedIds = await downloadsApi.erase({ id: downloadId });
    if (!erasedIds.includes(downloadId)) {
      throw new Error("下载记录未能移除");
    }
    return { ok: true, diskFileRemoved: true };
  } catch (error) {
    return {
      ok: false,
      diskFileRemoved,
      error: error instanceof Error ? error.message : String(error || "删除失败")
    };
  }
}
