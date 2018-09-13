module.exports = ({ log: parentLog, blockChain, db }) => {
  const log = parentLog.create('updateContractsFromChain')

  return async () => {
    log.info('Running task ...')

    try {
      const contract = blockChain.getPartyContract()

      // fetch all active parties
      const query = db.collection('party').where('ended', '==', false)

      const querySnapshot = await query.get()

      await Promise.all(querySnapshot.map(async docSnapshot => {
        await db.updateParty(contract.at(docSnapshot.id))
      }))
    } catch (err) {
      log.error('Failed', err)
    }
  }
}
