# 上传改造方案

> 状态：讨论稿，尚未实施  
> 基线日期：2026-09-02  
> 适用范围：apps/server、PostgreSQL、MinIO、Nginx  
> 本文目标：把当前分片上传改造成“有长期文件记录、具备公司/项目归属、完成后返回标准文件信息、最终文件可经 Nginx 匿名只读访问”的完整方案。

## 0. 结论先行

本方案采用以下设计：

1. 新增长期 files 表，记录每一个文件的业务归属和存储信息。
2. upload_sessions 只负责分片上传过程，不再兼任长期文件表。
3. 初始化上传时生成 fileId，并同时记录 companyId、projectId、uploadedBy。
4. companyId、projectId 必须经过后端权限和归属校验，不能直接信任请求参数或 X-Company-Id。
5. 完成上传后至少返回：
   - fileId
   - fileUrl
   - fileName
   - fileSuffix
   - fileSize
   - companyId
   - projectId
6. 完成响应不增加 uploadSize；上传进度接口如有需要，使用动态计算的 uploadedSize。
7. 暂不增加 group。公司、项目、文件用途和可见性应使用含义明确的独立字段。
8. fileUrl 返回相对地址，例如 /files/objects/2026/09/<fileId>，不返回 MinIO 内网地址。
9. 最终公开文件放入独立 public-files Bucket，匿名权限仅允许 GetObject。
10. Nginx 对外只开放 /files/\*\* 的 GET、HEAD；上传、完成、删除等接口继续由 NestJS 鉴权。
11. MinIO 9000、9001 生产环境不直接暴露公网。

“不加鉴权”只表示最终文件下载不要求登录。它等价于公开文件：任何获得 URL 的人都可以访问，URL 难猜不能替代权限控制。

## 1. 本次方案边界

### 1.1 包含

- 永久文件记录与上传会话拆分。
- companyId、projectId 的传递、校验和持久化。
- 分片上传接口补齐及完成响应调整。
- fileId、fileUrl、文件名、后缀、大小等字段定义。
- MinIO 公共只读 Bucket。
- Nginx 文件代理。
- 数据迁移、幂等恢复、测试验收和回滚方案。

### 1.2 暂不包含

- 本文档之外的实际代码修改。
- CDN 厂商接入。
- 病毒扫描、内容审核的具体实现。
- 私有文件下载授权实现。
- company、project、membership 业务模块的具体产品规则。

如果以后需要私有文件，应保留 visibility 扩展能力，并使用短期预签名 URL、后端下载代理或专用签名网关，不能继续使用永久匿名 URL。

## 2. 当前实现事实

以下内容来自当前源码，不代表目标状态。

| 项目          | 当前状态                                            | 影响                                             |
| ------------- | --------------------------------------------------- | ------------------------------------------------ |
| 数据库        | schema.ts 中只有 upload_sessions，没有永久 files 表 | 上传完成后缺少稳定的文件业务实体                 |
| 文件归属      | 只有 ownerId                                        | 无法按公司、项目查询、授权和删除                 |
| 完成响应      | 只有 uploadSessionId、status、objectKey、etag       | 缺少前端需要的标准文件信息，并暴露内部 objectKey |
| 对象 Key      | users/<ownerId>/<yyyy>/<MM>/<uploadSessionId>       | 直接公开会暴露用户 UUID 和内部结构               |
| MinIO Bucket  | uploads，anonymous policy 为 none                   | 普通 Nginx 匿名反代会得到 AccessDenied           |
| MinIO 端口    | 9000、9001 映射到宿主机                             | 生产环境不应直接暴露                             |
| Nginx         | 当前仓库没有文件代理配置                            | /files/\*\* 尚不存在                             |
| 公司/项目模型 | 当前 schema 中没有 company、project、membership 表  | 无法可靠校验 companyId、projectId                |

当前上传模块还存在以下接通问题，应在正式改造第一阶段处理：

- UploadController 目前只有初始化接口。
- UploadService.initiate() 没有进入真正的新建逻辑，实际逻辑位于误拼的 initate()。
- 当前没有 upload.module.ts，AppModule 也没有导入上传模块。
- UploadSessionParamsDto 错误使用了包含 partNumber 的参数 Schema。
- abort() 的部分成功路径没有返回统一响应。
- initiate-mutipart-upload.dto.ts、upload.reponsitory.ts 存在文件名拼写问题。
- 当前缺少上传模块专项测试。

