const path = require('path')

module.exports = {
  ETHEREUM_ENDPOINT_WS: 'wss://ropsten.infura.io/ws',
  ETHEREUM_ENDPOINT_REST: 'https://ropsten.infura.io/',
  NETWORK: 'ropsten',
  FIREBASE: {
    projectId: 'blockparty-dev-214214',
    keyFilename: path.join(__dirname, '..', '..', '.googlecloud', 'dev.json'),
  }
}
