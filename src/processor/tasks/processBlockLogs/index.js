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

    // finalize event
    await _processEvent(contractEvents.Finalize.name, async event => {
      const { address, args: { maps } } = event

      return db.finalizeAttendance(address, maps)
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
      // get next block range to process
      const { start, end } = blocksToProcess

      if (start && end && start <= end) {
        try {
          const currentBlockNumber = await blockChain.web3.eth.getBlockNumber()

          const maxEndByConfirmations = currentBlockNumber - config.BLOCK_CONFIRMATIONS
          const cappedEnd = (end > maxEndByConfirmations) ? maxEndByConfirmations : end
          // dont' do more than X no. of blocks at a time, so that
          // we don't overload the infura/client node
          const finalEnd = (cappedEnd - start > config.BLOCK_RANGE)
            ? start + config.BLOCK_RANGE
            : cappedEnd
          const finalStart = start

          if (finalEnd < finalStart) {
            log.debug(`Not enough confirmations to process blocks ${start} - ${end}, need ${config.BLOCK_CONFIRMATIONS}`)
          } else {
            log.debug(`Processing blocks ${finalStart} - ${finalEnd} ...`)

            // get logs
            const logs = await blockChain.web3.eth.getPastLogs({
              fromBlock: toHex(finalStart),
              toBlock: toHex(finalEnd)
            })

            // process them
            await _processLogs(logs)
            // update the db
            await db.setKey('lastBlockNumber', finalEnd)
            // update processing range
            blocksToProcess.start = finalEnd + 1
          }
        } catch (err) {
          log.error(`Error processing block range: ${start} - ${end}`, err)
        }
      }

      safeGet(config, 'testMode.setTimeout', setTimeout)(
        () => _process(blocksToProcess),
        10000 /* 10 seconds */
      )
    }, { name: 'processBlockLogs' })
  )

  return _process
}