这些问题只在本文中登记，本次创建方案文档不会修改它们。

## 3. 关键业务规则

### 3.1 默认归属规则

本方案默认：

- companyId 必填。
- projectId 必填。
- uploadedBy 从当前登录会话取得，客户端不能指定。
- 客户端在初始化上传时传 companyId、projectId。
- 后端必须查询项目并验证 project.companyId 与 companyId 一致。
- 后端必须验证当前用户属于该公司，并拥有对应项目的上传权限。

如果后续确认存在“只属于公司、不属于项目”的文件，可将 projectId 改为可空；此时 null 必须明确表示“公司级文件”，不能表示未知归属。

### 3.2 参数可信边界

- companyId、projectId、X-Company-Id 都属于客户端输入，不能直接作为可信事实入库。
- X-Company-Id 目前只被 CORS 放行，不等于后端已经建立租户上下文。
- 如果请求同时携带 X-Company-Id 和 companyId，两者必须一致。
- projectId 必须反查项目记录，不能仅验证 UUID 格式。
- 跨公司或跨项目访问建议统一返回 404，避免泄漏资源是否存在。

### 3.3 操作权限建议

| 操作             | 默认权限                    |
| ---------------- | --------------------------- |
| 初始化上传       | 公司成员且拥有项目上传权限  |
| 查询上传状态     | 原上传者；项目管理员可选    |
| 上传分片         | 原上传者                    |
| 完成上传         | 原上传者                    |
| 取消上传         | 原上传者；项目管理员可选    |
| 查询文件记录     | 按公司、项目业务权限        |
| 删除文件         | 项目管理员或明确授权角色    |
| 读取公开文件内容 | 无需登录，任何获得 URL 的人 |

ownerId 应重命名或在文件表中表达为 uploadedBy。它是审计字段，不应继续作为唯一租户授权边界。

## 4. 目标架构

```text
                               控制面：必须鉴权

浏览器 ── /api/uploads/multipart/** ──> Nginx ──> NestJS
                                                  │
                                                  ├── PostgreSQL
                                                  │   ├── files
                                                  │   └── upload_sessions
                                                  │
                                                  └── MinIO S3 API
                                                      └── public-files

                               数据面：匿名只读

浏览器 ── GET/HEAD /files/<objectKey> ──> Nginx ──> MinIO public-files
```

### 4.1 信任边界

- NestJS 使用 MinIO 凭据执行 CreateMultipartUpload、UploadPart、Complete、Abort、Delete。
- public-files 的匿名策略只允许读取对象，不允许列举和写入。
- Nginx 固定代理 public-files，不允许客户端选择 Bucket。
- 数据库保存业务归属；MinIO 只保存对象。
- fileUrl 是部署层访问地址，不是数据库事实。

### 4.2 发布时点

在简单公共 Bucket 方案中，MinIO CompleteMultipartUpload 成功的时刻就是对象公开的时刻。

因此：

- 分片完整性、大小、类型等同步校验必须在 Complete 之前完成。
- 数据库在 Complete 后写入失败时，重试或后台对账必须恢复同一个 fileId，不能新建第二条文件记录。
- 由于对象 Key 不可推断且此时尚未向普通用户返回 fileUrl，短暂的数据库失败不会自动暴露 URL，但仍需孤儿对象对账。

如果未来要求“病毒扫描通过后才公开”，应改为私有暂存区加发布流程。当前最大文件可达 90 GiB，大文件发布不能依赖单次 CopyObject，应设计 S3 Multipart Copy 或异步发布任务。

## 5. 数据模型

### 5.1 新增 files 表

建议表名：files。

