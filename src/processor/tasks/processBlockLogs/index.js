const { events: contractEvents } = require('@noblocknoparty/contracts')
const { PARTICIPANT_STATUS } = require('@noblocknoparty/shared')
const { parseLog } = require('ethereum-event-logs')
const safeGet = require('lodash.get')
const { toHex } = require('web3-utils')

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

    const _processEventSeq = (n, mapfn) => (categorized[n] || []).reduce((m, e) => (
      m.then(() => mapfn(e))
    ), Promise.resolve())

    // new parties
    await _processEvent(contractEvents.NewParty.name, async event => {
      const instance = await PartyContract.at(event.args.deployedAddress)

      return db.addPartyFromContract(instance)
    })

    // new owners
    await _processEvent(contractEvents.ChangeOwner.name, async event => {
      const { address, args: { newOwner } } = event

      return db.setNewPartyOwner(address, newOwner)
    })

    // add admins
    await _processEventSeq(contractEvents.AddAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.addPartyAdmin(address, grantee)
    })

    // remove admins
    await _processEventSeq(contractEvents.RemoveAdmin.name, async event => {
      const { address, args: { grantee } } = event

      return db.removePartyAdmin(address, grantee)
    })

    // register participants
    await _processEventSeq(contractEvents.Register.name, async event => {
      const { address, args: { addr: participant, index } } = event

      return db.updateParticipantStatus(address, participant, {
        status: PARTICIPANT_STATUS.REGISTERED,
        index
      })
    })

    // finalize event
    await _processEvent(contractEvents.Finalize.name, async event => {
      const { address, args: { maps } } = event

      return db.finalize(address, maps)
    })

    // mark parties which have been cancelled
    await _processEvent(contractEvents.CancelParty.name, async event => {
      const { address } = event

      return db.markPartyCancelled(address)
    })

    // mark participants as having withdrawn payout
    await _processEventSeq(contractEvents.Withdraw.name, async event => {
      const { address, args: { addr: participant } } = event

      return db.updateParticipantStatus(address, participant, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT
      })
    })
  }

  const _process = async blocksToProcess => (
    eventQueue.add(async () => {
      // get next block range to process
      const { start, end } = blocksToProcess

      log.debug(`Current block range: ${start} - ${end}`)

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
