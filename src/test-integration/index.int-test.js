import delay from 'delay'
import Web3 from 'web3'
import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import { ApolloLink } from 'apollo-link'
import gql from 'graphql-tag'
import fetch from 'node-fetch'

import { exec, spawn, projectDir, tempDir, cleanTempDir } from './utils'

describe('integration tests', () => {
  let apiServer
  let client
  let web3

  beforeAll(async () => {
    web3 = new Web3('http://localhost:8545')

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

    const env = {
      PATH: process.env.PATH,
      APP_MODE: 'local',
      BLOCK_CONFIRMATIONS: '0',
      PORT: '58546',
      DEPLOYER_CONTRACT_ADDRESS: deployerAddress,
      DEPLOYER_TRANSACTION: deployerTx
    }

    try {
      apiServer = await spawn('yarn start', { cwd: projectDir, env })
    } catch (err) {
      console.error(err)
      throw err
    }

    client = new ApolloClient({
      link: ApolloLink.from([
        new HttpLink({
          uri: 'http://localhost:58546/graphql',
          credentials: 'same-origin',
          fetch,
        })
      ]),
      cache: new InMemoryCache()
    })

    await delay(8000)
  })

  afterAll(async () => {
    if (apiServer) {
      console.debug('Stopping API server...')
      // console.log(apiServer.stdout)
      await apiServer.terminate()
      console.debug('...done stopping API server')
    }
  })

  describe('non-auth', () => {
    it('returns network id', async () => {
      const { data: { networkId } } = await client.query({
        query: gql`
          query getNetworkId {
            networkId: networkId
          }
        `,
      })

      const realNetworkId = await web3.eth.net.getId()

      expect(networkId).toEqual(`${realNetworkId}`)
    })
  })
})
