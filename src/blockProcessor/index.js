const TruffleContract = require('truffle-contract')

const Overlord = require('./Overlord.json')

module.exports = async (config, log, ethereum) => {
  const OverlordContract = TruffleContract(Overlord)
  OverlordContract.setProvider(ethereum.getWeb3().currentProvider)

  const overlord = await OverlordContract.at(config.env.OVERLORD_CONTRACT_ADDRESS)

  const deployerAddress = await overlord.getDeployer()

  log.info(`Deployer address: ${deployerAddress}`)

  ethereum.onBlock(blockHeader => {
    log.debug(`New Block: ${blockHeader.hash}`)
  })

  ethereum.onLogs(logs => {
    log.debug(`New logs`, logs)
  })
}
