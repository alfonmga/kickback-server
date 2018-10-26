import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import path from 'path'
import { spawnSync, spawn as spawnAsync } from 'child_process'

export const projectDir = path.join(__dirname, '..', '..')
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
    shell: '/bin/bash',
    ...options
  })

  if (0 < status || error) {
    throw new Error(`Exit with status: ${status}, error: ${error}, stdout: ${stdout}, stderr: ${stderr}`)
  }

  return stdout ? stdout.toString() : ''
}

export const spawn = async (cmdline, options = {}) => new Promise((resolve, reject) => {
  console.log(`Spawn: ${cmdline}`)

  const [ cmd, ...args ] = cmdline.split(' ')

  const proc = spawnAsync(cmd, args, {
    cwd: tempDir,
    stdio: [ 'ignore', 'pipe', 'pipe' ],
    detached: false,
    shell: '/bin/bash',
    ...options
  })

  const ret = {
    stdout: '',
    stderr: '',
  }

  const _handleError = err => {
    err = new Error(`Startup error: ${JSON.stringify(err)}`)
    ret.err = err
    return reject(ret)
  }

  const _handleOutput = stream => buf => {
    const str = buf.toString()
    ret[stream] += str
    if (str.match(/fatal/igm) || str.match(/not found/igm)) {
      _handleError(str)
    }
  }

  proc.on('error', _handleError)
  proc.stdout.on('data', _handleOutput('stdout'))
  proc.stderr.on('data', _handleOutput('stderr'))

  let exitResolver
  const exitPromise = new Promise(r => {
    exitResolver = r
  })
  proc.on('exit', () => exitResolver())
  ret.terminate = () => {
    proc.kill()
    return exitPromise
  }

  // after 3 seconds assume startup is successful
  setTimeout(() => {
    ret.proc = proc
    resolve(ret)
  }, 3000)
})
