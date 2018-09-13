module.exports = ({ log: parentLog, blockChain, db }) => {
  const log = parentLog.create('updateContractsFromChain')

  return async () => {
    log.info('Running task ...')

    try {
      const contract = blockChain.getPartyContract()

      // fetch all active parties
      const docs = await db.getActiveParties()

      await Promise.all(docs.map(async doc => {
        await db.updateParty(contract.at(doc.id))
      }))
    } catch (err) {
      log.error('Failed', err)
    }
  }
}
