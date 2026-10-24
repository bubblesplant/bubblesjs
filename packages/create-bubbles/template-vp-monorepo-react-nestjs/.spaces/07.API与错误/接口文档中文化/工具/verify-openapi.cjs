const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../../../..')
const evidence = path.resolve(__dirname, '../测试证据')
const server = path.join(root, 'apps/server')
const localRequire = createRequire(path.join(server, 'package.json'))
const ts = localRequire('typescript')
const mode = process.argv[2] || 'verify'
assert.ok(['baseline', 'verify'].includes(mode), '模式必须为 baseline 或 verify')
process.env.TS_NODE_PROJECT = path.join(server, 'tsconfig.scripts.json')
localRequire('ts-node').register({
  project: process.env.TS_NODE_PROJECT,
  transpileOnly: true,
})
const { register } = localRequire('tsconfig-paths')
register({ baseUrl: server, paths: { '@/*': ['src/*'] } })
localRequire('reflect-metadata')
const { Test } = localRequire('@nestjs/testing')
const { FastifyAdapter } = localRequire('@nestjs/platform-fastify')
const { DocumentBuilder, SwaggerModule } = localRequire('@nestjs/swagger')
const { PATH_METADATA, METHOD_METADATA } = localRequire('@nestjs/common/constants')

/** 递归列出源码文件，不读取配置或连接任何外部服务。 */
function listFiles(directory, suffix) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(full, suffix) : full.endsWith(suffix) ? [full] : []
    })
    .sort()
}

/** 读取工作树源码并解析为 TypeScript AST；基线在本轮源码修改前捕获。 */
function sourceFile(file) {
  return ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true)
}

/** 读取当前模板的实际源码，不假设模板目录是 Git 仓库根目录。 */
function readSource(file) {
  return fs.readFileSync(file, 'utf8')
}

/** 获取指定 Nest 装饰器的调用参数。 */
function decoratorCall(node, name) {
  return (ts.getDecorators(node) || [])
    .map((item) => item.expression)
    .find((item) => ts.isCallExpression(item) && item.expression.getText() === name)
}

/** 解析本地模块引用；第三方模块没有业务 Controller，直接略过。 */
function resolveLocal(from, specifier) {
  const candidate = specifier.startsWith('@/')
    ? path.join(server, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null
  if (!candidate) return null
  return (
    [candidate, `${candidate}.ts`, path.join(candidate, 'index.ts')].find(
      (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
    ) || null
  )
}

/** 从真实 AppModule 的静态本地模块导入关系收集生产 Controller，不实例化 AppModule。 */
function productionControllerNames() {
  const visited = new Set()
  const names = new Set()
  /** 沿本地静态模块导入递归收集 Controller，避开动态基础设施模块实例化。 */
  function visit(file) {
    if (visited.has(file)) return
    visited.add(file)
    const source = sourceFile(file)
    const imports = new Map()
    for (const item of source.statements) {
      if (
        !ts.isImportDeclaration(item) ||
        !item.importClause?.namedBindings ||
        !ts.isNamedImports(item.importClause.namedBindings)
      )
        continue
      const resolved = resolveLocal(file, item.moduleSpecifier.text)
      if (resolved)
        for (const binding of item.importClause.namedBindings.elements)
          imports.set(binding.name.text, resolved)
    }
    for (const item of source.statements) {
      if (!ts.isClassDeclaration(item)) continue
      const call = decoratorCall(item, 'Module')
      const metadata = call?.arguments[0]
      if (!metadata || !ts.isObjectLiteralExpression(metadata)) continue
      for (const property of metadata.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          !ts.isArrayLiteralExpression(property.initializer)
        )
          continue
        const key = property.name.getText(source)
        if (!['controllers', 'imports'].includes(key)) continue
        for (const value of property.initializer.elements) {
          if (!ts.isIdentifier(value)) {
            if (key === 'controllers') throw new Error(`不支持的 Controller 声明：${file}`)
            continue
          }
          if (key === 'controllers') names.add(value.text)
          else if (imports.has(value.text)) visit(imports.get(value.text))
        }
      }
    }
  }
  visit(path.join(server, 'src/app.module.ts'))
  return names
}

/** 读取文档配置中的字面量参数；出现运行时表达式时明确报错，避免悄悄模拟不同配置。 */
function configLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(configLiteral)
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((property) => {
        assert.ok(ts.isPropertyAssignment(property), '文档配置只支持显式字面量属性')
        const key =
          ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : undefined
        assert.ok(key, '文档配置出现不支持的属性名')
        return [key, configLiteral(property.initializer)]
      }),
    )
  throw new Error(`文档配置出现非字面量参数：${node.getText()}`)
}

