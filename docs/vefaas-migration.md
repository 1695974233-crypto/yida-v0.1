# 易搭 v0.1 veFaaS 迁移说明

## 当前状态

- veFaaS 应用：`yida-wardrobe`
- 区域：`cn-beijing`
- 应用 ID：`5a633b9cd680`
- 函数 ID：`apv3rdwq`
- 国内预发布地址：`https://s877em6sdkp7rquqv523o.apigateway-cn-beijing.volceapi.com/`
- 资源规格：0.5 vCPU / 1 GB，最小实例数 0，最大实例数 5
- 数据与认证：Supabase Auth、Postgres、Storage
- AI：火山方舟 Seed 2.0 Lite 与 Seedream 5.0 Lite

旧的 ChatGPT Sites 地址在迁移期继续保留，不在新环境验收通过前下线。

## 已完成

- 删除了失败的反向代理应用，避免继续占用云资源。
- 新建并发布北京区 veFaaS 应用。
- 新增 Node HTTP 适配层与构建时静态首页，兼容 veFaaS Node 20 运行时。
- 创建用户资料、衣柜、聊天、反馈、识别额度和试穿额度数据表。
- 开启所有用户数据表的行级访问控制，每位用户只能访问自己的数据。
- 创建私有 `garment-images` 图片桶，并限制用户只能访问自己 ID 目录下的文件。
- 接入邮箱、Google、GitHub 登录，并将国内预发布地址加入 Supabase 回跳白名单。
- 将衣物识别额度设置为每位登录用户每天 20 次。
- 将 AI 模特成功生成额度设置为普通用户每天 10 次；开发者邮箱免额度。

## 自动验收结果

- 首页返回 HTTP 200。
- 健康检查 `/healthz` 返回 HTTP 200。
- 静态 CSS/JavaScript 返回 HTTP 200。
- 未登录访问用户数据接口返回 HTTP 401。
- Google 与 GitHub OAuth 入口均正常返回 302 跳转。
- 本地测试 5 项全部通过。

## 本地构建与发布

```bash
npm run build:vefaas
vefaas deploy --appId 5a633b9cd680 \
  --buildCommand 'npm run build:vefaas' \
  --outputPath dist \
  --command 'node --no-warnings --experimental-loader ./vefaas-cloudflare-loader.mjs vefaas-server.mjs' \
  --port 3000 --memory 1024 --cpu 500 \
  --minInstance 0 --maxInstance 5 --yes
```

环境变量只保存在本地 `.env.local` 和 veFaaS 云端配置中，不提交到 Git。

## 下一步：绑定自己的国内域名

1. 准备一个自己拥有并可以修改 DNS 的域名或子域名，例如 `yida.example.com`。
2. 确认域名已完成中国大陆 ICP 备案；未备案域名通常无法用于大陆公网服务。
3. 在火山引擎 API 网关为当前服务绑定自定义域名并配置 HTTPS 证书。
4. 按控制台提示添加 DNS 解析记录。
5. 将新域名加入 Supabase Authentication 的 Redirect URLs。
6. 分别验证邮箱、Google、GitHub 登录，以及衣柜、识图、天气和效果图功能。
7. 验收通过后再把 Supabase Site URL 切换为正式域名，并决定是否下线旧站。

## 图片迁移到北京 TOS

图片存储已经支持与 Supabase 数据库解耦。迁移时保持
`YIDA_DATA_BACKEND=supabase`，并设置：

```text
YIDA_IMAGE_BACKEND=tos
YIDA_TOS_MOUNT_PATH=/mnt/yida-images
```

veFaaS 底层函数需要挂载同地域的北京 TOS 私有 Bucket，Bucket 根目录挂载到
`/mnt/yida-images` 并授予读写权限。启用后：

- 新上传的衣物照片、全身照和 AI 试穿图只写入北京 TOS；
- 旧图片如果只存在 Supabase，会在用户首次查看时读取一次并复制到 TOS；
- 删除图片时同时删除 TOS 与 Supabase 中可能存在的旧副本；
- 数据库和登录继续使用 Supabase，后续再分阶段迁移。

## 必须完成的安全事项

迁移排障期间，云端命令输出曾在受控开发会话中展示过现有环境变量值。正式开放给外部用户前必须轮换：

- 火山方舟 API Key；
- 原对象存储访问密钥（如果后续仍保留旧服务）；
- 原服务的 Session Secret。

轮换后只更新本地 `.env.local` 与对应云端环境变量，不要把新值写入代码、README、Issue 或聊天消息。

## 数据区域说明

当前页面与 API 的计算入口位于火山引擎北京区，但 Supabase 项目在美国区域。它能改善中国大陆用户的入口和部分计算链路，但不等于用户数据已经全部境内存储。面向正式商业化或大规模收集身体照片前，应评估迁移到境内数据库与对象存储，并完成隐私、备案和跨境数据合规审查。
