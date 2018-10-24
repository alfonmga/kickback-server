const { BLOCK, NOTIFICATION } = require('../constants/events')

module.exports = async ({ config, log: parentLog, scheduler, eventQueue, db, blockChain }) => {
  const log = parentLog.create('processor')

  const sendNotificationEmail = require('./tasks/sendNotificationEmail')({ log, db, blockChain, eventQueue })
  const processBlockLogs = require('./tasks/processBlockLogs')({ config, log, db, blockChain, eventQueue })
  const syncDbWithChain = require('./tasks/syncDbWithChain')({ config, log, db, blockChain, eventQueue })

  // start processing blocks from where we last got to!
  let lastBlockNumber = await db.getKey('lastBlockNumber')
  if (!lastBlockNumber) {
    log.info(`No last block number found, so calculating when to start from ...`)

    // work out which block number to start watching from
    const { transactionHash } = await blockChain.getDeployerContractInstance()

    log.info(`Transaction hash for deployer contract deployment: ${transactionHash}`)

    const { blockNumber } = await blockChain.web3.eth.getTransactionReceipt(transactionHash)

    log.info(`Block number for deployer contract deployment: ${blockNumber}`)

    // block after one in which deployer was deployed is our starting block
    lastBlockNumber = blockNumber + 1
  } else {
    lastBlockNumber += 1
  }

  // ongoing range of blocks that need processing
  const blocksToProcess = {
    start: lastBlockNumber
  }

  // now see what the latest block number is
  const latestBlockNumber = await blockChain.web3.eth.getBlockNumber()

  if (latestBlockNumber >= lastBlockNumber) {
    log.info(`Will first process from blocks ${lastBlockNumber} to ${latestBlockNumber}`)

    blocksToProcess.end = latestBlockNumber
  } else {
    log.info('Block processor is fully up-to-date with blocks')
  }

  // now listen for new blocks
  blockChain.on(BLOCK, ({ number }) => {
    log.debug(`New block recieved: ${number}`)

    blocksToProcess.end = number
    if (!blocksToProcess.start) {
      blocksToProcess.start = number
    }
  })

  // listen for notifications
  db.on(NOTIFICATION, sendNotificationEmail)

  // start processing blocks
  processBlockLogs(blocksToProcess)

  // schedule other jobs
  scheduler.schedule('syncDbWithChain', config.SYNC_DB_DELAY_SECONDS, syncDbWithChain)
}
