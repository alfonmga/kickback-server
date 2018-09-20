const bunyan = require('bunyan')

class Log {
  constructor (opts) {
    this._opts = opts
    this._name = opts.name
    this._log = bunyan(opts)

    ;[ 'trace', 'debug', 'info', 'warn', 'error' ].forEach(fn => {
      this[fn] = (...args) => {
        this._log[fn].apply(this._log, [ {}, ...args ])
      }
    })
  }

  create (name) {
    return new Log({
      ...this._opts,
      name: `${this._name}/${name}`,
    })
  }
}

module.exports = config => new Log({
  name: 'root',
  streams: [
    {
      level: config.LOG,
      stream: process.stdout,
    },
  ],
  appMode: config.APP_MODE
})
