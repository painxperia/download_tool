import {
  formatBytes,
  formatDate,
  formatRemaining,
  getDangerLabel,
  getDisplaySize,
  getFileName,
  getFileType,
  getProgress,
  getSourceHost,
  getStateKey,
  getStateMeta,
  matchesFilter,
  matchesSearch,
  sortNewestFirst
} from "./lib/download-utils.js";

const PAGE_SIZE = 24;
const MAX_RESULTS = 1000;

const ICONS = {
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9"/><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h7l2-2h3.5A2.5 2.5 0 0 1 18 8v1H6a3 3 0 0 0-3 3V7.5Z"/><path d="M5.5 9h14a1.5 1.5 0 0 1 1.44 1.91l-2 7A1.5 1.5 0 0 1 17.5 19h-13a1.5 1.5 0 0 1-1.44-1.91l2-7A1.5 1.5 0 0 1 5.5 9Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/></svg>'
};

const state = {
  items: [],
  filter: "all",
  query: "",
  visibleLimit: PAGE_SIZE,
  loading: true,
  initialized: false,
  loadError: "",
  busyActions: new Map(),
  itemErrors: new Map(),
  speedSamples: new Map(),
  toastTimer: null,
  changeVersion: 0
};

const elements = {
  headerSummary: document.querySelector("#headerSummary"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  content: document.querySelector("#content"),
  skeletonState: document.querySelector("#skeletonState"),
  errorState: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  retryButton: document.querySelector("#retryButton"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyDescription: document.querySelector("#emptyDescription"),
  downloadList: document.querySelector("#downloadList"),
  appFooter: document.querySelector("#appFooter"),
  resultCount: document.querySelector("#resultCount"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  toastRegion: document.querySelector("#toastRegion"),
  confirmDialog: document.querySelector("#confirmDialog"),
  dialogIcon: document.querySelector("#dialogIcon"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogDescription: document.querySelector("#dialogDescription"),
  dialogNote: document.querySelector("#dialogNote"),
  dialogCancelButton: document.querySelector("#dialogCancelButton"),
  dialogConfirmButton: document.querySelector("#dialogConfirmButton")
};

function setHidden(element, hidden) {
  element.hidden = hidden;
}

function getFilteredItems() {
  return sortNewestFirst(state.items).filter(
    (item) => matchesFilter(item, state.filter) && matchesSearch(item, state.query)
  );
}

function render() {
  const activeCount = state.items.filter((item) => getStateKey(item) === "in_progress" || getStateKey(item) === "paused").length;
  elements.headerSummary.textContent = activeCount
    ? `${activeCount} 个下载任务进行中`
    : state.initialized
      ? `${state.items.length} 条下载记录`
      : "Chrome 下载管理器";

  elements.clearSearchButton.hidden = !state.query;
  elements.refreshButton.classList.toggle("is-spinning", state.loading && state.initialized);
  elements.refreshButton.disabled = state.loading || state.busyActions.size > 0;
  elements.content.setAttribute("aria-busy", String(state.loading));

  for (const button of elements.filterButtons) {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  setHidden(elements.skeletonState, !(state.loading && !state.initialized));
  setHidden(elements.errorState, !state.loadError);
  if (state.loadError) elements.errorMessage.textContent = state.loadError;

  if (!state.initialized || state.loadError) {
    setHidden(elements.emptyState, true);
    setHidden(elements.downloadList, true);
    setHidden(elements.appFooter, true);
    return;
  }

  const filteredItems = getFilteredItems();
  const hasResults = filteredItems.length > 0;
  setHidden(elements.emptyState, hasResults);
  setHidden(elements.downloadList, !hasResults);
  setHidden(elements.appFooter, !hasResults);

  if (!hasResults) {
    const isFiltering = Boolean(state.query) || state.filter !== "all";
    elements.emptyTitle.textContent = isFiltering ? "没有找到匹配的下载" : "还没有下载记录";
    elements.emptyDescription.textContent = isFiltering
      ? "试试其他关键词或切换筛选条件。"
      : "使用 Chrome 下载文件后，会自动显示在这里。";
    return;
  }

  const visibleItems = filteredItems.slice(0, state.visibleLimit);
  const focusSnapshot = captureListFocus();
  const fragment = document.createDocumentFragment();
  for (const item of visibleItems) fragment.append(renderDownloadItem(item));
  elements.downloadList.replaceChildren(fragment);
  restoreListFocus(focusSnapshot);

  elements.resultCount.textContent = visibleItems.length < filteredItems.length
    ? `已显示 ${visibleItems.length} / ${filteredItems.length} 项`
    : `共 ${filteredItems.length} 项`;
  elements.loadMoreButton.hidden = visibleItems.length >= filteredItems.length;
}

function renderDownloadItem(item) {
  const status = getStateMeta(item);
  const stateKey = status.key;
  const busyAction = state.busyActions.get(item.id);
  const listItem = document.createElement("li");
  listItem.className = "download-card";
  listItem.dataset.id = String(item.id);
  listItem.dataset.state = stateKey;
  listItem.setAttribute("aria-busy", String(Boolean(busyAction)));

  const fileBadge = document.createElement("span");
  fileBadge.className = "file-badge";
  fileBadge.textContent = getFileType(item.filename);
  fileBadge.setAttribute("aria-hidden", "true");

  const main = document.createElement("div");
  main.className = "download-main";

  const heading = document.createElement("div");
  heading.className = "download-heading";
  const fileName = document.createElement("h2");
  fileName.className = "download-name";
  fileName.textContent = getFileName(item.filename);
  fileName.title = item.filename || getFileName(item.filename);
  const statusPill = document.createElement("span");
  statusPill.className = "status-pill";
  statusPill.dataset.tone = status.tone;
  statusPill.textContent = status.label;
  heading.append(fileName, statusPill);

  const meta = document.createElement("div");
  meta.className = "download-meta";
  const source = document.createElement("span");
  source.className = "source";
  source.textContent = getSourceHost(item.finalUrl || item.url);
  source.title = item.finalUrl || item.url || "未知来源";
  const size = document.createElement("span");
  size.className = "meta-dot";
  size.textContent = ` ${getDisplaySize(item)}`;
  const date = document.createElement("span");
  date.className = "meta-dot";
  date.textContent = ` ${formatDate(item.startTime)}`;
  meta.append(source, size, date);

  main.append(heading, meta);

  if (stateKey === "in_progress" || stateKey === "paused") {
    main.append(renderProgress(item));
  } else if (stateKey === "interrupted") {
    const detail = document.createElement("div");
    detail.className = "download-detail is-error";
    detail.textContent = status.reason;
    main.append(detail);
  }

  const dangerLabel = getDangerLabel(item.danger);
  if (dangerLabel) {
    const dangerNote = document.createElement("div");
    dangerNote.className = "download-detail danger-note";
    dangerNote.textContent = dangerLabel;
    main.append(dangerNote);
  }

  const itemError = state.itemErrors.get(item.id);
  if (itemError) {
    const error = document.createElement("p");
    error.className = "item-error";
    error.textContent = itemError;
    main.append(error);
  }

  main.append(renderActions(item, stateKey, busyAction));
  listItem.append(fileBadge, main);
  return listItem;
}

function renderProgress(item) {
  const progress = getProgress(item);
  const wrapper = document.createElement("div");
  const detail = document.createElement("div");
  detail.className = "download-detail";

  const parts = [];
  if (progress.total > 0) {
    parts.push(`${formatBytes(progress.received)} / ${formatBytes(progress.total)}`);
  } else {
    parts.push(`${formatBytes(progress.received)} / 大小未知`);
  }

  const sample = state.speedSamples.get(item.id);
  if (!item.paused && sample?.speed > 0) parts.push(`${formatBytes(sample.speed)}/s`);
  const remaining = !item.paused ? formatRemaining(item.estimatedEndTime) : "";
  if (remaining) parts.push(remaining);
  if (progress.percent !== null) parts.push(`${progress.percent}%`);
  detail.textContent = parts.join(" · ");

  const track = document.createElement("div");
  track.className = "progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", `${getFileName(item.filename)} 下载进度`);
  const bar = document.createElement("div");
  bar.className = "progress-bar";
  if (progress.percent === null) {
    track.classList.add("is-indeterminate");
    track.removeAttribute("aria-valuenow");
  } else {
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(progress.percent));
    bar.style.width = `${progress.percent}%`;
  }
  track.append(bar);
  wrapper.append(detail, track);
  return wrapper;
}

function renderActions(item, stateKey, busyAction) {
  const actions = document.createElement("div");
  actions.className = "download-actions";

  if (stateKey === "in_progress") {
    actions.append(createActionButton("pause", "暂停下载", ICONS.pause, item.id, busyAction, "is-primary"));
    actions.append(createActionButton("cancel", "取消下载", ICONS.cancel, item.id, busyAction, "is-danger"));
    return actions;
  }

  if (stateKey === "paused") {
    actions.append(createActionButton("resume", "继续下载", ICONS.play, item.id, busyAction, "is-primary", !item.canResume));
    actions.append(createActionButton("cancel", "取消下载", ICONS.cancel, item.id, busyAction, "is-danger"));
    return actions;
  }

  if (stateKey === "complete") {
    actions.append(createActionButton("open", "打开文件", ICONS.open, item.id, busyAction, "is-primary"));
    actions.append(createActionButton("show", "在文件夹中显示", ICONS.folder, item.id, busyAction));
    actions.append(createActionButton("delete", "删除磁盘文件和下载记录", ICONS.trash, item.id, busyAction, "is-danger"));
    return actions;
  }

  if (stateKey === "missing") {
    actions.append(createActionButton("erase", "移除失效的下载记录", ICONS.trash, item.id, busyAction, "is-danger"));
    return actions;
  }

  if (item.canResume) {
    actions.append(createActionButton("resume", "重试下载", ICONS.play, item.id, busyAction, "is-primary"));
  }
  if (item.exists) {
    actions.append(createActionButton("show", "在文件夹中显示", ICONS.folder, item.id, busyAction));
    actions.append(createActionButton("erase", "仅移除记录（不会删除未完成文件）", ICONS.trash, item.id, busyAction, "is-danger"));
  } else {
    actions.append(createActionButton("erase", "移除下载记录", ICONS.trash, item.id, busyAction, "is-danger"));
  }
  return actions;
}

function createActionButton(action, label, icon, id, busyAction, extraClass = "", forceDisabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `item-action ${extraClass}`.trim();
  button.dataset.action = action;
  button.dataset.id = String(id);
  const isCardBusy = Boolean(busyAction);
  const isThisActionBusy = busyAction === action;
  button.setAttribute("aria-label", isThisActionBusy ? `${label}，正在处理` : label);
  button.title = label;
  button.disabled = forceDisabled;
  if (isCardBusy || state.loading) button.setAttribute("aria-disabled", "true");
  if (isThisActionBusy) button.classList.add("is-busy");
  button.innerHTML = isThisActionBusy ? ICONS.spinner : icon;
  return button;
}

function captureListFocus() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !activeElement.matches("button[data-action][data-id]")) return null;
  return { id: activeElement.dataset.id, action: activeElement.dataset.action };
}

function restoreListFocus(snapshot) {
  if (!snapshot) return;
  const button = [...elements.downloadList.querySelectorAll("button[data-action][data-id]")].find(
    (candidate) => candidate.dataset.id === snapshot.id && candidate.dataset.action === snapshot.action
  );
  const fallback = [...elements.downloadList.querySelectorAll("button[data-action][data-id]")].find(
    (candidate) => candidate.dataset.id === snapshot.id
  );
  (button || fallback)?.focus({ preventScroll: true });
}

async function loadDownloads({ showToastOnSuccess = false } = {}) {
  if ((state.loading && state.initialized) || state.busyActions.size > 0) return;
  const changeVersionAtStart = state.changeVersion;
  let retryAfterChanges = false;
  state.loading = true;
  state.loadError = "";
  render();
  try {
    const items = await chrome.downloads.search({
      orderBy: ["-startTime"],
      limit: MAX_RESULTS
    });
    if (changeVersionAtStart !== state.changeVersion) {
      retryAfterChanges = true;
      return;
    }
    state.items = items;
    updateSpeedSamples(items.filter((item) => item.state === "in_progress"));
    state.initialized = true;
    if (showToastOnSuccess) showToast("下载列表已刷新");
  } catch (error) {
    state.loadError = friendlyError(error, "读取下载记录失败");
  } finally {
    state.loading = false;
    render();
    if (retryAfterChanges) window.setTimeout(() => void loadDownloads(), 0);
  }
}

async function refreshActiveDownloads() {
  if (!state.initialized || state.loading) return;
  try {
    const activeItems = await chrome.downloads.search({ state: "in_progress" });
    const previousActiveItems = state.items.filter((item) => item.state === "in_progress");
    const activeById = new Map(activeItems.map((item) => [item.id, item]));
    if (previousActiveItems.some((item) => !activeById.has(item.id))) {
      await loadDownloads();
      return;
    }
    const hasVisibleChange = activeItems.some((item) => {
      const previous = state.items.find((candidate) => candidate.id === item.id);
      return !previous
        || previous.bytesReceived !== item.bytesReceived
        || previous.totalBytes !== item.totalBytes
        || previous.estimatedEndTime !== item.estimatedEndTime
        || previous.paused !== item.paused
        || previous.canResume !== item.canResume;
    });
    updateSpeedSamples(activeItems);
    if (!hasVisibleChange) return;
    state.items = state.items.map((item) => activeById.get(item.id) || item);
    for (const item of activeItems) {
      if (!state.items.some((existing) => existing.id === item.id)) state.items.push(item);
    }
    render();
  } catch {
    // 下次完整刷新或事件更新会重新同步。
  }
}

function updateSpeedSamples(activeItems) {
  const now = Date.now();
  const activeIds = new Set(activeItems.map((item) => item.id));
  for (const item of activeItems) {
    const previous = state.speedSamples.get(item.id);
    let speed = previous?.speed || 0;
    if (previous && now > previous.time && item.bytesReceived >= previous.bytes && !item.paused) {
      const currentSpeed = ((item.bytesReceived - previous.bytes) * 1000) / (now - previous.time);
      speed = speed > 0 ? speed * 0.45 + currentSpeed * 0.55 : currentSpeed;
    }
    state.speedSamples.set(item.id, { bytes: item.bytesReceived, time: now, speed });
  }
  for (const id of state.speedSamples.keys()) {
    if (!activeIds.has(id)) state.speedSamples.delete(id);
  }
}

function mergeDownloadDelta(delta) {
  state.changeVersion += 1;
  const index = state.items.findIndex((item) => item.id === delta.id);
  if (index === -1) {
    void loadDownloads();
    return;
  }
  const updated = { ...state.items[index] };
  for (const [key, change] of Object.entries(delta)) {
    if (key === "id" || !change || !("current" in change)) continue;
    updated[key] = change.current;
  }
  state.items.splice(index, 1, updated);
  if (updated.state !== "in_progress") state.speedSamples.delete(updated.id);
  render();
}

async function handleAction(action, id) {
  if (state.loading || state.busyActions.has(id)) return;
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  state.itemErrors.delete(id);

  if (action === "delete") {
    await requestDelete(item);
    return;
  }
  if (action === "erase") {
    await requestErase(item);
    return;
  }
  if (action === "cancel") {
    await requestCancel(item);
    return;
  }

  await withBusy(id, action, async () => {
    if (action === "open") {
      await chrome.downloads.open(id);
      return;
    }
    if (action === "show") {
      chrome.downloads.show(id);
      return;
    }
    if (action === "pause") {
      await chrome.downloads.pause(id);
      showToast("下载已暂停");
      return;
    }
    if (action === "resume") {
      await chrome.downloads.resume(id);
      showToast("下载已继续");
    }
  }, actionErrorMessage(action));
}

async function requestDelete(item) {
  const stateKey = getStateKey(item);
  if (stateKey === "in_progress" || stateKey === "paused") {
    setItemError(item.id, "正在下载的文件不能直接删除，请先取消下载。Chrome 会负责清理临时文件。");
    return;
  }
  if (item.state !== "complete") {
    setItemError(item.id, item.canResume
      ? "Chrome 只允许扩展删除已完成的文件。请先重试并完成下载。"
      : "Chrome 不允许扩展删除未完成的文件；请在文件夹中手动处理后再移除记录。");
    return;
  }

  const confirmed = await showConfirm({
    title: "删除磁盘文件？",
    description: `“${getFileName(item.filename)}”将从电脑中删除，同时从 Chrome 下载记录中移除。`,
    note: "此操作无法在插件中撤销。",
    confirmLabel: "删除文件",
    tone: "danger"
  });
  if (!confirmed) return;

  let diskFileRemoved = false;
  await withBusy(item.id, "delete", async () => {
    const result = await chrome.runtime.sendMessage({
      type: "delete-file-and-record",
      downloadId: item.id
    });
    diskFileRemoved = Boolean(result?.diskFileRemoved);
    if (diskFileRemoved) {
      const localItem = state.items.find((candidate) => candidate.id === item.id);
      if (localItem) localItem.exists = false;
    }
    if (!result?.ok) throw new Error(result?.error || "删除失败");
    removeLocalItem(item.id);
    showToast("文件和下载记录已删除");
  }, () => diskFileRemoved
    ? "磁盘文件已删除，但下载记录移除失败。请刷新后重试移除记录。"
    : "无法删除磁盘文件。文件可能已移动、正在使用，或当前没有删除权限。下载记录已保留。"
  );
}

async function requestErase(item) {
  const confirmed = await showConfirm({
    title: "移除下载记录？",
    description: item.exists === false
      ? `磁盘中已找不到“${getFileName(item.filename)}”，将仅移除这条失效记录。`
      : `将从 Chrome 下载记录中移除“${getFileName(item.filename)}”。`,
    note: item.exists === false ? "不会删除其他磁盘文件。" : "该操作不会删除磁盘上的文件。",
    confirmLabel: "移除记录",
    tone: "danger"
  });
  if (!confirmed) return;

  await withBusy(item.id, "erase", async () => {
    const erasedIds = await chrome.downloads.erase({ id: item.id });
    if (!erasedIds.includes(item.id)) throw new Error("下载记录未能移除");
    removeLocalItem(item.id);
    showToast("下载记录已移除");
  }, "无法移除下载记录，请重试。");
}

async function requestCancel(item) {
  const confirmed = await showConfirm({
    title: "取消下载？",
    description: `“${getFileName(item.filename)}”将停止下载，当前进度可能会丢失。`,
    note: "Chrome 会负责清理下载中的临时文件。",
    confirmLabel: "取消下载",
    tone: "neutral"
  });
  if (!confirmed) return;

  await withBusy(item.id, "cancel", async () => {
    await chrome.downloads.cancel(item.id);
    showToast("下载已取消");
    await loadDownloads();
  }, "无法取消下载，任务可能已经结束。");
}

async function withBusy(id, action, operation, errorMessage) {
  state.changeVersion += 1;
  state.busyActions.set(id, action);
  state.itemErrors.delete(id);
  render();
  try {
    await operation();
  } catch (error) {
    const message = typeof errorMessage === "function"
      ? errorMessage(error)
      : friendlyError(error, errorMessage || "操作失败，请重试。");
    state.itemErrors.set(id, message);
    showToast(message, true);
  } finally {
    state.busyActions.delete(id);
    render();
  }
}

function setItemError(id, message) {
  state.itemErrors.set(id, message);
  showToast(message, true);
  render();
}

function removeLocalItem(id) {
  state.changeVersion += 1;
  state.items = state.items.filter((item) => item.id !== id);
  state.itemErrors.delete(id);
  state.speedSamples.delete(id);
}

function actionErrorMessage(action) {
  const messages = {
    open: "无法打开文件。文件可能已经移动或被删除。",
    show: "无法在文件夹中显示该文件。",
    pause: "无法暂停下载，任务可能已经结束。",
    resume: "无法继续下载，下载链接可能已经失效。"
  };
  return messages[action] || "操作失败，请重试。";
}

function friendlyError(error, fallback) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (/permission|not allowed/i.test(raw)) return "扩展没有执行此操作所需的权限。";
  if (/not found|invalid/i.test(raw)) return "找不到对应的下载任务，请刷新后重试。";
  return fallback || raw || "操作失败，请重试。";
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.replaceChildren(toast);
  state.toastTimer = window.setTimeout(() => elements.toastRegion.replaceChildren(), 2600);
}

