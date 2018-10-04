const { events: contractEvents } = require('@noblocknoparty/contracts')
const { parseLog } = require('ethereum-event-logs')
const safeGet = require('lodash.get')
const { toHex } = require('web3-utils')

const { ATTENDEE_STATUS } = require('../../../constants/status')

const eventAbis = Object.values(contractEvents)


module.exports = ({ config, log: parentLog, blockChain, db, eventQueue }) => {
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

    const _processEvent = (n, mapfn) => Promise.all((categorized[n] || []).map(mapfn))

    // new parties
    await _processEvent(contractEvents.NewParty.name, async event => {
      const instance = await PartyContract.at(event.args.deployedAddress)

      return db.updatePartyFromContract(instance)
    })

    // mark parties which have ended
    await _processEvent(contractEvents.EndParty.name, async event => {
      const { address } = event

      return db.markPartyEnded(address)
    })

    // mark parties which have been cancelled
    await _processEvent(contractEvents.CancelParty.name, async event => {
      const { address } = event

      return db.markPartyCancelled(address)
    })

    // new owner
    await _processEvent(contractEvents.ChangeOwner.name, async event => {
      const { address, args: { newOwner } } = event

      return db.setNewPartyOwner(address, newOwner)
    })

    // add admin
    await _processEvent(contractEvents.AddAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.addPartyAdmin(address, grantee)
    })

    // remove admin
    await _processEvent(contractEvents.RemoveAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.removePartyAdmin(address, grantee)
    })

    // add new attendees
    await _processEvent(contractEvents.Register.name, async event => {
      const { address, args: { addr: attendee, participantIndex: index } } = event

      return db.updateAttendeeStatus(address, attendee, {
        status: ATTENDEE_STATUS.REGISTERED,
        index
      })
    })

    // mark attendees as attended
    await _processEvent(contractEvents.Attend.name, async event => {
      const { address, args: { addr: attendee } } = event

      return db.updateAttendeeStatus(address, attendee, {
        status: ATTENDEE_STATUS.ATTENDED
      })
    })

    // mark attendees as having withdrawn payout
    await _processEvent(contractEvents.Withdraw.name, async event => {
      const { address, args: { addr: attendee } } = event

      return db.updateAttendeeStatus(address, attendee, {
        status: ATTENDEE_STATUS.WITHDRAWN_PAYOUT
      })
    })
  }

  const _process = async blocksToProcess => (
    eventQueue.add(async () => {
      // get next block to process
      const blockNumber = blocksToProcess[0]

      let processed = false

      if (0 <= blockNumber) {
        try {
          const currentBlockNumber = await blockChain.web3.eth.getBlockNumber()

          if (currentBlockNumber - blockNumber < config.BLOCK_CONFIRMATIONS) {
            log.debug(`Not enough confirmations to process block ${blockNumber}, need ${config.BLOCK_CONFIRMATIONS}`)
          } else {
            log.debug(`Processing block ${blockNumber} ...`)

            // get its logs
            const logs = await blockChain.web3.eth.getPastLogs({
              fromBlock: toHex(blockNumber),
              toBlock: toHex(blockNumber)
            })

            // process them
            await _processLogs(logs)
            // update the db
            await db.setKey('lastBlockNumber', blockNumber)
            // remove block from list so that we don't do it again
            blocksToProcess.shift()
            // we processed something!
            processed = true
          }
        } catch (err) {
          log.error(`Error processing block ${blockNumber}`, err)
        }
      }

      // if no processing to do or processing failed then wait for a bit
      if (processed && blocksToProcess.length) {
        _process(blocksToProcess)
      } else {
        safeGet(config, 'testMode.setTimeout', setTimeout)(
          () => _process(blocksToProcess),
          10000 /* 10 seconds */
        )
      }
    }, { name: 'processBlockLogs' })
  )

  return _process
}
