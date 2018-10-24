import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import path from 'path'
import { spawnSync, spawn } from 'child_process'

export const projectDir = path.join(__dirname, '..')
export const tempDir = path.join(__dirname, 'data')

export const cleanTempDir = () => {
  rimraf.sync(tempDir)
  mkdirp.sync(tempDir)
}

export const exec = async (cmdline, options = {}) => {
  console.log(`Exec: ${cmdline}`)

  const [ cmd, ...args ] = cmdline.split(' ')

  const { async } = options

  if (async) {
    return new Promise((resolve, reject) => {
      let successTimer

      const proc = spawn(cmd, args, {
        cwd: tempDir,
        detached: false,
        shell: false,
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        ...options
      })

      const ret = {
        stdout: '',
        stderr: '',
      }

      const _handleError = err => {
        clearTimeout(successTimer)
        ret.err = new Error(`Startup error: ${err}`)
        reject(ret)
      }

      const _handleOutput = stream => buf => {
        const str = buf.toString()
        ret[stream] += str
        if ('stderr' === stream) {
          console.error(str)
        }
      }

      proc.on('error', _handleError)
      proc.stdout.on('data', _handleOutput('stdout'))
      proc.stderr.on('data', _handleOutput('stderr'))

      ret.terminate = () => new Promise((resolve2, reject2) => {
        if (proc.killed) {
          resolve2()
          return
        }

        proc.on('exit', code => {
          if (0 !== code) {
            reject2(new Error(`Exit error: ${code}`))
          }

          resolve2()
        })

        proc.on('error', err => {
          reject2(err)
        })

        proc.kill('SIGTERM')
      })

      // after 3 seconds assume startup is successful
      successTimer = setTimeout(() => {
        ret.proc = proc
        proc.removeListener('error', _handleError)
        resolve(ret)
      }, 5000)
    })
  }


  const { status, error, stdout } = spawnSync(cmd, args, {
    cwd: tempDir,
    stdio: 'pipe',
    ...options
  })

  if (0 < status || error) {
    throw new Error(`Exit with status: ${status}, error: ${error}`)
  }

  return stdout ? stdout.toString() : ''
}
