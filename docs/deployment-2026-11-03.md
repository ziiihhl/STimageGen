# 服务端部署记录

日期：2026-11-03（Asia/Shanghai）。先完成服务端部署，随后按用户追加要求安装前端。

## 线上位置

- 酒馆插件：`/data/sillytavern/plugins/stimagegen/`。
- 私有配置：`/data/sillytavern/config/stimagegen.json`，权限600。
- 生图服务独立凭据：`/opt/comfy-gen-service/data/stimagegen.key`，权限600，未传到浏览器或仓库。
- 服务授权模块：`/opt/comfy-gen-service/app/stbridge_access.py`，保留原stbridge.key原有权限，新增stimagegen.key的提示词生成权限。
- Nginx：`/etc/nginx/sites-available/sillytavern`，新增精确路由 `/api/plugins/stimagegen/service`，160秒读取超时。
- 备份：`/var/backups/stimagegen-backend-20261103T085418Z`，包含原授权模块和Nginx配置。

## 验证

- 部署前无活动绘图任务；真实ST容器7项测试通过。
- 独立凭据白名单检查通过；旧凭据不能调用新增提示词授权；浏览器不能使用服务间凭据。
- 酒馆加载新插件；服务正常启动；Nginx检查通过。
- 公网未经登录/CSRF的请求返回403。
- 现有工作流接口调用成功，Colab离线时返回本地2个工作流及上游警告。
- 插件代码哈希与本地一致；未安装或修改酒馆前端扩展，原API Bridge保留。

Colab隧道端口18188在部署核查时未连通，因此尚不能验证完整绘图链路。真实提示词接口调用返回502：现有生图服务访问 `https://api.venice.ai/api/v1/chat/completions` 时出现 ReadTimeout，未生成对应提示词历史记录。独立授权已通过，LLM调用需要服务上游恢复后复测；未重复提交模型请求，也未修改原LLM配置。

## 下一步

前端已安装于 `/data/sillytavern/extensions/STimageGen/`，版本1.0.0。公网 manifest 和4个静态资源逐个校验SHA256通过，酒馆启动时间不变。前端安装记录位于 `/var/backups/stimagegen-frontend-20261103T090922Z`。刷新页面即可加载，前端不需要填写服务凭据。工作流由面板选择；此部署不设默认值、不改模型或工作流。GitHub推送与自动更新仍未配置。

真实浏览器浮窗外观和交互需刷新后验证；前端静态资源可访问不代表上游LLM或Colab已恢复。