| 字段          | 类型建议      | 是否必填 | 说明                                            |
| ------------- | ------------- | -------- | ----------------------------------------------- |
| id            | uuid          | 是       | 对外 fileId，初始化上传时生成                   |
| company_id    | uuid          | 是       | 文件所属公司                                    |
| project_id    | uuid          | 默认是   | 文件所属项目；只有明确支持公司级文件时才可空    |
| uploaded_by   | uuid          | 是       | 上传人，关联 users.id                           |
| bucket        | varchar(63)   | 是       | 后端内部字段                                    |
| object_key    | varchar(1024) | 是       | 后端内部字段                                    |
| original_name | varchar(255)  | 是       | 原始完整文件名                                  |
| file_suffix   | varchar(32)   | 否       | 小写且不包含点；无后缀为 null                   |
| content_type  | varchar(255)  | 是       | 服务端校验后的 MIME                             |
| file_size     | bigint        | 是       | 字节数，以最终对象校验结果为准                  |
| object_etag   | text          | 否       | 存储对象 ETag，仅内部使用                       |
| visibility    | enum          | 是       | 当前固定 public，预留 private                   |
| status        | enum          | 是       | uploading、available、failed、deleting、deleted |
| created_at    | timestamptz   | 是       | 创建时间                                        |
| completed_at  | timestamptz   | 否       | 上传完成时间                                    |
| deleted_at    | timestamptz   | 否       | 软删除时间                                      |
| updated_at    | timestamptz   | 是       | 更新时间                                        |

建议约束与索引：

- 主键 files.id。
- 唯一索引 files(bucket, object_key)。
- 索引 files(company_id, project_id, status, created_at)。
- 索引 files(uploaded_by, created_at)。
- 如果 company、project 表已存在，建立外键。
- 如果同时保存 companyId、projectId，建议使用复合约束保证项目确实属于公司。

fileUrl 不写入数据库。它由公开前缀和 objectKey 在响应时生成，避免域名、Nginx、CDN 迁移导致历史数据失效。

### 5.2 upload_sessions 调整

upload_sessions 保留现有分片技术状态，并新增：

| 字段    | 说明                            |
| ------- | ------------------------------- |
| file_id | 关联 files.id，初始化后不可变化 |

推荐最终职责：

- files：业务归属、最终文件、查询和删除生命周期。
- upload_sessions：storageUploadId、分片大小、分片数量、过期时间及上传状态。

迁移初期可以暂时保留 upload_sessions 中重复的 bucket、objectKey、文件名、类型和大小，等新流程稳定后再决定是否清理。不要在第一版迁移中直接删除旧列。

### 5.3 状态关系

```text
files:

uploading ──完成成功──> available ──申请删除──> deleting ──物理删除──> deleted
    │
    ├──取消/过期──> failed
    └──不可恢复错误──> failed

upload_sessions:

uploading ──抢占完成──> completing ──成功──> completed
    │                         │
    ├──取消──> aborting ──> aborted
    └──过期──> expired
```

上传会话状态与文件状态必须在同一业务流程中协调，但不能把两者混为一个字段。

## 6. 文件标识、对象 Key 与 URL

### 6.1 标识定义

- fileId：长期文件实体 ID。
- uploadSessionId：一次分片上传会话 ID。
- clientUploadId：客户端生成的幂等 ID。
- objectKey：MinIO 内部对象路径。
- fileUrl：通过 Nginx 公开访问对象的相对 URL。

fileId 与 uploadSessionId 不应继续混用。初始化时同时生成两者，后续完成重试始终使用同一个 fileId。

### 6.2 对象 Key

建议格式：

```text
objects/<yyyy>/<MM>/<fileId>
```

示例：

```text
objects/2026/09/1e2ab695-1827-4f88-87a2-c354cc5a6ed3
```

设计理由：

- 不包含 ownerId、companyId、projectId。
- 不包含原始文件名，避免路径注入和隐私泄漏。
- fileId 为服务端生成的高熵随机 UUID，不可顺序枚举。
- 文件名、公司和项目归属只保存在数据库。
- URL 是否带扩展名不影响 MinIO 读取，浏览器行为由 Content-Type 和 Content-Disposition 决定。

### 6.3 fileUrl

```text
/files/<objectKey>
```

示例：

```text
/files/objects/2026/09/1e2ab695-1827-4f88-87a2-c354cc5a6ed3
```

数据库不保存 fileUrl。后端通过配置项 PUBLIC_FILE_URL_PREFIX 生成：

```text
fileUrl = PUBLIC_FILE_URL_PREFIX + "/" + objectKey
```

默认 PUBLIC_FILE_URL_PREFIX 为 /files。未来切换到 files.example.com 或 CDN 时，只调整运行时配置或网关规则。

