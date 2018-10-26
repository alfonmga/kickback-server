module.exports = ({ config, log: parentLog, db, blockChain, eventQueue }) => {
  const log = parentLog.create('refreshActivePartyData')

  return () => (
    eventQueue.add(async () => {
      try {
        log.info(`Running task ...`)

        const contract = blockChain.getPartyContract()

        const activeParties = await db.getParties({
          stalestFirst: true,
          onlyActive: true,
          limit: config.SYNC_DB_BATCH_SIZE,
        })

        await Promise.all(activeParties.map(async partyEntry => {
          const party = await contract.at(partyEntry.address)

          await db.updatePartyFromContract(party)

          const ended = await party.ended()

          // if not yet ended then sync participant list too
          if (!ended) {
            await db.updateParticipantListFromContract(party)
          }
        }))
      } catch (err) {
        log.error('Failed', err)
      }
    }, { name: 'refreshActivePartyData' })
  )
}
