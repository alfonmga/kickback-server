const { PARTICIPANT_STATUS, addressesMatch } = require('@noblocknoparty/shared')
const { toBN } = require('web3-utils')

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
            // insert missing participants
            const registered = await party.registered()

            const fns = []

            for (let i = 1; registered >= i; i += 1) {
              // eslint-disable-next-line no-loop-func
              fns.push(async () => {
                const pAddress = await party.participantsIndex(i)
                const p = await party.participants(pAddress)

                const ps = await db.getParticipants(party.address)

                const found = ps.find(({ address }) => addressesMatch(address, pAddress))

                if (!found) {
                  await db.updateParticipantStatus(party.address, pAddress.toLowerCase(), {
                    status: PARTICIPANT_STATUS.REGISTERED,
                    index: toBN(p.index).toString(10)
                  })
                } else {
                  // even if found, let's update so that we fetch user's latest profile details
                  // and store them in their participant entry
                  await db.updateParticipantStatus(party.address, pAddress.toLowerCase(), {
                    status: found.status,
                    index: found.index,
                  })
                }
              })
            }

            await Promise.all(fns.map(fn => fn()))
          }
        }))
      } catch (err) {
        log.error('Failed', err)
      }
    }, { name: 'refreshActivePartyData' })
  )
}