### 6.4 对象响应元数据

创建 Multipart Upload 时建议写入：

- Content-Type：服务端允许或校验后的类型。
- Content-Disposition：使用安全编码后的原始文件名。
- Cache-Control：根据撤回和缓存策略决定。

不要把 ownerId、companyId、projectId 写入公共对象的自定义 x-amz-meta-\*。匿名 HEAD 请求可能看到这些元数据。

HTML、SVG 等可执行类型默认使用 attachment；只有经过明确白名单校验的图片、视频、PDF 等类型才考虑 inline。

## 7. API 改造

以下路径表示 NestJS 业务路由；部署时可由 Nginx 统一增加 /api 前缀。

### 7.1 接口列表

| 方法     | 路径                                                  | 鉴权 | 用途                             |
| -------- | ----------------------------------------------------- | ---- | -------------------------------- |
| POST     | /uploads/multipart                                    | 是   | 初始化上传                       |
| GET      | /uploads/multipart/:uploadSessionId                   | 是   | 查询状态和已上传分片             |
| PUT      | /uploads/multipart/:uploadSessionId/parts/:partNumber | 是   | 上传一个分片                     |
| POST     | /uploads/multipart/:uploadSessionId/complete          | 是   | 完成上传并返回文件信息           |
| DELETE   | /uploads/multipart/:uploadSessionId                   | 是   | 取消未完成上传                   |
| DELETE   | /files/:fileId                                        | 是   | 删除已完成文件，后续文件模块实现 |
| GET/HEAD | /files/<objectKey>                                    | 否   | Nginx 直达 MinIO 的公开文件内容  |

业务 API 的 /api/files/:fileId 与公开内容路由 /files/<objectKey> 应由 Nginx 按前缀分流，不能落入同一个上游。

### 7.2 初始化请求

```json
{
  "clientUploadId": "f42e5ed4-cb58-4ed0-a64a-16154454ae3e",
  "companyId": "86d66115-9046-4a25-b869-09a29ab4f1f1",
  "projectId": "bfb38c08-a1bd-48b5-92fb-39a4cf602952",
  "fileName": "项目设计图.PDF",
  "fileSize": 123456,
  "contentType": "application/pdf"
}
```

初始化时后端必须：

1. 校验公司、项目、成员关系和上传权限。
2. 校验文件名、大小和 Content-Type。
3. 从 fileName 提取 fileSuffix，转为小写且不含点。
4. 生成 fileId、uploadSessionId、objectKey。
5. 创建 MinIO multipart upload。
6. 在数据库事务中创建 files 和 upload_sessions。
7. 数据库失败时补偿 AbortMultipartUpload。

### 7.3 初始化响应

```json
{
  "fileId": "1e2ab695-1827-4f88-87a2-c354cc5a6ed3",
  "uploadSessionId": "b83915e5-091c-43cb-b43e-5d93e1624f8e",
  "status": "uploading",
  "partSize": 10485760,
  "totalParts": 1,
  "expiresAt": "2026-09-03T08:00:00.000Z",
  "uploadedParts": []
}
```

初始化阶段不必返回 fileUrl，避免客户端把尚未完成的地址当作可用文件。

### 7.4 状态响应

状态接口保留 uploadedParts。若前端需要总上传进度，可增加：

```json
{
  "uploadedSize": 10485760
}
```

uploadedSize 由已上传分片大小求和得到，不需要单独持久化。

### 7.5 完成响应

```json
{
  "uploadSessionId": "b83915e5-091c-43cb-b43e-5d93e1624f8e",
  "status": "completed",
  "fileId": "1e2ab695-1827-4f88-87a2-c354cc5a6ed3",
  "fileUrl": "/files/objects/2026/09/1e2ab695-1827-4f88-87a2-c354cc5a6ed3",
  "fileName": "项目设计图.PDF",
  "fileSuffix": "pdf",
  "fileSize": 123456,
  "contentType": "application/pdf",
  "companyId": "86d66115-9046-4a25-b869-09a29ab4f1f1",
  "projectId": "bfb38c08-a1bd-48b5-92fb-39a4cf602952"
}
```

字段规则：

