import Ganache from 'ganache-core'
import Web3 from 'web3'
import { toWei } from 'web3-utils'
import { Conference } from '@noblocknoparty/contracts'

import { getContract } from '../../../utils/contracts'
import createLog from '../../../log'
import createProcessor from './'

describe('refresh active party data', () => {
  let log
  let web3
  let accounts
  let config
  let blockChain
  let db
  let eventQueue
  let processor
  let parties
  let deployed

  beforeAll(async () => {
    const provider = Ganache.provider({
      total_accounts: 4,
    })

    web3 = new Web3(provider)

    console.log(`Network id: ${await web3.eth.net.getId()}`)

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)
  })

  beforeEach(async () => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    eventQueue = {
      add: jest.fn(fn => fn())
    }

    const Contract = getContract(Conference, web3)

    const deposit = toWei('0.002', 'ether')
    deployed = [
      await Contract.new('c1', deposit, 10, 3, accounts[0], { from: accounts[0] }),
      await Contract.new('c2', deposit, 10, 3, accounts[1], { from: accounts[1] }),
      await Contract.new('c3', deposit, 10, 3, accounts[2], { from: accounts[2] }),
    ]

    // end it so that sync does not try to sync participant list
    await deployed[2].cancel({ from: accounts[2] })

    blockChain = {
      getPartyContract: () => ({
        at: jest.fn(async addr => deployed.find(d => d.address === addr))
      })
    }

    parties = [
      {
        address: deployed[0].address,
      },
      {
        address: deployed[1].address,
      },
      {
        address: deployed[2].address,
      }
    ]

    db = {
      updatePartyFromContract: jest.fn(async () => {}),
      getParties: jest.fn(async () => parties),
      updateParticipantListFromContract: jest.fn(async () => {})
    }

    config = {
      SYNC_DB_BATCH_SIZE: 23
    }
  })

  it('updates db from contracts for active parties', async () => {
    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    await processor()

    expect(eventQueue.add.mock.calls.length).toEqual(1)
    expect(eventQueue.add.mock.calls[0][1]).toEqual({ name: 'refreshActivePartyData' })

    expect(db.getParties).toHaveBeenCalledWith({
      stalestFirst: true,
      onlyActive: true,
      limit: 23,
    })
    expect(db.updateParticipantListFromContract).toHaveBeenCalledTimes(2)
    expect(db.updateParticipantListFromContract).toHaveBeenCalledWith(deployed[0])
    expect(db.updateParticipantListFromContract).toHaveBeenCalledWith(deployed[1])
  })

  it('gracefully handles errors', async () => {
    db.updatePartyFromContract = jest.fn(() => Promise.reject(new Error('123')))

    processor = createProcessor({ config, log, blockChain, db, eventQueue })

    await processor()

    expect(eventQueue.add.mock.calls.length).toEqual(1)
    expect(eventQueue.add.mock.calls[0][1]).toEqual({ name: 'refreshActivePartyData' })

    expect(db.getParties).toHaveBeenCalled()
  })
})
