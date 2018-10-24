import Ganache from 'ganache-core'
import { promisify } from 'es6-promisify'

import { exec, projectDir, tempDir, cleanTempDir } from './utils'

describe('integration tests', () => {
  const API_SERVER_PORT = 58546
  let ganacheServer
  let apiProcess

  beforeAll(async () => {
    // start ganache
    ganacheServer = Ganache.server({
      total_accounts: 300,
      locked: false,
      log: console,
    })
    await promisify(ganacheServer.listen, ganacheServer)(58545)

    // clean data folder
    // cleanTempDir()
    //
    // // clone our contracts repo
    // await exec('git clone --depth 1 https://github.com/noblocknoparty/contracts.git', { cwd: tempDir })
    //
    // // install deps
    const contractsFolder = `${tempDir}/contracts`
    // await exec('yarn', { cwd: contractsFolder })

    // deploy contracts
    const deploymentOutput = await exec('yarn deploy:local', { cwd: contractsFolder })

    const [ , deployerAddress ] = deploymentOutput.match(/Deployer: (0x[0-9a-z]+)/i)
    const [ , deployerTx ] = deploymentOutput.match(/tx: (0x[0-9a-z]+)/i)

    if (!deployerAddress || !deployerTx) {
      throw new Error('Could not extract deployer address and/or tx hash')
    }

    console.log(`Deployer: ${deployerAddress} (tx: ${deployerTx})`)

    // build api code
    await exec('yarn build', { cwd: projectDir })

    // start server
    const env = {
      APP_MODE: 'test',
      BLOCK_CONFIRMATIONS: '0',
      DEPLOYER_ADDRESS: deployerAddress,
      DEPLOYER_TRANSACTION: deployerTx,
      CONFIG_ENCRYPTION_IV: process.env.CONFIG_ENCRYPTION_IV,
      CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
      PORT: API_SERVER_PORT,
      LOG: 'error',
    }

    apiProcess = await exec(`yarn start`, {
      env,
      cwd: projectDir,
      async: true,
    })
  })

  afterAll(async () => {
    if (apiProcess) {
      console.debug('Killing API process...')
      await apiProcess.terminate()
      console.debug('...done killing API process')
    }

    if (ganacheServer) {
      console.debug('Killing Ganache server...')
      await promisify(ganacheServer.close, ganacheServer)()
      console.debug('...done killing Ganache server')
    }
  })

  it('works', () => {
    expect(ganacheServer).toBeDefined()
  })
})
