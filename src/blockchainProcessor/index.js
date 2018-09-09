const { NEW_PARTY } = require('../constants/events')

module.exports = async (config, log, blockChain, db) => {
  blockChain.on(NEW_PARTY, contractInstance => {
    log.info(`New deployment at: ${contractInstance.address}`)

    db.addParty(contractInstance).catch(err => {
      log.error('Error adding new party to db', err)
    })
  })
}
