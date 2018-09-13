module.exports = ({ log: parentLog, blockChain, db }) => {
  const log = parentLog.create('updateContractsFromChain')

  return async () => {
    log.info('Running task ...')

    try {
      const contract = blockChain.getPartyContract()

      /*
      Fetch all active parties, 1000 at a time (to avoid the task running too
      long), and ensure we update stalest first.

      Because we set "lastUpdated" inside db.updateParty() it means we will
      end up updating a different batch of parties during each run of this task.
       */
      const docs = await db.getActiveParties({ stalestFirst: true, limit: 1000 })

      await Promise.all(docs.map(async doc => (
        db.updateParty(contract.at(doc.id))
      )))
    } catch (err) {
      log.error('Failed', err)
    }
  }
}
