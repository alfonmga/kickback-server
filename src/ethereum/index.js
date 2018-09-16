const EventEmitter = require('eventemitter3')
const Web3 = require('web3')
const { Deployer, Conference, events } = require('@noblocknoparty/contracts')
const { parseLog } = require('ethereum-event-logs')

const { getContract } = require('./utils')
const { BLOCK } = require('../constants/events')


class EventWatcher {
  constructor ({ log, eventName, lowLevelEmitter, callback }) {
    this._eventName = eventName
    this._log = log
    this._lowLevelEmitter = lowLevelEmitter
    this._callback = callback

    this._lowLevelEmitter.on('data', this._onData.bind(this))
    this._lowLevelEmitter.on('error', this._onError.bind(this))
  }

  addListener (cb) {
    const existing = this.listeners.find(f => f === cb)

    if (!existing) {
      this.listeners.push(cb)
    }
  }

  _onData (data) {
    this._log.trace(`${this._eventName} subscription event`, data)

    this._callback(data)
  }

  _onError (err) {
    this._log.error(`${this._eventName} subscription error`, err)
  }

  async shutdown () {
    this._lowLevelEmitter.removeAllListeners()
  }
}


class Manager extends EventEmitter {
  constructor ({ config, log }) {
    super()
    this._config = config
    this._log = log.create('ethereum')
  }

  async init () {
    this.wsWeb3 = new Web3(
      this._config.provider
        || new Web3.providers.WebsocketProvider(this._config.ETHEREUM_ENDPOINT_WS)
    )

    this.httpWeb3 = new Web3(
      this._config.provider || new Web3.providers.HttpProvider(this._config.ETHEREUM_ENDPOINT_HTTP)
    )

    this._log.info(`Connected to '${this._config.NETWORK}' network, id: ${await this.httpWeb3.eth.net.getId()}`)

    const contract = this.getDeployerContract()

    if (this._config.env.DEPLOYER_CONTRACT_ADDRESS) {
      this.deployer = await contract.at(this._config.env.DEPLOYER_CONTRACT_ADDRESS)
    } else {
      this.deployer = await contract.deployed()
    }

    this._log.info(`Deployer address: ${this.deployer.address}`)

    this.blockWatcher = await this._subscribe(
      'newBlockHeaders', this._onBlockHeader.bind(this)
    )
  }

  async shutdown () {
    await Promise.all([
      (this.blockWatcher ? this.blockWatcher.shutdown() : Promise.resolve()),
      (this.newPartyWatcher ? this.newPartyWatcher.shutdown() : Promise.resolve())
    ])
  }

  web3 () {
    return this.httpWeb3
  }

  getDeployerContract () {
    return getContract(Deployer, this.wsWeb3)
  }

  getPartyContract () {
    return getContract(Conference, this.wsWeb3)
  }

  async _onBlockHeader (blockHeader) {
    const logs = await this.httpWeb3.eth.getPastLogs({
      fromBlock: blockHeader.number,
      toBlock: blockHeader.number
    })

    this.emit(BLOCK, blockHeader, parseLog(logs, [ events.NewParty ], {
      address: this.deployer.address
    }))
  }

  async _subscribe (filterName, callback) {
    return new EventWatcher({
      log: this._log,
      eventName: filterName,
      lowLevelEmitter: this.wsWeb3.eth.subscribe(filterName),
      callback
    })
  }
}

module.exports = async (...args) => {
  const e = new Manager(...args)

  await e.init()

  return e
}
