import Ganache from 'ganache-core'
import Web3 from 'web3'
import { Deployer } from '@noblocknoparty/contracts'
import EventEmitter from 'eventemitter3'

import { getContract } from '../utils/contracts'
import createLog from '../log'
import { BLOCK, NOTIFICATION } from '../constants/events'
import createProcessor from './'
import { getNotificationSetupArgs, getNotificationArgs } from './tasks/sendNotificationEmail'

jest.mock('./tasks/sendNotificationEmail', () => {
  let setupArgs
  let notificationArgs

  const fn = args => {
    setupArgs = args
    return na => {
      notificationArgs = na
    }
  }

  fn.getNotificationSetupArgs = () => setupArgs
  fn.getNotificationArgs = () => notificationArgs

  return fn
})

jest.mock('./tasks/processBlockLogs', () => () => () => {})

describe('blockchain processor', () => {
  let deployer
  let log
  let blockChain
  let db
  let eventQueue

  beforeAll(async () => {
    const provider = Ganache.provider({
      total_accounts: 4,
    })

    const { accounts: accountsMap } = provider.manager.state
    const accounts = Object.keys(accountsMap)

    const web3 = new Web3(provider)

    console.log(`Network id: ${await web3.eth.net.getId()}`)

    const deployerContract = getContract(Deployer, web3, { from: accounts[0] })

    deployer = await deployerContract.new()

    console.log(`Deployer contract at: ${deployer.address}`)

    blockChain = new EventEmitter()
    blockChain.web3 = web3
    blockChain.getDeployerContractInstance = async () => deployer
  })

  beforeEach(async () => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    db = new EventEmitter()
    db.getKey = async () => null

    eventQueue = {}

    await createProcessor({ log, eventQueue, db, blockChain })
  })

  it('handles db notification events', () => {
    const setupArgs = getNotificationSetupArgs()
    expect(setupArgs.db).toEqual(db)
    expect(setupArgs.blockChain).toEqual(blockChain)
    expect(setupArgs.eventQueue).toEqual(eventQueue)

    db.emit(NOTIFICATION, 123)

    expect(getNotificationArgs()).toEqual(123)
  })
})
