import EventEmitter from 'eventemitter3'

import createLog from '../log'
import { BLOCK } from '../constants/events'
import createProcessor from './'

jest.mock('./tasks/updateDbFromChain', () => (args => args))
jest.mock('./tasks/processBlockLogs', () => (args => logs => ({ logs, ...args })))

describe('blockchain processor', () => {
  let log
  let blockChain
  let db
  let scheduler
  let eventQueue

  beforeEach(async () => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    blockChain = new EventEmitter()

    db = new EventEmitter()
    db.addParty = jest.fn()

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
    expect(task.log).toBeDefined()
    expect(task.db).toEqual(db)
    expect(task.blockChain).toEqual(blockChain)
  })

  it('process logs from every incoming block', () => {
    blockChain.emit(BLOCK, 'block', 'blockLogs1')

    expect(eventQueue.add).toHaveBeenCalled()
    expect(eventQueue.add.mock.calls[0][1]).toEqual({
      name: 'processBlockLogs'
    })
    const cb = eventQueue.add.mock.calls[0][0]

    const ret = cb()
    expect(ret).toMatchObject({
      logs: 'blockLogs1',
    })
    expect(ret.db).toEqual(db)
    expect(ret.blockChain).toEqual(blockChain)
    expect(ret.log).toBeDefined()
  })
})
