module.exports = async (config, log, ethereum) => {
  ethereum.onBlock(blockHeader => {
    log.debug(`New Block: ${blockHeader.hash}`)
  })

  ethereum.onDeploy(data => {
    log.debug(`New deployment`, data)
  })
}
