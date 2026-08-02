import { readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const removableDirectories = new Set(['.vite', 'coverage', 'dist', 'dist-ssr'])

function assertInsideProject(targetPath) {
  const relativePath = relative(projectRoot, targetPath)

  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relativePath)) {
    throw new Error(`Refusing to remove path outside the project: ${targetPath}`)
  }
}

async function remove(targetPath) {
  assertInsideProject(targetPath)
  await rm(targetPath, { force: true, recursive: true })
  console.log(`Removed ${relative(projectRoot, targetPath)}`)
}

async function clean(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === '.git' || entry.name === 'node_modules') return

      const targetPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        if (removableDirectories.has(entry.name)) {
          await remove(targetPath)
          return
        }

        await clean(targetPath)
        return
      }

      if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) {
        await remove(targetPath)
      }
    }),
  )
}

await clean(projectRoot)