| 字段        | 规则                                                 |
| ----------- | ---------------------------------------------------- |
| fileId      | 稳定的文件实体 ID，完成重试不能变化                  |
| fileUrl     | 相对地址，不包含 MinIO 域名、端口、Bucket 或签名参数 |
| fileName    | 原始完整文件名                                       |
| fileSuffix  | 小写、不含点；无扩展名返回 null                      |
| fileSize    | 字节数，以已验证分片总和和 HeadObject 为准           |
| contentType | 服务端验证后的 MIME                                  |
| companyId   | 已通过权限验证的公司                                 |
| projectId   | 已通过归属验证的项目                                 |

不返回：

- storageUploadId。
- bucket。
- objectKey。
- MinIO endpoint。
- MinIO 凭据。
- uploadSize。
- 含义不明确的 group。

etag 是否返回由前端缓存需求决定。Multipart ETag 不能当作普通文件 MD5。

### 7.6 幂等规则

- 同一 uploadedBy + clientUploadId 重试时返回同一个 fileId 和 uploadSessionId。
- 如果文件名、大小、类型、companyId 或 projectId 不一致，返回冲突错误。
- complete 重试必须返回同一份文件信息，不能重复插入 files。
- MinIO 已完成但数据库写入失败时，通过 HeadObject、会话中已持久化的 objectKey、fileId 和最终大小恢复同一记录，不依赖会泄漏业务信息的公共对象元数据。

## 8. 上传与完成流程

### 8.1 初始化

```text
校验身份和项目权限
  → 生成 fileId、uploadSessionId、objectKey
  → MinIO CreateMultipartUpload
  → DB 事务创建 files(uploading) 和 upload_sessions(uploading)
  → 返回初始化信息
```

### 8.2 分片上传

- 保留当前流式上传方式。
- 必须要求合法 Content-Length。
- 每片实际字节数必须与预期一致。
- 不允许 Content-Encoding 压缩改变字节长度。
- 每次查询、上传、完成、取消都必须重新校验会话归属。
- 多实例部署前需要解决“仍有分片在途时 complete/abort”的竞态；当前 PARTS_STILL_ACTIVE 已定义但未使用。

### 8.3 完成

```text
uploading
  → 条件更新抢占为 completing
  → ListParts
  → 校验分片编号、大小、总字节数
  → CompleteMultipartUpload
  → HeadObject 校验最终大小和关键元数据
  → DB 事务：
       files.status = available
       files.objectEtag = 最终 ETag
       upload_sessions.status = completed
  → 返回标准文件信息
```

在调用 MinIO Complete 之前失败，可以安全恢复为 uploading。

调用 Complete 之后发生超时或未知错误时，不能直接恢复 uploading。应保持 completing，通过 HeadObject 判断对象是否已经存在，并执行同一套 finalize 事务。

### 8.4 取消与过期

- uploading 或 expired 可以进入 aborting。
- AbortMultipartUpload 成功后，会话改为 aborted。
- 对应 files 状态改为 failed，供清理任务处理。
- completed 文件不能通过“取消上传”删除，必须走按 fileId 鉴权的文件删除接口。

### 8.5 文件删除

文件删除接口只接受 fileId，不接受客户端提供 bucket 或 objectKey。

建议顺序：

1. 校验公司、项目和删除权限。
2. 条件更新 files.status 为 deleting。
3. 按数据库中的 bucket、objectKey 删除对象。
4. 更新为 deleted 并写 deletedAt。
5. 如有 Nginx/CDN 缓存，执行 purge 或等待明确的短缓存过期。

删除 MinIO 对象不代表已经被浏览器、代理或第三方保存的公开文件可以被完全收回。

## 9. MinIO 公共只读方案

### 9.1 Bucket

推荐新增：

```text
public-files
```

不要直接把未来可能存放私密内容的通用 uploads Bucket 整体公开。

public-files 的匿名策略只允许：

```text
s3:GetObject
arn:aws:s3:::public-files/*
```

必须禁止：

- s3:ListBucket
- s3:PutObject
- s3:DeleteObject
- Multipart Upload API
- Bucket Policy、ACL 和管理 API

不要简单依赖“对象 Key 很难猜”；随机 Key 只是减少枚举概率，不是访问控制。

### 9.2 网络

开发环境可按需要保留端口映射，生产环境必须：

