const Web3 = require('web3')
const promisify = require('es6-promisify')

const subscribe = async (web3, log, filterName, ...args) => {
  const sub = web3.eth.subscribe(filterName, ...args)

  sub.on('error', err => {
    log.error(`${filterName} subscription error`, err)
  })

  const listeners = []

  sub.on('data', data => {
    log.debug(`${filterName} subscription event`)

    listeners.forEach(fn => {
      try {
        fn(data)
      } catch (err) {
        log.debug(`${filterName} subscription callback error`, err)
      }
    })
  })

  return {
    addListener: fn => {
      const existing = listeners.find(f => f === fn)

      if (!existing) {
        listeners.push(fn)
      }
    },
    shutdown: () => promisify(sub.unsubscribe.bind(sub))()
  }
}

module.exports = async (config, log) => {
  const web3ForSub = new Web3(
    new Web3.providers.WebsocketProvider(config.ETHEREUM_ENDPOINT_WS)
  )

  const web3Rpc = new Web3(
    new Web3.providers.HttpProvider(config.ETHEREUM_ENDPOINT_RPC)
  )

  const blockSub = await subscribe(web3ForSub, log, 'newBlockHeaders')
  const logSub = await subscribe(web3ForSub, log, 'logs', {})

  log.info(`Ethereum connected to '${config.NETWORK}', real network id: ${await web3Rpc.eth.net.getId()}`)

  return {
    shutdown: () => Promise.all([
      logSub.shutdown(),
      blockSub.shutdown()
    ]),
    getWeb3: () => web3Rpc,
    onLogs: cb => logSub.addListener(cb),
    onBlock: cb => blockSub.addListener(cb),
  }
}
