const { NEW_PARTY } = require('../constants/events')

module.exports = async (config, log, blockChain, db) => {
  blockChain.on(NEW_PARTY, contractInstance => {
    log.info(`New deployment at: ${contractInstance.address}`)


    // now let's load the contract and fetch its values
  })
}