/** 递归调用真实 DocumentBuilder 方法，不执行 main.ts 的启动过程或任意表达式。 */
function configBuilder(node) {
  if (ts.isNewExpression(node) && node.expression.getText() === 'DocumentBuilder')
    return new DocumentBuilder()
  assert.ok(
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression),
    '不支持的 DocumentBuilder 配置链',
  )
  const builder = configBuilder(node.expression.expression)
  const method = node.expression.name.text
  assert.ok(
    builder instanceof DocumentBuilder &&
      method !== 'constructor' &&
      typeof builder[method] === 'function',
    '不支持的文档配置方法',
  )
  return builder[method](...node.arguments.map(configLiteral))
}

/** 从 main.ts 读取并应用真实 DocumentBuilder 配置，保持实际文档配置一致。 */
function documentConfig() {
  const source = sourceFile(path.join(server, 'src/main.ts'))
  let initializer
  /** 定位 main.ts 的文档配置表达式，不执行 bootstrap。 */
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'config')
      initializer = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer, 'main.ts 缺少 Swagger config')
  return configBuilder(initializer)
}

/** 枚举真实 Controller 和真实 handler，构造器服务只以空对象替身注入。 */
function discoverControllers() {
  return listFiles(path.join(server, 'src'), '.controller.ts').flatMap((file) => {
    const exports = localRequire(file)
    return Object.values(exports)
      .filter((value) => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value))
      .map((controller) => {
        const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
          (name) =>
            name !== 'constructor' &&
            Reflect.hasMetadata(METHOD_METADATA, controller.prototype[name]),
        )
        return { file: path.relative(root, file).replaceAll('\\', '/'), controller, handlers }
      })
  })
}

/** 生成真实 OpenAPI；不初始化应用、不监听端口、不加载基础设施 provider。 */
async function generate(controllers) {
  const dependencies = new Set(
    controllers.flatMap((controller) => Reflect.getMetadata('design:paramtypes', controller) || []),
  )
  const testing = await Test.createTestingModule({
    controllers,
    providers: [...dependencies].map((provide) => ({ provide, useValue: {} })),
  }).compile()
  const app = testing.createNestApplication(new FastifyAdapter(), { logger: false })
  try {
    return SwaggerModule.createDocument(app, documentConfig())
  } finally {
    await app.close()
  }
}

/** 归一化键顺序，使文档比较不受对象插入顺序影响。 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  return value
}

/** 只排除本次允许改变的展示字段，保留参数、响应、安全声明和 operationId。 */
function contract(document) {
  const result = structuredClone(document)
  delete result.tags
  delete result.info.title
  delete result.info.description
  for (const item of Object.values(result.paths))
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].includes(method))
        continue
      delete operation.tags
      delete operation.summary
    }
  return canonical(result)
}

/** 提取真实路径、方法和 Swagger 自动生成的标识。 */
function operations(document) {
  return Object.entries(document.paths)
    .flatMap(([route, item]) =>
      Object.entries(item)
        .filter(([method]) =>
          ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].includes(method),
        )
        .map(([method, operation]) => ({
          route,
          method,
          operationId: operation.operationId,
          tags: operation.tags,
          summary: operation.summary,
        })),
    )
    .sort((a, b) => `${a.route} ${a.method}`.localeCompare(`${b.route} ${b.method}`))
}

/** 移除文档展示装饰器和对应 import 后打印 AST，验证业务实现及路由装饰器未变。 */
function runtimeSource(file) {
  const source = sourceFile(path.join(root, file))
  const result = ts.transform(source, [
    (context) => {
      /** 递归移除允许改变的文档展示装饰器及其命名导入，保留其余语法节点。 */
      function visit(node) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@nestjs/swagger') {
          const bindings = node.importClause?.namedBindings
          if (bindings && ts.isNamedImports(bindings)) {
            const elements = bindings.elements.filter(
              (item) => !['ApiTags', 'ApiOperation'].includes(item.name.text),
            )
            if (!elements.length && !node.importClause.name) return undefined
            node = ts.factory.updateImportDeclaration(
              node,
              node.modifiers,
              ts.factory.updateImportClause(
                node.importClause,
                node.importClause.isTypeOnly,
                node.importClause.name,
                ts.factory.updateNamedImports(bindings, elements),
              ),
              node.moduleSpecifier,
              node.attributes,
            )
          }
        }
        if (
          ts.isDecorator(node) &&
          ts.isCallExpression(node.expression) &&
          ['ApiTags', 'ApiOperation'].includes(node.expression.expression.getText(source))
        )
          return undefined
        return ts.visitEachChild(node, visit, context)
      }
      return (node) => ts.visitNode(node, visit)
    },
  ])
  try {
    return ts.createPrinter({ removeComments: true }).printFile(result.transformed[0])
  } finally {
    result.dispose()
  }
}