- MinIO 9000 只允许 Nginx、NestJS 所在内网访问。
- MinIO 9001 控制台不代理、不暴露公网。
- 外部只开放 Nginx 的 HTTPS 入口。
- MinIO 根账号和应用账号分离，NestJS 使用最小权限服务账号。

### 9.3 为什么不能只加 proxy_pass

当前 uploads Bucket 是 private。普通 Nginx 不会自动给请求生成 AWS SigV4 签名，因此直接把匿名请求转发到私有 Bucket 会收到 AccessDenied。

实现公开下载有三种方式：

| 方式                       | 适用情况           | 本方案         |
| -------------------------- | ------------------ | -------------- |
| 独立 Bucket 匿名 GetObject | 文件真正公开       | 推荐           |
| 短期预签名 URL             | 文件需要权限控制   | 私有文件时使用 |
| 后端/签名网关代理          | 需要复杂鉴权和审计 | 当前不采用     |

## 10. Nginx 代理方案

建议使用独立无 Cookie 域名：

```text
files.example.com
```

如果暂时使用主站同源 /files，也必须对 HTML、SVG 等类型强制下载，并设置 nosniff。

以下只表示目标语义，实施时需结合仓库实际 Nginx 目录落盘：

```nginx
upstream minio_public {
  server minio:9000;
  keepalive 32;
}

location = /files {
  return 404;
}

location = /files/ {
  return 404;
}

location /files/ {
  # Nginx 的 GET 规则同时允许 HEAD；其他方法全部拒绝。
  limit_except GET {
    deny all;
  }

  proxy_http_version 1.1;
  proxy_pass http://minio_public/public-files/;
  proxy_buffering off;

  add_header X-Content-Type-Options nosniff always;
}
```

需要进一步验证：

- /files/a/b 能否精确映射为 public-files/a/b。
- Range 请求返回 206。
- If-None-Match、If-Modified-Since 能正常传递。
- Bucket 根路径不能列举。
- PUT、POST、PATCH、DELETE、multipart、ACL 请求全部失败。
- 路径穿越、双重编码、encoded slash 不会逃逸固定 Bucket。
- Nginx 不向客户端暴露不必要的 MinIO 内部错误和响应头。

大文件下载建议增加：

- 每 IP 连接数限制。
- 请求速率和带宽监控。
- 合理超时。
- Range 请求滥用防护。

防盗链只能减少普通外链流量，不能作为访问控制。

## 11. 内容安全与缓存

### 11.1 Content-Type

当前 DTO 只验证 MIME 字符串格式，不能证明文件内容真实。

MVP 至少应：

- 建立允许上传的 MIME 白名单或用途级白名单。
- 不完全信任客户端 Content-Type。
- HTML、SVG、XML 等可执行或可嵌入类型强制 attachment。
- 设置 X-Content-Type-Options: nosniff。

后续可增加文件签名检测、病毒扫描和内容审核。

### 11.2 Content-Disposition

- 原始文件名必须清理控制字符和响应头注入字符。
- 同时提供安全的 ASCII fallback 和 RFC 5987 filename\*。
- fileName 存数据库；Content-Disposition 写入对象，保证 Nginx 直出时仍能获得正确文件名。

### 11.3 缓存

对象 Key 永不覆盖时才适合 immutable 缓存。

本方案第一阶段建议使用较短缓存，待删除和 purge 流程验证后再延长。需要快速撤回的文件不要直接设置一年 immutable。

## 12. 预计影响文件

以下是实施阶段的预计范围，本次不会修改。

### 12.1 数据库

- apps/server/src/database/schema.ts
- apps/server/drizzle/0002\_\*.sql
- 新增 files 表及必要枚举、索引和外键

不得修改已经执行过的 0001 迁移，应新增迁移文件。

### 12.2 上传模块

- apps/server/src/modules/upload/upload.controller.ts
- apps/server/src/modules/upload/upload.service.ts
- apps/server/src/modules/upload/upload.repository.ts
- apps/server/src/modules/upload/upload.module.ts
- apps/server/src/modules/upload/dto/\*
- apps/server/src/modules/upload/storage/storage.port.ts
- apps/server/src/modules/upload/storage/minio-storage.adapter.ts
- apps/server/src/modules/upload/utils/object-key.ts
- apps/server/src/modules/upload/upload.errors.ts

