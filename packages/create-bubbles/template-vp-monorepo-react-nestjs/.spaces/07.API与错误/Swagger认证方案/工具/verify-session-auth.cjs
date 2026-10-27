const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Module = require('node:module')
const { createRequire, _extensions } = Module

const root = path.resolve(__dirname, '../../../..')
const server = path.join(root, 'apps/server')
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const localRequire = createRequire(path.join(server, 'package.json'))
const ts = localRequire('typescript')
const controllerFiles = ['auth', 'companies', 'dictionaries', 'upload'].map((name) =>
  path.join(server, `src/modules/${name}/${name}.controller.ts`),
)
const revision = process.argv[2] === '--snapshot' ? process.argv[3] : null

/** 读取指定提交的服务端源码；当前模式和非服务端依赖直接读取工作树。 */
function readSource(file) {
  if (!revision || revision === 'current' || !file.startsWith(path.join(server, 'src') + path.sep))
    return fs.readFileSync(file, 'utf8')
  return execFileSync(
    'git',
    ['show', `${revision}:${path.relative(gitRoot, file).replaceAll('\\', '/')}`],
    { cwd: gitRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
}

/** 将选定版本的 TypeScript 编译进当前子进程，两个版本不会共享模块缓存。 */
function installSourceLoader() {
  if (revision && revision !== 'current') {
    const sourceFiles = new Set(
      execFileSync(
        'git',
        [
          'ls-tree',
          '-r',
          '--name-only',
          revision,
          '--',
          path.relative(gitRoot, path.join(server, 'src')).replaceAll('\\', '/'),
        ],
        { cwd: gitRoot, encoding: 'utf8' },
      )
        .trim()
        .split(/\r?\n/)
        .map((file) => path.join(gitRoot, file)),
    )
    const resolveFilename = Module._resolveFilename
    /** 按基线 Git 文件清单解析本地源码，支持已被工作树重命名的旧文件，不创建兼容转发。 */
    Module._resolveFilename = function resolveSnapshotModule(request, parent, ...options) {
      const candidate = request.startsWith('@/')
        ? path.join(server, 'src', request.slice(2))
        : request.startsWith('.') && parent?.filename
          ? path.resolve(path.dirname(parent.filename), request)
          : path.isAbsolute(request)
            ? path.normalize(request)
            : null
      if (candidate?.startsWith(path.join(server, 'src') + path.sep)) {
        const resolved = [candidate, `${candidate}.ts`, path.join(candidate, 'index.ts')].find(
          (file) => sourceFiles.has(file),
        )
        assert.ok(resolved, `Git 基线缺少本地源码：${request}`)
        return resolved
      }
      return resolveFilename.call(this, request, parent, ...options)
    }
  }
  _extensions['.ts'] = (module, file) => {
    const output = ts.transpileModule(readSource(file), {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    })
    module._compile(output.outputText, file)
  }
  localRequire('tsconfig-paths').register({ baseUrl: server, paths: { '@/*': ['src/*'] } })
  localRequire('reflect-metadata')
}

/** 解析实际 main.ts 配置和认证常量，只接受字面量及明确导入的该常量。 */
function documentConfig(DocumentBuilder) {
  const mainFile = path.join(server, 'src/main.ts')
  const source = ts.createSourceFile(mainFile, readSource(mainFile), ts.ScriptTarget.Latest, true)
  const bindings = new Map()
  for (const item of source.statements) {
    if (
      !ts.isImportDeclaration(item) ||
      item.moduleSpecifier.text !== '@/common/constants/swagger.constants' ||
      !item.importClause?.namedBindings ||
      !ts.isNamedImports(item.importClause.namedBindings)
    )
      continue
    const constantsFile = path.join(server, 'src/common/constants/swagger.constants.ts')
    const constants = ts.createSourceFile(
      constantsFile,
      readSource(constantsFile),
      ts.ScriptTarget.Latest,
      true,
    )
    for (const binding of item.importClause.namedBindings.elements) {
      const imported = binding.propertyName?.text || binding.name.text
      assert.equal(imported, 'SWAGGER_SESSION_AUTH', '文档配置出现未支持的常量导入')
      const declaration = constants.statements
        .filter(ts.isVariableStatement)
        .flatMap((item) => [...item.declarationList.declarations])
        .find((item) => ts.isIdentifier(item.name) && item.name.text === imported)
      assert.ok(declaration?.initializer, '找不到实际导入的 Swagger 认证常量')
      bindings.set(binding.name.text, declaration.initializer)
    }
  }

  /** 仅求值配置字面量和已解析的常量，不执行启动文件中的表达式。 */
  function literal(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isIdentifier(node) && bindings.has(node.text)) return literal(bindings.get(node.text))
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties.map((property) => {
          assert.ok(ts.isPropertyAssignment(property), '配置属性必须显式声明')
          assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          return [property.name.text, literal(property.initializer)]
        }),
      )
    throw new Error(`拒绝执行非字面量文档配置：${node.getText()}`)
  }

  /** 仅沿真实 DocumentBuilder 方法链重放配置，不运行 bootstrap。 */
  function build(node) {
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'DocumentBuilder')
      return new DocumentBuilder()
    assert.ok(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
    const builder = build(node.expression.expression)
    const method = node.expression.name.text
    assert.ok(builder instanceof DocumentBuilder && method !== 'constructor')
    assert.equal(typeof builder[method], 'function')
    return builder[method](...node.arguments.map(literal))
  }

  let initializer
  /** 定位 Swagger config 声明；同名声明出现歧义时直接失败。 */
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'config') {
      assert.equal(initializer, undefined, 'main.ts 存在多个 config 声明')
      initializer = node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer, 'main.ts 缺少 Swagger config')
  return build(initializer)
}

