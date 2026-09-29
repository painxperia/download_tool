# download-tool

一个零依赖的 Chrome Manifest V3 下载管理扩展。网页仍由 Chrome 原生下载机制负责；扩展读取同一份下载记录，提供更紧凑的查看和管理界面。

需要 Chrome 123 或更高版本。

## 功能

- 查看最近 1000 条 Chrome 下载记录，支持实时进度、速度和预计剩余时间
- 按“全部 / 下载中 / 已完成 / 失败或取消”筛选，并可搜索文件名、路径或来源站点
- 暂停、继续、取消下载
- 打开已完成文件、在系统文件夹中定位文件
- 删除已完成的磁盘文件，并在成功后移除对应 Chrome 下载记录
- 对磁盘文件已不存在的项目，仅移除失效记录
- 工具栏徽标显示当前进行中的下载任务数量

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions/`。
2. 打开页面右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `download-tool`。
5. 可在扩展菜单中把 `download-tool` 固定到工具栏。

修改源码后，在 `chrome://extensions/` 中点击本扩展的刷新按钮即可更新。

## 删除行为

删除已完成项目时，扩展严格按以下顺序执行：

1. `chrome.downloads.removeFile(id)` 删除 Chrome 下载记录所指向的真实磁盘文件。
2. 磁盘删除成功后，`chrome.downloads.erase({ id })` 移除 Chrome 下载记录。

如果磁盘文件删除失败，下载记录会保留，方便用户定位问题并重试。不会出现“先隐藏记录、但磁盘文件仍残留”的静默失败。

Chrome 的安全限制只允许扩展通过 Downloads API 删除“下载已完成且文件仍存在”的文件，不能借此删除任意路径，也不能直接删除未完成或中断的临时文件。下载中的项目应使用“取消”，由 Chrome 清理临时文件；无法继续的中断项目需要在文件夹中手动处理。

## 权限

- `downloads`：读取下载记录，以及暂停、继续、取消、定位、删除文件和移除记录。
- `downloads.open`：响应用户点击打开已完成文件。

扩展没有主机权限，不读取网页内容，不上传下载记录，也不访问网络。

实现依据：[Chrome Downloads API 官方参考](https://developer.chrome.com/docs/extensions/reference/api/downloads)。

## 开发与测试

不需要安装依赖。使用 Node.js 运行工具函数测试：

```powershell
npm test
```

重新生成工具栏 PNG 图标：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-icons.ps1
```

使用本机 Chrome 和模拟下载数据生成 Popup 视觉检查截图：

```powershell
npm run test:visual
```
