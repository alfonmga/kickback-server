const { NEW_PARTY } = require('../constants/events')

module.exports = async ({ log: parentLog, scheduler, db, blockChain }) => {
  const log = parentLog.create('processor')

  scheduler.addJob(
    'updateContractsFromChain',
    300, /* once every 5 minutes */
    require('./tasks/updateContractsFromChain')({ log, db, blockChain })
  )

  blockChain.on(NEW_PARTY, async contractInstance => {
    log.info(`New deployment at: ${contractInstance.address}`)

    try {
      await db.addParty(contractInstance)
    } catch (err) {
      log.error('Error adding new party to db', err)
    }
  })
}
