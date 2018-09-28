import Ganache from 'ganache-core'
import Web3 from 'web3'
import delay from 'delay'
import { events } from '@noblocknoparty/contracts'

import createLog from '../../../log'
import createProcessor from './'

jest.mock('ethereum-event-logs', () => ({ parseLog: logs => logs }))

describe('process block logs', () => {
  let accounts
  let log
  let config
  let blockChain
  let db
  let eventQueue
  let processor
  let resolveTestModeTimer
  let partyContract

  beforeAll(async () => {
    const provider = Ganache.provider({
      total_accounts: 4,
    })

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)

    const web3 = new Web3(provider)

    console.log(`Network id: ${await web3.eth.net.getId()}`)
  })

  beforeEach(async () => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    eventQueue = {
      add: jest.fn(fn => fn())
    }

    partyContract = {
      at: jest.fn(async () => 'partyInstance')
    }

    blockChain = {
      web3: {
        blockNumber: 0,
        logs: [],
        eth: {
          getBlockNumber: jest.fn(async () => blockChain.web3.blockNumber),
          getPastLogs: jest.fn(async () => blockChain.web3.logs),
        }
      },
      getPartyContract: async () => partyContract
    }

    db = {
      updatePartyFromContract: jest.fn(async () => {}),
      markPartyEnded: jest.fn(async () => {}),
      markPartyCancelled: jest.fn(async () => {}),
      setNewPartyOwner: jest.fn(async () => {}),
      addPartyAdmin: jest.fn(async () => {}),
      removePartyAdmin: jest.fn(async () => {}),
      updateAttendeeStatus: jest.fn(async () => {}),
      setKey: jest.fn(async () => {})
    }

    let setTimeoutCallback = null
    resolveTestModeTimer = () => {
      if (setTimeoutCallback) {
        const fn = setTimeoutCallback
        setTimeoutCallback = null
        fn()
      }
    }

    config = {
      env: {
        BLOCK_CONFIRMATIONS: 6
      },
      testMode: {
        setTimeout: fn => {
          setTimeoutCallback = fn
        }
      }
    }
  })

  it('does nothing if no blocks to process', async () => {
    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    await processor([])

    expect(eventQueue.add.mock.calls.length).toEqual(1)
    expect(eventQueue.add.mock.calls[0][1]).toEqual({ name: 'processBlockLogs' })

    expect(blockChain.web3.eth.getBlockNumber).not.toHaveBeenCalled()
  })

  it('waits some time before trying to process a block again', async () => {
    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    const blockNumbers = []

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getBlockNumber).not.toHaveBeenCalled()

    blockNumbers.push(0)

    resolveTestModeTimer()

    await delay(100)

    expect(blockChain.web3.eth.getBlockNumber).toHaveBeenCalled()
  })

  it('needs enough confirmations before processing a block', async () => {
    config.env.BLOCK_CONFIRMATIONS = 3
    blockChain.web3.blockNumber = 3

    const blockNumbers = [ 1 ]

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).not.toHaveBeenCalled()

    // now we've got enough confirmations!
    blockChain.web3.blockNumber = 4

    resolveTestModeTimer()

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
  })

  it('processes a block and updates db and list', async () => {
    config.env.BLOCK_CONFIRMATIONS = 1
    blockChain.web3.blockNumber = 4

    const blockNumbers = [ 3, 4 ]

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
    expect(db.setKey).toHaveBeenCalledWith('lastBlockNumber', 3)
    expect(blockNumbers).toEqual([ 4 ])
  })

  it('catches processing error and does not update db and list in such cases', async () => {
    config.env.BLOCK_CONFIRMATIONS = 1
    blockChain.web3.blockNumber = 4
    blockChain.web3.logs = Promise.reject(new Error('test'))

    const blockNumbers = [ 3, 4 ]

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
    expect(db.setKey).not.toHaveBeenCalled()
    expect(blockNumbers).toEqual([ 3, 4 ])
  })

  it('adds new parties to db', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.NewParty.name,
        args: {
          deployedAddress: '0x456',
        },
      }
    ])

    const blockNumbers = [ 1 ]

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(partyContract.at).toHaveBeenCalledWith('0x456')
    expect(db.updatePartyFromContract).toHaveBeenCalledWith('partyInstance')
  })
})