/** 写入本功能正式测试证据。 */
function save(name, value) {
  fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/** 核对中文展示完整性，并比较实际 OpenAPI 与变更前基线。 */
async function main() {
  if (mode === 'baseline') {
    assert.ok(!fs.existsSync(path.join(evidence, 'openapi-before.json')), '拒绝覆盖变更前基线')
    const serverChanges = execFileSync('git', ['status', '--porcelain', '--', 'apps/server'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    assert.equal(serverChanges, '', '基线必须在本轮 server 源码修改前捕获')
  }
  const discovered = discoverControllers()
  const productionNames = productionControllerNames()
  const production = discovered.filter((item) => productionNames.has(item.controller.name))
  assert.equal(production.length, productionNames.size, '生产 Controller 发现不完整')
  const allDocument = await generate(discovered.map((item) => item.controller))
  const productionDocument = await generate(production.map((item) => item.controller))
  const snapshot = {
    baselineSource:
      mode === 'baseline'
        ? {
            gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
              cwd: root,
              encoding: 'utf8',
            }).trim(),
            gitRoot: execFileSync('git', ['rev-parse', '--show-toplevel'], {
              cwd: root,
              encoding: 'utf8',
            }).trim(),
            templateDirectory: root,
            loading: '本轮修改前的干净 server 工作树；直接加载当前模板真实源码，不恢复或覆盖文件',
          }
        : undefined,
    inventory: discovered.map((item) => ({
      file: item.file,
      controller: item.controller.name,
      handlers: item.handlers,
      production: productionNames.has(item.controller.name),
    })),
    runtimeSources: Object.fromEntries(
      discovered.map((item) => [item.file, runtimeSource(item.file)]),
    ),
    allContract: contract(allDocument),
    productionContract: contract(productionDocument),
  }
  if (mode === 'baseline') {
    assert.ok(!fs.existsSync(path.join(evidence, 'openapi-before.json')), '拒绝覆盖变更前基线')
    save('openapi-before.json', productionDocument)
    save('openapi-all-before.json', allDocument)
    save('baseline.json', snapshot)
  } else {
    const baseline = JSON.parse(fs.readFileSync(path.join(evidence, 'baseline.json'), 'utf8'))
    assert.deepEqual(snapshot.inventory, baseline.inventory, 'Controller/handler 清单发生变化')
    assert.deepEqual(
      snapshot.runtimeSources,
      baseline.runtimeSources,
      '文档展示以外的 Controller 源码发生变化',
    )
    assert.deepEqual(
      snapshot.productionContract,
      baseline.productionContract,
      '生产 OpenAPI 非展示契约发生变化',
    )
    assert.deepEqual(snapshot.allContract, baseline.allContract, '全量 OpenAPI 非展示契约发生变化')
    const invalid = operations(allDocument).filter(
      (item) =>
        !item.summary ||
        !/[\u3400-\u9fff]/.test(item.summary) ||
        /[A-Za-z]/.test(item.summary) ||
        !item.tags?.length ||
        item.tags.some((tag) => !/[\u3400-\u9fff]/.test(tag) || /[A-Za-z]/.test(tag)),
    )
    assert.deepEqual(invalid, [], '存在缺失中文分组/接口名称或残留英文字母的操作')
    const ids = operations(allDocument).map((item) => item.operationId)
    assert.equal(new Set(ids).size, ids.length, 'operationId 不唯一')
    save('openapi-after.json', productionDocument)
    save('openapi-all-after.json', allDocument)
    save('verification.json', {
      verifiedAt: new Date().toISOString(),
      sourceControllerCount: discovered.length,
      productionControllerCount: production.length,
      sourceHandlerCount: discovered.reduce((sum, item) => sum + item.handlers.length, 0),
      productionHandlerCount: production.reduce((sum, item) => sum + item.handlers.length, 0),
      allOperationCount: operations(allDocument).length,
      productionOperationCount: operations(productionDocument).length,
      controllerInventoryUnchanged: true,
      runtimeSourcesUnchanged: true,
      openApiContractUnchanged: true,
      allTagsAndSummariesChinese: true,
      operationIdsUnique: true,
      baselineSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(evidence, 'openapi-before.json')))
        .digest('hex'),
      infrastructure:
        '仅真实 Controller + 构造器服务替身；未初始化应用、监听端口或连接数据库/Redis/对象存储',
      excludedProductionControllers: discovered
        .filter((item) => !productionNames.has(item.controller.name))
        .map((item) => item.controller.name),
    })
  }
  console.log(
    JSON.stringify(
      {
        mode,
        controllers: discovered.length,
        productionControllers: production.length,
        handlers: discovered.reduce((sum, item) => sum + item.handlers.length, 0),
        allOperations: operations(allDocument).length,
        productionOperations: operations(productionDocument).length,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
