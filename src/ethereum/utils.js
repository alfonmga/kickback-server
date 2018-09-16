const TruffleContract = require('truffle-contract')

exports.getContract = (contractDefinition, web3, defaults = {}) => {
  const Contract = TruffleContract(JSON.parse(JSON.stringify(contractDefinition)))

  Contract.setProvider(web3.currentProvider)

  Contract.defaults(defaults)

  return Contract
}
