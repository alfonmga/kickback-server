const { events: { NewParty } } = require('@noblocknoparty/contracts')

module.exports = ({ log: parentLog, blockChain, db }) => {
  const log = parentLog.create('insertNewPartiesIntoDb')

  return async blockEvents => {
    const newPartyEvents = blockEvents.filter(({ name }) => name === NewParty.name)

    log.debug(`Running task (${newPartyEvents.length} new parties) ...`)

    try {
      const contract = await blockChain.getPartyContract()

      await Promise.all(newPartyEvents.map(async event => {
        const instance = await contract.at(event.args.deployedAddress)

        log.info(`New party at: ${instance.address}`)

        await db.addParty(instance)
      }))
    } catch (err) {
      log.error('Failed', err)
    }
  }
}
