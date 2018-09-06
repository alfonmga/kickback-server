import Ganache from 'ganache-core'
import Web3 from 'web3'
import Deployer from '@noblocknoparty/contracts/build/contracts/Deployer.json'
import Log from 'logarama'

import { getContract } from './utils'
import initEthereum from './'

describe('ethereum', () => {
  let provider
  let accounts
  let web3
  let deployer
  let config
  let log
  let ethereum

  beforeAll(async () => {
    log = new Log({
      minLevel: 'debug'
    })

    provider = Ganache.provider({
      total_accounts: 4
    })

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)

    web3 = new Web3(provider)

    deployer = await getContract(Deployer, web3, { from: accounts[0] }).new()

    log.info(`Deployer contract at: ${deployer.address}`)

    config = {
      provider,
      NETWORK: 'test'
    }
  })

  afterEach(async () => {
    if (ethereum) {
      await ethereum.shutdown()
    }
  })

  it('can be initialized', async () => {
    ethereum = await initEthereum(config, log)

    expect(ethereum).toBeDefined()
  })
})
