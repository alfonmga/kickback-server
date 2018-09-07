import Ganache from 'ganache-core'
import Web3 from 'web3'
import { Conference, Deployer } from '@noblocknoparty/contracts'
import Log from 'logarama'

import { BLOCK, NEW_PARTY } from '../constants/events'
import { getContract } from './utils'
import initEthereum from './'

describe('ethereum', () => {
  let provider
  let accounts
  let web3
  let deployerContract
  let deployer
  let config
  let log
  let ethereum

  beforeAll(async () => {
    log = new Log({
      minLevel: 'warn'
    })

    provider = Ganache.provider({
      total_accounts: 4
    })

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)

    web3 = new Web3(provider)

    deployerContract = getContract(Deployer, web3, { from: accounts[0] })
    deployer = await deployerContract.new()

    log.info(`Deployer contract at: ${deployer.address}`)

    config = {
      provider,
      NETWORK: 'test',
      env: {
        DEPLOYER_CONTRACT_ADDRESS: deployer.address
      }
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

  it('will emit new blocks when they arrive', async () => {
    ethereum = await initEthereum(config, log)

    const spy = jest.fn()

    ethereum.on(BLOCK, spy)

    await deployerContract.new()

    expect(spy).toHaveBeenCalled()

    const block = spy.mock.calls[0][0]

    expect(block).toBeDefined()

    const web3Block = await web3.eth.getBlock('latest')

    // size key doesn't match, so remove it
    delete block.size
    delete web3Block.size

    // ensure the rest matches up
    expect(web3Block).toMatchObject(block)
  })

  it('will emit new parties when they are created', async () => {
    ethereum = await initEthereum(config, log)

    const spy = jest.fn()

    ethereum.on(NEW_PARTY, spy)

    await deployer.deploy('My event', 0, 0, 0, 'key')

    expect(spy).toHaveBeenCalled()

    const party = spy.mock.calls[0][0]

    expect(party).toBeDefined()

    const { address } = party

    const partyInstance = await getContract(Conference, web3).at(address)

    const owner = await partyInstance.owner()
    expect(owner.toLowerCase()).toEqual(accounts[0].toLowerCase())

    const [ name, deposit, limitOfParticipants, coolingPeriod ] = await Promise.all([
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod()
    ])

    expect(party).toMatchObject({
      name,
      deposit,
      limitOfParticipants,
      coolingPeriod
    })
  })
})
