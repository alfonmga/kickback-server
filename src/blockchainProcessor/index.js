module.exports = async (config, log, ethereum, db) => {
  ethereum.onBlock(blockHeader => {
    log.debug(`New Block: ${blockHeader.hash}`)
  })

  ethereum.onNewParty(data => {
    const { returnValues: { deployedAddress } } = data

    log.info(`New deployment at: ${deployedAddress}`)

    // now let's load the contract and fetch its values
  })
}
