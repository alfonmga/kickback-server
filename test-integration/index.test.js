import { promisify } from 'es6-promisify'

import { startServer } from '../src/bootstrap'
import createLog from '../src/log'
import defaultConfig from '../src/config'
import { exec, projectDir, tempDir, cleanTempDir } from './utils'

describe('integration tests', () => {
  let log
  let apiServer

  beforeAll(async () => {
    // clean data folder
    cleanTempDir()

    // clone our contracts repo
    await exec('git clone --depth 1 https://github.com/noblocknoparty/contracts.git', { cwd: tempDir })

    // install deps
    const contractsFolder = `${tempDir}/contracts`
    await exec('yarn', { cwd: contractsFolder })

    // deploy contracts
    const deploymentOutput = await exec('yarn deploy:local', { cwd: contractsFolder, stdio: 'pipe' })

    const [ , deployerAddress ] = deploymentOutput.match(/Deployer: (0x[0-9a-z]+)/i)
    const [ , deployerTx ] = deploymentOutput.match(/tx: (0x[0-9a-z]+)/i)

    if (!deployerAddress || !deployerTx) {
      throw new Error('Could not extract deployer address and/or tx hash')
    }

    console.log(`Deployer: ${deployerAddress} (tx: ${deployerTx})`)

    // build api code
    await exec('yarn build', { cwd: projectDir })

    // log = createLog({
    //   LOG: 'info',
    //   APP_MODE: 'test'
    // })
    //
    // const config = {
    //   ...defaultConfig,
    //   APP_MODE: 'test',
    //   PORT: 58546,
    //   DEPLOYER_CONTRACT_ADDRESS: deployerAddress,
    //   DEPLOYER_TRANSACTION: deployerTx,
    //   // CONFIG_ENCRYPTION_IV: str(),
    //   // CONFIG_ENCRYPTION_KEY: str()
    // }
    //
    // apiServer = await startServer({ log, config })
  })

  afterAll(async () => {
    console.log(log._opts.stream.toString())

    if (apiServer) {
      console.debug('Stopping API server...')
      await promisify(apiServer.close, apiServer)()
      console.debug('...done stopping API server')
    }
  })

  it('works', () => {
    expect(apiServer).toBeDefined()
  })
})
