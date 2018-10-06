import Ganache from 'ganache-core'
import Web3 from 'web3'
import delay from 'delay'
import { events } from '@noblocknoparty/contracts'

import { PARTICIPANT_STATUS } from '../../../constants/status'
import createLog from '../../../log'
import createProcessor from './'

jest.mock('ethereum-event-logs', () => ({ parseLog: logs => logs }))

describe('process block logs', () => {
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
      updateParticipantStatus: jest.fn(async () => {}),
      finalizeAttendance: jest.fn(async () => {}),
      setKey: jest.fn(async () => {}),
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
      BLOCK_RANGE: 100,
      BLOCK_CONFIRMATIONS: 6,
      testMode: {
        setTimeout: fn => {
          setTimeoutCallback = fn
        }
      }
    }
  })

  it('does nothing if no blocks to process', async () => {
    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    await processor({})

    expect(eventQueue.add.mock.calls.length).toEqual(1)
    expect(eventQueue.add.mock.calls[0][1]).toEqual({ name: 'processBlockLogs' })

    expect(blockChain.web3.eth.getBlockNumber).not.toHaveBeenCalled()
  })

  it('waits some time before trying to process a block again', async () => {
    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    const blockNumbers = {}

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getBlockNumber).not.toHaveBeenCalled()

    blockNumbers.start = 1
    blockNumbers.end = 1

    resolveTestModeTimer()

    await delay(100)

    expect(blockChain.web3.eth.getBlockNumber).toHaveBeenCalled()
  })

  it('needs enough confirmations before processing a block', async () => {
    config.BLOCK_CONFIRMATIONS = 3
    blockChain.web3.blockNumber = 3

    const blockNumbers = {
      start: 1,
      end: 1
    }

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
    config.BLOCK_CONFIRMATIONS = 1
    blockChain.web3.blockNumber = 4

    const blockNumbers = {
      start: 3,
      end: 4,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
    expect(db.setKey).toHaveBeenCalledWith('lastBlockNumber', 3)
    expect(blockNumbers).toEqual({
      start: 4,
      end: 4,
    })
  })

  it('only processes maximum BLOCK_RANGE blocks at a time', async () => {
    config.BLOCK_RANGE = 15
    config.BLOCK_CONFIRMATIONS = 1
    blockChain.web3.blockNumber = 5000

    const blockNumbers = {
      start: 300,
      end: 4000,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
    expect(db.setKey).toHaveBeenCalledWith('lastBlockNumber', 315)
    expect(blockNumbers).toEqual({
      start: 316,
      end: 4000,
    })
  })

  it('catches processing error and does not update db and list in such cases', async () => {
    config.BLOCK_CONFIRMATIONS = 1
    blockChain.web3.blockNumber = 4
    blockChain.web3.logs = Promise.reject(new Error('test'))

    const blockNumbers = {
      start: 3,
      end: 4,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(blockChain.web3.eth.getPastLogs).toHaveBeenCalled()
    expect(db.setKey).not.toHaveBeenCalled()
    expect(blockNumbers).toEqual({
      start: 3,
      end: 4,
    })
  })

  it('adds new parties', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.NewParty.name,
        args: {
          deployedAddress: '0x456',
        },
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(partyContract.at).toHaveBeenCalledWith('0x456')
    expect(db.updatePartyFromContract).toHaveBeenCalledWith('partyInstance')
  })

  it('mark parties which have ended', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.EndParty.name,
        address: '0x456'
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.markPartyEnded).toHaveBeenCalledWith('0x456')
  })

  it('marks parties which have been cancelled', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.CancelParty.name,
        address: '0x456'
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.markPartyCancelled).toHaveBeenCalledWith('0x456')
  })

  it('sets new party owners', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.ChangeOwner.name,
        address: '0x456',
        args: {
          newOwner: '0x123'
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.setNewPartyOwner).toHaveBeenCalledWith('0x456', '0x123')
  })

  it('adds party admins', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.AddAdmin.name,
        address: '0x456',
        args: {
          grantee: '0x123'
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.addPartyAdmin).toHaveBeenCalledWith('0x456', '0x123')
  })

  it('removes party admins', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.RemoveAdmin.name,
        address: '0x456',
        args: {
          grantee: '0x123'
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.removePartyAdmin).toHaveBeenCalledWith('0x456', '0x123')
  })

  it('adds party participants', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.Register.name,
        address: '0x456',
        args: {
          addr: '0x123',
          participantIndex: 2
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.updateParticipantStatus).toHaveBeenCalledWith('0x456', '0x123', {
      status: PARTICIPANT_STATUS.REGISTERED,
      index: 2,
    })
  })

  it('finalizes participants', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.Finalize.name,
        address: '0x456',
        args: {
          maps: [ 1, 2, 3 ]
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.finalizeAttendance).toHaveBeenCalledWith('0x456', [ 1, 2, 3 ])
  })

  it('marks participants as withdrawn payout', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.Withdraw.name,
        address: '0x456',
        args: {
          addr: '0x123'
        }
      }
    ])

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.updateParticipantStatus).toHaveBeenCalledWith('0x456', '0x123', {
      status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT
    })
  })

  it('if processing passes then the block number gets updated in db', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.Withdraw.name,
        address: '0x456',
        args: {
          addr: '0x123'
        }
      }
    ])

    const blockNumbers = {
      start: 2,
      end: 2,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.setKey).toHaveBeenCalledWith('lastBlockNumber', 2)
  })

  it('if any processing fails then the whole thing fails', async () => {
    blockChain.web3.blockNumber = 10
    blockChain.web3.logs = Promise.resolve([
      {
        name: events.Withdraw.name,
        address: '0x456',
        args: {
          addr: '0x123'
        }
      }
    ])

    db.updateParticipantStatus = jest.fn(() => Promise.reject(new Error('test')))

    const blockNumbers = {
      start: 1,
      end: 1,
    }

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    processor(blockNumbers)

    await delay(100)

    expect(db.setKey).not.toHaveBeenCalled()
  })
})
