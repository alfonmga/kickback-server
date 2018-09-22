const { events: contractEvents } = require('@noblocknoparty/contracts')
const { parseLog } = require('ethereum-event-logs')

const { STATUS: ATTENDEE_STATUS } = require('../../constants/attendees')

const eventAbis = Object.values(contractEvents)


module.exports = ({ log: parentLog, blockChain, db, eventQueue }) => {
  const log = parentLog.create('processBlockLogs')

  const _processLogs = async logs => {
    const PartyContract = await blockChain.getPartyContract()

    try {
      // get our events and categorize them by name
      const categorized = parseLog(logs, eventAbis).reduce((m, event) => {
        const { name } = event

        if (!m[name]) {
          m[name] = []
        }

        m[name].push(event)

        return m
      }, {})

      // load in new parties
      if (categorized[contractEvents.NewParty.name]) {
        await Promise.all(categorized[contractEvents.NewParty.name].map(async event => {
          const instance = await PartyContract.at(event.args.deployedAddress)

          return db.addPartyFromContract(instance)
        }))
      }

      // for parties which have ended
      if (categorized[contractEvents.EndParty.name]) {
        await Promise.all(categorized[contractEvents.EndParty.name].map(async event => {
          const { address } = event

          await db.markPartyEnded(address)
        }))
      }

      // for parties which have been cancelled
      if (categorized[contractEvents.CancelParty.name]) {
        await Promise.all(categorized[contractEvents.CancelParty.name].map(async event => {
          const { address } = event

          await db.markPartyCancelled(address)
        }))
      }

      // add new attendees
      if (categorized[contractEvents.Register.name]) {
        await Promise.all(categorized[contractEvents.Register.name].map(async event => {
          const { address, args: { addr: attendee } } = event

          return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.REGISTERED)
        }))
      }

      // mark attendees as attended
      if (categorized[contractEvents.Attend.name]) {
        await Promise.all(categorized[contractEvents.Attend.name].map(async event => {
          const { address, args: { addr: attendee } } = event

          return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.ATTENDED)
        }))
      }

      // mark attendees as having withdrawn payout
      if (categorized[contractEvents.Withdraw.name]) {
        await Promise.all(categorized[contractEvents.Withdraw.name].map(async event => {
          const { address, args: { addr: attendee } } = event

          return db.updateAttendeeStatus(address, attendee, ATTENDEE_STATUS.WITHDRAWN_PAYOUT)
        }))
      }
    } catch (err) {
      log.error('Failed', err)
    }
  }

  const _process = async blocksToProcess => (
    eventQueue.add(async () => {
      // get next block to process
      const blockNumber = blocksToProcess.shift()

      if (blockNumber) {
        log.info(`Processing block ${blockNumber} ...`)

        // get its logs
        const logs = await blockChain.web3.eth.getPastLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber
        })

        // process them
        await _processLogs(logs)

        // update db
        await db.setKey('lastBlockNumber', blockNumber)
      }

      // onto the next one...
      if (blocksToProcess.length) {
        // if some left to process then go straight away
        _process(blocksToProcess)
      } else {
        // if none left to process then wait 20 seconds
        log.info(`No blocks to process, sleeping for a bit ...`)

        setTimeout(() => _process(blocksToProcess), 10000)
      }
    }, { name: 'processBlockLogs' })
  )

  return _process
}
