const path = require('path')

module.exports = {
  ETHEREUM_ENDPOINT_WS: 'wss://mainnet.infura.io/ws',
  ETHEREUM_ENDPOINT_REST: 'https://mainnet.infura.io/',
  NETWORK: 'mainnet',
  FIREBASE: {
    projectId: 'blockparty-live',
    keyFilename: path.join(__dirname, '..', '..', '.googlecloud', 'production.json'),
  }
}
