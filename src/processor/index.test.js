import Ganache from 'ganache-core'
import Web3 from 'web3'
import { Deployer } from '@noblocknoparty/contracts'
import EventEmitter from 'eventemitter3'

import { getContract } from '../utils/contracts'
import createLog from '../log'
import { BLOCK, NOTIFICATION } from '../constants/events'
import createProcessor from './'
import { getNotificationSetupArgs, getNotificationArgs } from './tasks/sendNotificationEmail'
import { getBPSetupArgs, getBPArgs } from './tasks/processBlockLogs'
import { getSyncSetupArgs, getSyncArgs } from './tasks/syncDbWithChain'

jest.mock('./tasks/syncDbWithChain', () => {
  let setupArgs
  let syncArgs

  const fn = args => {
    setupArgs = args
    return na => {
      syncArgs = na
    }
  }

  fn.getSyncSetupArgs = () => setupArgs
  fn.getSyncArgs = () => syncArgs

  return fn
})

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

jest.mock('./tasks/processBlockLogs', () => {
  let setupArgs
  let blockArgs

  const fn = args => {
    setupArgs = args
    return blockList => {
      blockArgs = blockList
    }
  }

  fn.getBPSetupArgs = () => setupArgs
  fn.getBPArgs = () => blockArgs

  return fn
})

describe('blockchain processor', () => {
  let config
  let deployer
  let log
  let blockChain
  let db
  let eventQueue
  let scheduler
  let lastBlockNumber

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
    config = {}

    scheduler = {
      schedule: jest.fn()
    }

    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    db = new EventEmitter()
    lastBlockNumber = null
    db.getKey = async () => lastBlockNumber

    eventQueue = {}
  })

  it('handles db notification events', async () => {
    await createProcessor({ config, log, eventQueue, db, blockChain, scheduler })

    const setupArgs = getNotificationSetupArgs()
    expect(setupArgs.db).toEqual(db)
    expect(setupArgs.blockChain).toEqual(blockChain)
    expect(setupArgs.eventQueue).toEqual(eventQueue)

    db.emit(NOTIFICATION, 123)

    expect(getNotificationArgs()).toEqual(123)
  })

  it('schedules sync task', async () => {
    config.SYNC_DB_DELAY_SECONDS = 1200
    await createProcessor({ config, log, eventQueue, db, blockChain, scheduler })

    const setupArgs = getSyncSetupArgs()
    expect(setupArgs.db).toEqual(db)
    expect(setupArgs.blockChain).toEqual(blockChain)
    expect(setupArgs.eventQueue).toEqual(eventQueue)

    expect(scheduler.schedule).toHaveBeenCalledTimes(1)
    expect(scheduler.schedule.mock.calls[0].slice(0, 2)).toEqual([ 'syncDbWithChain', 1200 ])

    const fn = scheduler.schedule.mock.calls[0][2]

    fn(123)

    expect(getSyncArgs()).toEqual(123)
  })

  it('starts processing blocks', async () => {
    await createProcessor({ config, log, eventQueue, db, blockChain, scheduler })

    const setupArgs = getBPSetupArgs()
    expect(setupArgs.config).toEqual(config)
    expect(setupArgs.db).toEqual(db)
    expect(setupArgs.blockChain).toEqual(blockChain)
    expect(setupArgs.eventQueue).toEqual(eventQueue)

    const blockRange = getBPArgs()
    expect(blockRange).toEqual({
      start: 2
    })

    blockChain.emit(BLOCK, { number: 123 })
    blockChain.emit(BLOCK, { number: 456 })

    expect(blockRange).toEqual({
      start: 2,
      end: 456,
    })
  })

  it('catches up on missed blocks', async () => {
    lastBlockNumber = -5

    await createProcessor({ config, log, eventQueue, db, blockChain, scheduler })

    const blockRange = getBPArgs()

    expect(blockRange).toEqual({
      start: -4,
      end: 1,
    })

    blockChain.emit(BLOCK, { number: 123 })
    blockChain.emit(BLOCK, { number: 456 })

    expect(blockRange).toEqual({
      start: -4,
      end: 456,
    })
  })
})
