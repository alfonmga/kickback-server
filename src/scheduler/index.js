const randStr = require('randomstring')

const _idn = (id, name) => `${name}-${id}`

class Scheduler {
  constructor (log, eventQueue) {
    this._log = log.create('scheduler')

    this._jobs = {}
    this._eventQueue = eventQueue

    this.start()
  }

  addJob (name, interval, callback) {
    const id = _idn(randStr(5), name)

    this._log.info(`Add job ${id} to run every ${interval} seconds`)

    this._jobs[id] = {
      name,
      callback,
      intervalMs: interval * 1000,
      lastRun: 0
    }

    this.start()

    return id
  }

  removeJob (id) {
    this._log.info(`Remove job ${id}`)

    delete this._jobs[id]
  }

  start = () => {
    if (!this._running) {
      this._log.info('Start scheduler ...')

      this._running = true
      this._processJobs()
    }
  }

  stop = () => {
    if (this._running) {
      this._log.info('Stop scheduler ...')

      this._running = false
      clearTimeout(this._timer)
    }
  }

  _processJobs = () => {
    if (!this._running) {
      return
    }

    Object.keys(this._jobs).forEach(id => {
      const job = this._jobs[id]
      const { lastRun, intervalMs, callback } = job
      const now = Date.now()

      if (now - lastRun >= intervalMs) {
        this._log.debug(`Adding job to queue: ${id} ...`)

        job.lastRun = now

        this._eventQueue.add(async () => callback(), {
          name: `Scheduled job: ${id}`
        })
      }
    })

    // check every second
    this._timer = setTimeout(this._processJobs, 1000)
  }
}

module.exports = (log, eventQueue) => new Scheduler(log, eventQueue)