const { BLOCK } = require('../constants/events')

module.exports = async ({ log: parentLog, scheduler, eventQueue, db, blockChain }) => {
  const log = parentLog.create('processor')

  const updateDbFromChain = require('./tasks/updateDbFromChain')({ log, db, blockChain })
  const insertNewParties = require('./tasks/insertNewPartiesIntoDb')({ log, db, blockChain })

  // every 5 minutes we want to refresh db data
  scheduler.schedule('updateDbFromChain', 300, updateDbFromChain)

  blockChain.on(BLOCK, (block, blockEvents) => {
    eventQueue.add(() => insertNewParties(blockEvents), {
      name: 'insertNewParties'
    })
  })
}