function showConfirm({ title, description, note, confirmLabel, tone }) {
  elements.dialogTitle.textContent = title;
  elements.dialogDescription.textContent = description;
  elements.dialogNote.textContent = note;
  elements.dialogConfirmButton.textContent = confirmLabel;
  elements.dialogIcon.classList.toggle("is-neutral", tone === "neutral");
  elements.dialogIcon.innerHTML = tone === "neutral" ? ICONS.cancel : ICONS.trash;
  elements.confirmDialog.returnValue = "";
  elements.confirmDialog.showModal();
  window.setTimeout(() => elements.dialogCancelButton.focus(), 0);

  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener("close", () => {
      resolve(elements.confirmDialog.returnValue === "confirm");
    }, { once: true });
  });
}

elements.refreshButton.addEventListener("click", () => void loadDownloads({ showToastOnSuccess: true }));
elements.retryButton.addEventListener("click", () => void loadDownloads());
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.currentTarget.value;
  state.visibleLimit = PAGE_SIZE;
  render();
});
elements.clearSearchButton.addEventListener("click", () => {
  elements.searchInput.value = "";
  state.query = "";
  state.visibleLimit = PAGE_SIZE;
  elements.searchInput.focus();
  render();
});
for (const button of elements.filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    state.visibleLimit = PAGE_SIZE;
    elements.content.scrollTop = 0;
    render();
  });
}
elements.loadMoreButton.addEventListener("click", () => {
  state.visibleLimit += PAGE_SIZE;
  render();
});
elements.downloadList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
  void handleAction(button.dataset.action, Number(button.dataset.id));
});

chrome.downloads.onCreated.addListener((item) => {
  state.changeVersion += 1;
  if (!state.items.some((existing) => existing.id === item.id)) state.items.unshift(item);
  render();
});
chrome.downloads.onChanged.addListener(mergeDownloadDelta);
chrome.downloads.onErased.addListener((id) => {
  removeLocalItem(id);
  render();
});

const activeRefreshTimer = window.setInterval(refreshActiveDownloads, 900);
const fullRefreshTimer = window.setInterval(() => void loadDownloads(), 12_000);
window.addEventListener("unload", () => {
  window.clearInterval(activeRefreshTimer);
  window.clearInterval(fullRefreshTimer);
});

void loadDownloads();
