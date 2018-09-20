const { BLOCK, NOTIFICATION } = require('../constants/events')

module.exports = async ({ log: parentLog, scheduler, eventQueue, db, blockChain }) => {
  const log = parentLog.create('processor')

  const updateDbFromChain = require('./tasks/updateDbFromChain')({ log, db, blockChain })
  const insertNewPartiesIntoDb = require('./tasks/insertNewPartiesIntoDb')({ log, db, blockChain })
  const sendNotificationEmail = require('./tasks/sendNotificationEmail')({ log, db, blockChain })

  // every 5 minutes we want to refresh db data
  scheduler.schedule('updateDbFromChain', 300, updateDbFromChain)

  // when new notification is triggered
  db.on(NOTIFICATION, id => {
    eventQueue.add(() => sendNotificationEmail(id), {
      name: `sendNotificationEmail:${id}`
    })
  })

  // when new block is received
  blockChain.on(BLOCK, (block, blockEvents) => {
    eventQueue.add(() => insertNewPartiesIntoDb(blockEvents), {
      name: 'insertNewPartiesIntoDb'
    })
  })
}
