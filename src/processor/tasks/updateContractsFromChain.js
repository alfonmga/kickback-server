module.exports = ({ log: parentLog, blockChain, db }) => {
  const log = parentLog.create('updateContractsFromChain')

  return async () => {
    log.info('Running task ...')

    try {
      const contract = blockChain.getPartyContract()

      // fetch all active parties, 1000 at a time, and ensure we update stalest first
      const docs = await db.getActiveParties({ stalestFirst: true, limit: 1000 })

      await Promise.all(docs.map(async doc => (
        db.updateParty(contract.at(doc.id))
      )))
    } catch (err) {
      log.error('Failed', err)
    }
  }
}
