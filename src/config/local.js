const path = require('path')

module.exports = {
  ETHEREUM_ENDPOINT_WS: 'http://localhost:8545/',
  ETHEREUM_ENDPOINT_RPC: 'http://localhost:8545/',
  NETWORK: 'local',
  FIREBASE: {
    projectId: 'blockparty-local',
    keyFilename: path.join(__dirname, '..', '..', '.googlecloud', 'local.json'),
  }
}
