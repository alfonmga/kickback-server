import Ganache from 'ganache-core'
import Web3 from 'web3'
import { Deployer } from '@noblocknoparty/contracts'

import createLog from '../log'
import { BLOCK } from '../constants/events'
import { getContract } from '../utils/contracts'
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
    log = createLog({
      LOG: 'warn',
      APP_MODE: 'test'
    })

    provider = Ganache.provider({
      total_accounts: 4,
    })

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)

    web3 = new Web3(provider)

    console.log(`Network id: ${await web3.eth.net.getId()}`)

    deployerContract = getContract(Deployer, web3, { from: accounts[0] })

    deployer = await deployerContract.new()

    console.log(`Deployer contract at: ${deployer.address}`)

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
    ethereum = await initEthereum({ config, log })

    expect(ethereum).toBeDefined()
  })

  it('can return a web3 instance', () => {
    expect(ethereum.web3).toEqual(ethereum.httpWeb3)
  })

  it('can return network id', async () => {
    expect(ethereum.networkId).toEqual(await ethereum.web3.eth.net.getId())
  })

  it('can return a deployer contract instance', async () => {
    const instance = await ethereum.getDeployerContractInstance()

    expect(instance.address).toEqual(deployer.address)
    expect(instance.deploy).toBeDefined()
  })

  it('will emit new blocks when they arrive', async () => {
    ethereum = await initEthereum({ config, log })

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
})