可能新增：

- file.repository.ts
- response DTO 或序列化 Schema
- 文件名、后缀和 Content-Disposition 工具

### 12.3 应用和配置

- apps/server/src/app.module.ts
- apps/server/src/config/storage.config.ts
- 环境变量示例文件
- docker-compose.yml
- 新增 Nginx 配置目录和服务

### 12.4 测试

- 上传服务单元测试
- Repository/PostgreSQL 集成测试
- MinIO 集成测试
- API E2E 测试
- Nginx 公共访问安全测试
- test/error-catalog.spec.ts 中纳入 UPLOAD_ERRORS

## 13. 分阶段实施顺序

### 阶段 0：冻结业务决策

- 确认 projectId 是否永远必填。
- 确认哪些角色能上传、续传、完成、取消和删除。
- 确认允许公开的文件类型。
- 确认使用同源 /files 还是 files.example.com。
- 确认缓存和撤回时效。
- 确认是否存在需要迁移的历史上传数据。

### 阶段 1：补齐 company/project 权限事实来源

- 建立 company、project、membership 模型或接入已有服务。
- 确保可以从 projectId 校验 companyId。
- 建立统一的公司/项目权限检查。

在此阶段完成前，不应仅靠新增两个 DTO 字段就把 companyId、projectId 写入数据库。

### 阶段 2：修复上传模块基线

- 合并 initiate/initate。
- 补齐 Controller 路由。
- 创建并注册 UploadModule。
- 修正参数 DTO。
- 统一 abort 响应。
- 修正相关文件名拼写及引用。
- 添加当前行为回归测试。

### 阶段 3：新增 files 和加法式迁移

- 新增 files 表。
- upload_sessions 增加 fileId。
- 第一阶段保留旧列。
- 新上传同时写入 files 和 upload_sessions。
- 完成流程使用事务更新两张表。

如果当前没有需要保留的生产数据，可以直接使用最终非空约束；如果已有数据，应先允许新字段为空并完成回填，再收紧约束。

### 阶段 4：调整对象 Key 和响应契约

- 新对象改为不透明 Key。
- StoragePort 支持 Content-Disposition、Cache-Control 等需要的对象属性。
- 完成接口返回标准文件信息。
- fileUrl 根据配置动态生成。
- objectKey、bucket 不再出现在公开响应中。

### 阶段 5：部署公共读取链路

- 新建 public-files Bucket。
- 设置匿名 GetObject 自定义策略。
- 新增 Nginx /files/\*\* 固定代理。
- 关闭生产环境 MinIO 公网端口。
- 验证 Range、安全头、方法限制和列举封锁。

### 阶段 6：灰度和清理

- 先对测试环境和少量项目启用。
- 观察上传失败、恢复完成、孤儿对象和公网流量。
- 客户端完成适配后再删除旧响应字段。
- 回滚窗口结束后才考虑清理重复列和旧对象。

## 14. 历史数据迁移

如果 upload_sessions 已有 completed 数据：

1. 新增 files 表和 upload_sessions.file_id，初始允许为空。
2. 为每条已完成会话生成稳定 fileId。
3. 从会话回填原文件名、类型、大小、bucket、objectKey、owner。
4. companyId 只能根据可靠业务关系回填。
5. projectId 不能从当前 objectKey 或文件名推断。
6. 无法判断项目的记录进入人工映射清单，禁止猜测。
7. 如需迁移到 public-files，采用复制、校验、切换、观察、再删除旧对象的顺序。
8. 大文件使用 Multipart Copy 或重新上传，不能假设单次 CopyObject 可处理 90 GiB。
9. 全部对账通过后再增加 NOT NULL、外键和最终唯一约束。

迁移对账至少包含：

- 文件记录数。
- 对象数量。
- 总字节数。
- DB 有记录但对象缺失。
- 对象存在但 DB 无记录。
- company/project 缺失或不一致。

## 15. 测试与验收

### 15.1 字段与契约

