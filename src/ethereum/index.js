const EventEmitter = require('eventemitter3')
const Web3 = require('web3')
const { Deployer, Conference } = require('@noblocknoparty/contracts')

const { getContract } = require('../utils/contracts')
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

    this._networkId = await this.httpWeb3.eth.net.getId()

    this.deployer = await this.getDeployerContractInstance()

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

  get networkId () {
    return this._networkId
  }

  get web3 () {
    return this.httpWeb3
  }

  async getDeployerContractInstance () {
    const contract = getContract(Deployer, this.wsWeb3)
    let instance

    if (this._config.env.DEPLOYER_CONTRACT_ADDRESS) {
      instance = await contract.at(this._config.env.DEPLOYER_CONTRACT_ADDRESS)
      instance.transactionHash = this._config.env.DEPLOYER_TRANSACTION
    } else {
      instance = await contract.deployed()
      instance.transactionHash = contract.networks[`${this._networkId}`].transactionHash
    }

    return instance
  }

  getPartyContract () {
    return getContract(Conference, this.wsWeb3)
  }

  async _onBlockHeader (blockHeader) {
    this.emit(BLOCK, blockHeader)
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
