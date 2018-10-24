import delay from 'delay'

import createLog from '../log'
import initScheduler from './'

describe('ethereum', () => {
  let scheduler
  let log

  beforeEach(() => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    scheduler = initScheduler({
      log,
    })
  })

  afterEach(() => {
    scheduler.stop()
  })

  it('schedules and runs a job straight away', async () => {
    const spy = jest.fn()

    scheduler.schedule('test', 1200, spy)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('schedules and runs a job every N seconds', async () => {
    const spy = jest.fn()

    scheduler.schedule('test', 1, spy)

    await delay(2500)

    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('can unschedule a job', async () => {
    const spy = jest.fn()

    const id = scheduler.schedule('test', 1, spy)

    scheduler.unschedule(id)

    await delay(2500)

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
