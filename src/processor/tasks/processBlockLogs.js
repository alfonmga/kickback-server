const { events: contractEvents } = require('@noblocknoparty/contracts')
const { parseLog } = require('ethereum-event-logs')

const { ATTENDEE_STATUS } = require('../../constants/status')

const eventAbis = Object.values(contractEvents)


module.exports = ({ log: parentLog, blockChain, db, eventQueue }) => {
  const log = parentLog.create('processBlockLogs')

  const _processLogs = async logs => {
    const PartyContract = await blockChain.getPartyContract()

    // get our events and categorize them by name
    const categorized = parseLog(logs, eventAbis).reduce((m, event) => {
      const { name } = event

      if (!m[name]) {
        m[name] = []
      }

      m[name].push(event)

      return m
    }, {})

    const _process = (n, mapfn) => Promise.all((categorized[n] || []).map(mapfn))

    // new parties
    await _process(contractEvents.NewParty.name, async event => {
      const instance = await PartyContract.at(event.args.deployedAddress)

      return db.updatePartyFromContract(instance)
    })

    // mark parties which have ended
    await _process(contractEvents.EndParty.name, async event => {
      const { address } = event

      return db.markPartyEnded(address)
    })

    // mark parties which have been cancelled
    await _process(contractEvents.CancelParty.name, async event => {
      const { address } = event

      return db.markPartyCancelled(address)
    })

    // new owner
    await _process(contractEvents.ChangeOwner.name, async event => {
      const { address, args: { newOwner } } = event

      return db.setNewPartyOwner(address, newOwner)
    })

    // add admin
    await _process(contractEvents.AddAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.addPartyAdmin(address, grantee)
    })

    // remove admin
    await _process(contractEvents.RemoveAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.removePartyAdmin(address, grantee)
    })

    // add new attendees
    await _process(contractEvents.Register.name, async event => {
      const { address, args: { addr: attendee } } = event

      return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.REGISTERED)
    })

    // mark attendees as attended
    await _process(contractEvents.Attend.name, async event => {
      const { address, args: { addr: attendee } } = event

      return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.ATTENDED)
    })

    // mark attendees as having withdrawn payout
    await _process(contractEvents.Withdraw.name, async event => {
      const { address, args: { addr: attendee } } = event

      return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.WITHDRAWN_PAYOUT)
    })
  }

  const _process = async blocksToProcess => (
    eventQueue.add(async () => {
      // get next block to process
      const blockNumber = blocksToProcess[0]

      if (blockNumber) {
        log.info(`Processing block ${blockNumber} ...`)

        // get its logs
        const logs = await blockChain.web3.eth.getPastLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber
        })

        try {
          // process them
          await _processLogs(logs)
          // update the db
          await db.setKey('lastBlockNumber', blockNumber)
          // remove block from list so that we don't do it again
          blockNumber.shift()
        } catch (err) {
          log.error(`Error processing block ${blockNumber}`, err)
        }
      }

      // onto the next one...
      if (blocksToProcess.length) {
        // if some left to process then go straight away
        _process(blocksToProcess)
      } else {
        // if none left to process then wait 20 seconds
        log.debug(`No blocks to process, sleeping for a bit ...`)

        setTimeout(() => _process(blocksToProcess), 10000)
      }
    }, { name: 'processBlockLogs' })
  )

  return _process
}