- 完成响应包含 fileId、fileUrl、fileName、fileSuffix、fileSize、companyId、projectId。
- fileSuffix 为小写且不带点，无后缀为 null。
- fileSize 来自最终校验，不盲信客户端。
- 不返回 storageUploadId、bucket、objectKey、MinIO endpoint。
- 不返回重复的 uploadSize。
- 不增加含义不明的 group。
- complete 重试返回相同 fileId 和 fileUrl。

### 15.2 权限

- 未登录不能初始化、上传分片、完成、取消或删除。
- 非公司成员不能上传。
- projectId 不属于 companyId 时拒绝。
- A 公司用户不能操作 B 公司的会话或文件。
- 修改 X-Company-Id 不能越权。
- 猜到 uploadSessionId 仍不能越权。

### 15.3 上传一致性

- 初始化并发重试只创建一个 file 和 session。
- 分片大小错误、缺片、重复片按预期处理。
- Complete 并发只完成一次。
- MinIO Complete 成功、DB 临时失败后可以恢复。
- 取消和过期会话不会生成 available 文件。
- 已完成文件不能通过 abort 删除。

### 15.4 公共访问

- 不携带 Authorization 和 Cookie 的 GET fileUrl 返回 200。
- HEAD 返回正确的 Content-Length、Content-Type。
- Range 返回 206。
- 未完成或不存在的 Key 返回 404。
- Bucket 根路径不能列举。
- PUT、POST、PATCH、DELETE 请求被拒绝。
- multipart、ACL、Bucket 管理操作被拒绝。
- 生产外网不能直连 9000、9001。
- 公共响应不泄露 companyId、projectId、ownerId、MinIO 凭据。
- HTML、SVG 等危险类型不会在主站同源直接执行。

### 15.5 删除与缓存

- 删除接口只接受 fileId。
- 删除前执行公司、项目权限检查。
- 删除后公开 URL 按约定时效失效。
- CDN/Nginx 缓存存在时完成 purge 验证。
- 已被第三方下载的内容不承诺可收回。

### 15.6 建议验证命令

实施后至少运行：

```bash
vp check
vp test
vp run -r build
```

并使用 curl 或自动化测试验证匿名 GET、HEAD、Range 和写方法封锁。

## 16. 回滚方案

### 16.1 应用

- 通过功能开关停止返回公共 fileUrl。
- 过渡期保留旧响应字段，避免旧客户端立即失效。
- 数据库采用加法式迁移，事故期间不删除新列、不回滚破坏性 DDL。

### 16.2 Nginx 与 MinIO

- 下线 /files/\*\* 路由或统一返回 404。
- 撤销 public-files 的匿名 GetObject。
- 如已启用 CDN，执行全量 purge。
- 不立即删除 public-files 对象，先保留用于对账和恢复。

### 16.3 对象迁移

- 复制失败时只清理本次明确创建的目标 Key。
- 已切换 DB 指针的文件应先回指旧对象，再删除新副本。
- 迁移任务记录 pending、copied、verified、switched 状态，保证可重跑。

公开 URL 一旦被分享或文件被下载，技术回滚无法删除第三方已经保存的副本。

## 17. 实施前待确认

以下选项不影响本文档创建，但正式改代码前需要确认：

1. projectId 是否始终必填；是否存在公司级文件。
2. 用户是否只能管理自己上传的会话，项目管理员是否可以接管。
3. 文件是否全部公开；是否需要 public/private 并存。
4. 是否从第一版就使用独立域名 files.example.com。
5. HTML、SVG、文本等类型是禁止上传，还是允许但强制下载。
6. 缓存时间和文件撤回时效。
7. 是否存在需要回填 companyId、projectId 的历史数据。

## 18. 最终实施清单

- [ ] company/project/membership 权限来源明确
- [ ] projectId 必填规则确认
- [ ] 上传模块当前接通问题修复
- [ ] files 表和新迁移完成
- [ ] upload_sessions 关联 fileId
- [ ] 新对象 Key 不泄露用户和业务 ID
- [ ] 完成响应字段满足约定
- [ ] uploadSize、group 不进入完成响应
- [ ] 完成幂等和存储恢复通过测试
- [ ] public-files 仅匿名 GetObject
- [ ] Nginx 仅开放 GET、HEAD
- [ ] MinIO 9000、9001 不暴露公网
- [ ] Range、Content-Disposition、nosniff 验证通过
- [ ] 删除、缓存和回滚流程演练通过
