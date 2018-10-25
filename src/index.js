const config = require('./config')
const log = require('./log')(config)
const startServer = require('./bootstrap')

startServer({ log, config }).catch(err => {
  log.error(err)
  process.exit(-1)
})
