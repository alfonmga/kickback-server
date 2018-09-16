import EventEmitter from 'eventemitter3'
import Log from 'logarama'

import { BLOCK } from '../constants/events'
import createProcessor from './'

jest.mock('./tasks/updateDbFromChain', () => (args => args))
jest.mock('./tasks/insertNewPartiesIntoDb', () => (args => events => ({ events, ...args })))

describe('blockchain processor', () => {
  let log
  let blockChain
  let db
  let scheduler
  let eventQueue

  beforeEach(async () => {
    log = new Log({ minLevel: 'warn' })

    blockChain = new EventEmitter()

    db = {
      addParty: jest.fn()
    }

    scheduler = {
      schedule: jest.fn()
    }

    eventQueue = {
      add: jest.fn()
    }

    await createProcessor({ log, eventQueue, scheduler, db, blockChain })
  })

  it('adds the cron job to the scheduler', () => {
    expect(scheduler.schedule).toHaveBeenCalled()

    const [ name, timeoutSeconds, task ] = scheduler.schedule.mock.calls[0]

    expect(name).toEqual('updateDbFromChain')
    expect(timeoutSeconds).toEqual(300)
    expect(task.log).toBeInstanceOf(Log)
    expect(task.db).toEqual(db)
    expect(task.blockChain).toEqual(blockChain)
  })

  it('puts new parties into the database', () => {
    blockChain.emit(BLOCK, 'block', 'blockEvents1')

    expect(eventQueue.add).toHaveBeenCalled()
    expect(eventQueue.add.mock.calls[0][1]).toEqual({
      name: 'insertNewPartiesIntoDb'
    })
    const cb = eventQueue.add.mock.calls[0][0]

    const ret = cb()
    expect(ret).toMatchObject({
      events: 'blockEvents1',
    })
    expect(ret.db).toEqual(db)
    expect(ret.blockChain).toEqual(blockChain)
    expect(ret.log).toBeInstanceOf(Log)
  })
})