/** 直接加载四个真实 Controller，以空服务替身生成完整 Swagger，不初始化基础设施。 */
async function snapshot() {
  installSourceLoader()
  const { Test } = localRequire('@nestjs/testing')
  const { FastifyAdapter } = localRequire('@nestjs/platform-fastify')
  const { DocumentBuilder, SwaggerModule } = localRequire('@nestjs/swagger')
  const { PATH_METADATA } = localRequire('@nestjs/common/constants')
  const controllers = controllerFiles.flatMap((file) =>
    Object.values(localRequire(file)).filter(
      (value) => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value),
    ),
  )
  assert.equal(controllers.length, 4, '四个受影响 Controller 未完整加载')
  const dependencies = new Set(
    controllers.flatMap((controller) => Reflect.getMetadata('design:paramtypes', controller) || []),
  )
  const fixture = await Test.createTestingModule({
    controllers,
    providers: [...dependencies].map((provide) => ({ provide, useValue: {} })),
  }).compile()
  const app = fixture.createNestApplication(new FastifyAdapter(), { logger: false })
  try {
    return SwaggerModule.createDocument(app, documentConfig(DocumentBuilder))
  } finally {
    await app.close()
  }
}

/** 在独立 Node 进程内获取文档快照，隔离两份源码的编译及 require 缓存。 */
function loadSnapshot(version) {
  return JSON.parse(
    execFileSync(process.execPath, [__filename, '--snapshot', version], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }),
  )
}

/** 比较 Git HEAD 和工作树实际文档，并仅写入本功能的独立验证证据。 */
async function main() {
  if (revision) {
    process.stdout.write(JSON.stringify(await snapshot()))
    return
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const before = loadSnapshot(head)
  const after = loadSnapshot('current')
  assert.deepEqual(after, before, '四个 Controller 生成的完整 OpenAPI 与 Git HEAD 不一致')
  assert.deepEqual(after.components.securitySchemes, {
    session: { type: 'http', scheme: 'bearer', bearerFormat: 'Opaque Session Token' },
  })
  const operations = Object.entries(after.paths).flatMap(([route, item]) =>
    Object.entries(item)
      .filter(([method]) =>
        ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method),
      )
      .map(([method, operation]) => ({ route, method, security: operation.security || [] })),
  )
  const secured = operations.filter((operation) => operation.security.length)
  assert.ok(secured.length > 0, '没有验证到任何认证声明')
  for (const operation of secured) assert.deepEqual(operation.security, [{ session: [] }])
  const result = {
    verifiedAt: new Date().toISOString(),
    baselineCommit: head,
    comparedSource: 'Git HEAD 与当前服务端源码，在独立 Node 进程和模块缓存中生成文档',
    controllerFiles: controllerFiles.map((file) => path.relative(root, file).replaceAll('\\', '/')),
    fullOpenApiUnchanged: true,
    securitySchemes: after.components.securitySchemes,
    operationCount: operations.length,
    securityOperationCount: secured.length,
    operationSecurityUnchanged: true,
    operationSecurity: operations,
    openApiSha256: crypto.createHash('sha256').update(JSON.stringify(after)).digest('hex'),
    infrastructure:
      '仅四个真实 Controller 与构造器服务替身；未执行 AppModule/bootstrap，未初始化应用、监听端口或连接数据库/Redis/对象存储',
    comparisonScope:
      '受影响的四个 Controller 的完整 OpenAPI；使用当前已安装依赖，不验证真实外部服务连接',
  }
  const evidence = path.resolve(__dirname, '../测试证据/swagger-verification.json')
  fs.mkdirSync(path.dirname(evidence), { recursive: true })
  fs.writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify(
      {
        fullOpenApiUnchanged: true,
        operations: operations.length,
        securityOperations: secured.length,
        evidence,
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
