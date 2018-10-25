import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import path from 'path'
import { spawnSync } from 'child_process'

export const projectDir = path.join(__dirname, '..')
export const tempDir = path.join(__dirname, 'data')

export const cleanTempDir = () => {
  rimraf.sync(tempDir)
  mkdirp.sync(tempDir)
}

export const exec = async (cmdline, options = {}) => {
  console.log(`Exec: ${cmdline}`)

  const [ cmd, ...args ] = cmdline.split(' ')

  const { status, error, stdout, stderr } = spawnSync(cmd, args, {
    cwd: tempDir,
    stdio: 'inherit',
    ...options
  })

  if (0 < status || error) {
    throw new Error(`Exit with status: ${status}, error: ${error}, stdout: ${stdout}, stderr: ${stderr}`)
  }

  return stdout ? stdout.toString() : ''
}
