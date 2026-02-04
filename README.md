# 局域网剪切板

同一局域网内多设备共享剪切板：支持文字（自动识别链接）、图片与视频上传，并可预览图片/视频。适合在飞牛 OS 等 NAS/服务器上通过 Docker 部署。

## 功能

- **文字**：输入或粘贴后发送，实时同步到所有打开页面的设备
- **链接识别**：文字中的 URL 自动渲染为可点击链接
- **图片 / 视频**：上传后同步展示，支持在列表内预览；点击可弹窗大图/全屏播放

## 本地运行

```bash
npm install
npm start
```

浏览器访问 `http://localhost:3846`（端口可在环境变量 `PORT` 中修改）。

## Docker 部署（含飞牛 OS）

### 方式一：docker-compose（推荐）

```bash
docker compose up -d
```

访问 `http://<主机IP>:3846`。

**数据目录**：所有数据（历史记录 `clipboard.json` + 上传文件）都落在 **`./data`**，与 docker-compose 同目录，便于备份和迁移。

### 方式二：使用 GitHub Actions 构建的镜像（飞牛 OS 等）

推送代码到 GitHub 后，Actions 会自动构建并推送到 **GitHub Container Registry (ghcr.io)**。在飞牛 OS 的「容器」里拉取并部署：

```bash
# 替换 your-username/Clipboard 为你的 GitHub 仓库名
docker pull ghcr.io/your-username/Clipboard:latest

# 使用当前目录下的 ./data 持久化（推荐）
docker run -d --name lan-clipboard -p 3846:3846 \
  -v ./data:/app/data \
  --restart unless-stopped \
  ghcr.io/your-username/Clipboard:latest
```

- **端口**：映射 **3846**。
- **卷**：挂载 **`./data`** 到容器内 `/app/data`，历史与上传文件都会保存在宿主机 `./data` 下。
- 局域网访问：`http://<飞牛OS的IP>:3846`。

**拉取报 `unauthorized` 时**：GitHub 默认把 Actions 构建的镜像设为私有。请打开仓库 → 右侧 **Packages**（或 `https://github.com/lidachui1998/Clipboard/pkgs/container/clipboard`）→ 进入该 package → **Package settings** → **Change visibility** 改为 **Public**，保存后即可无需登录拉取。

## 环境变量

| 变量   | 说明     | 默认值 |
|--------|----------|--------|
| `PORT` | 服务端口 | 3846   |

## 技术栈

- Node.js + Express
- Socket.io 实时同步
- 前端：原生 JS，深色主题
