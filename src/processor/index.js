const { BLOCK, NOTIFICATION } = require('../constants/events')

module.exports = async ({ log: parentLog, eventQueue, db, blockChain }) => {
  const log = parentLog.create('processor')

  const sendNotificationEmail = require('./tasks/sendNotificationEmail')({ log, db, blockChain, eventQueue })
  const processBlockLogs = require('./tasks/processBlockLogs')({ log, db, blockChain, eventQueue })

  // start processing blocks from where we last got to!
  let lastBlockNumber = await db.getKey('lastBlockNumber')
  if (!lastBlockNumber) {
    log.info(`No last block number found, so calculating when to start from ...`)

    // work out which block number to start watching from
    const { transactionHash } = await blockChain.getDeployerContractInstance()
    const { blockNumber } = await blockChain.web3.eth.getTransactionReceipt(transactionHash)
    // block after one in which deployer was deployed is our starting block
    lastBlockNumber = blockNumber + 1
  } else {
    lastBlockNumber += 1
  }

  // now see what the latest block number is
  const latestBlockNumber = await blockChain.web3.eth.getBlockNumber()

  // ongoing chain of blocks that need processing
  const blocksToProcess = []

  if (latestBlockNumber >= lastBlockNumber) {
    log.info(`Will first process from blocks ${lastBlockNumber} to ${latestBlockNumber}`)

    // fill up chain with block numbers
    while (lastBlockNumber <= latestBlockNumber) {
      blocksToProcess.push(lastBlockNumber)
      lastBlockNumber += 1
    }
  } else {
    log.info('Block processor is fully up-to-date with blocks')
  }

  // now listen for new blocks
  blockChain.on(BLOCK, ({ number }) => {
    blocksToProcess.push(number)
  })

  // listen for notifications
  db.on(NOTIFICATION, sendNotificationEmail)

  // start processing blocks
  processBlockLogs(blocksToProcess)
}
