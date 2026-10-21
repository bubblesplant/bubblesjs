import { resolve } from 'node:path'
import ts from 'typescript'

const appRoot = resolve('apps/web')
const configPath = resolve(appRoot, 'test/tsconfig.json')
const loaded = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file))
const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, resolve('apps/web/test'))
const files = config.fileNames.filter((file) =>
  /\/test\/dictionary\/|auto-imports\.d\.ts$/.test(file.replaceAll('\\', '/')),
)
const options = { ...config.options, noEmit: true }
const host = ts.createCompilerHost(options)
host.getCurrentDirectory = () => appRoot
const program = ts.createProgram(files, options, host)
const diagnostics = [
  ...(loaded.error ? [loaded.error] : []),
  ...config.errors,
  ...ts.getPreEmitDiagnostics(program),
]
console.log(JSON.stringify({ files, errors: diagnostics.length }))
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
      getCanonicalFileName: (file) => file,
      getNewLine: () => ts.sys.newLine,
    }),
  )
  process.exitCode = 1
}
