import EventEmitter from 'eventemitter3'
import Log from 'logarama'

import { NEW_PARTY } from '../constants/events'
import createProcessor from './'

jest.mock('./tasks/updateContractsFromChain', () => (args => args))

describe('blockchain processor', () => {
  let log
  let blockChain
  let db
  let scheduler

  beforeEach(async () => {
    log = new Log({ minLevel: 'warn' })

    blockChain = new EventEmitter()

    db = {
      addParty: jest.fn()
    }

    scheduler = {
      addJob: jest.fn()
    }

    await createProcessor({ log, scheduler, db, blockChain })
  })

  it('adds the cron job to the scheduler', () => {
    expect(scheduler.addJob).toHaveBeenCalled()

    const [ name, timeoutSeconds, task ] = scheduler.addJob.mock.calls[0]

    expect(name).toEqual('updateContractsFromChain')
    expect(timeoutSeconds).toEqual(300)
    expect(task.db).toEqual(db)
    expect(task.blockChain).toEqual(blockChain)
    expect(task.log).toBeInstanceOf(Log)
  })

  it('puts new parties into the database', () => {
    const contractInstance = {
      address: '0xabc'
    }

    db.addParty.mockImplementationOnce(() => Promise.resolve())

    blockChain.emit(NEW_PARTY, contractInstance)

    expect(db.addParty).toHaveBeenCalledWith(contractInstance)
  })

  it('handles errors when putting new parties into the database', () => {
    const contractInstance = {
      address: '0xabc'
    }

    db.addParty.mockImplementationOnce(() => Promise.reject(new Error('test')))

    blockChain.emit(NEW_PARTY, contractInstance)

    expect(db.addParty).toHaveBeenCalledWith(contractInstance)
  })
})
