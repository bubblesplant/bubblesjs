import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { basename } from 'node:path'

const originalSpawn = childProcess.spawn

function spawnWithGitOutputEncoding(command, ...args) {
  const child = originalSpawn(command, ...args)
  if (/^git(?:\.exe)?$/i.test(basename(command))) child.stdout?.setEncoding('utf8')
  return child
}

childProcess.spawn = spawnWithGitOutputEncoding
syncBuiltinESMExports()
