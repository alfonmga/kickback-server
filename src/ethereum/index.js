const EventEmitter = require('eventemitter3')
const Web3 = require('web3')
const { Deployer, Conference } = require('@noblocknoparty/contracts')

const { getContract } = require('../utils/contracts')
const { BLOCK } = require('../constants/events')


class EventWatcher {
  constructor ({ log, eventName, web3, checkActiveTimerDelay, onFailActiveCheck, callback }) {
    this._eventName = eventName
    this._log = log.create(eventName)
    this._web3 = web3
    this._callback = callback
    this._checkActiveTimerDelay = checkActiveTimerDelay
    this._onFailActiveCheck = onFailActiveCheck
    this._setupSubscription()
  }

  addListener (cb) {
    const existing = this.listeners.find(f => f === cb)

    if (!existing) {
      this.listeners.push(cb)
    }
  }

  _onData (data) {
    clearTimeout(this._checkActiveTimer)

    this._log.trace(`${this._eventName} subscription event`, data)

    this._callback(data)

    this._restartActiveCheckTimer()
  }

  _onError (err) {
    this._log.error(`${this._eventName} subscription error`, err)
  }

  _setupSubscription () {
    if (this._subscription) {
      this._subscription.removeAllListeners()
    }

    this._log.info(`Subscribing to ${this._eventName}...`)
    this._subscription = this._web3.eth.subscribe(this._eventName)
    this._subscription.on('data', this._onData.bind(this))
    this._subscription.on('error', this._onError.bind(this))

    this._restartActiveCheckTimer()
  }

  _restartActiveCheckTimer () {
    this._checkActiveTimer = setTimeout(async () => {
      this._log.info('Subscription does not seem to be active anymore :/ ...')

      await this._onFailActiveCheck()
    }, this._checkActiveTimerDelay)
  }

  async shutdown () {
    clearTimeout(this._checkActiveTimer)
    this._subscription.removeAllListeners()
  }
}


class Manager extends EventEmitter {
  constructor ({ config, log }) {
    super()
    this._config = config
    this._log = log.create('ethereum')
  }

  async init () {
    this._log.info('Initializing ...')

    await this._connect()
  }

  async shutdown () {
    if (this.blockWatcher) {
      await this.blockWatcher.shutdown()
    }
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

    if (this._config.DEPLOYER_CONTRACT_ADDRESS) {
      instance = await contract.at(this._config.DEPLOYER_CONTRACT_ADDRESS)
      instance.transactionHash = this._config.DEPLOYER_TRANSACTION
    } else {
      instance = await contract.deployed()
      instance.transactionHash = contract.networks[`${this._networkId}`].transactionHash
    }

    return instance
  }

  getPartyContract () {
    return getContract(Conference, this.wsWeb3)
  }

  async _subscriptionNoLongerActive () {
    this._log.info('Subscription does not seem to be working, so re-connecting ...')

    await this.shutdown() // reset all resources
    await this._connect()
  }

  async _connect () {
    this._log.info(`Connecting to '${this._config.NETWORK}' network ...`)

    try {
      this.wsWeb3 = new Web3(
        this._config.provider
          || new Web3.providers.WebsocketProvider(this._config.ETHEREUM_ENDPOINT_WS)
      )

      this.httpWeb3 = new Web3(
        this._config.provider ||
          new Web3.providers.HttpProvider(this._config.ETHEREUM_ENDPOINT_HTTP)
      )

      this._networkId = await this.httpWeb3.eth.net.getId()

      this._log.info(`Connected to '${this._config.NETWORK}' network, id: ${this._networkId}`)

      this.deployer = await this.getDeployerContractInstance()

      this._log.info(`Deployer address: ${this.deployer.address}`)

      this.blockWatcher = await this._subscribe(
        'newBlockHeaders', this._onBlockHeader.bind(this)
      )
    } catch (err) {
      this._log.error('Connection failure', err)

      await new Promise(resolve => {
        setTimeout(() => {
          this._log.info('Trying again ...')

          resolve(this._connect())
        }, 10000)
      })
    }
  }

  async _onBlockHeader (blockHeader) {
    this.emit(BLOCK, blockHeader)
  }

  async _subscribe (filterName, callback) {
    return new EventWatcher({
      log: this._log,
      eventName: filterName,
      web3: this.wsWeb3,
      checkActiveTimerDelay: 120000, /* should get one block atleast every 2 minutes */
      onFailActiveCheck: () => this._subscriptionNoLongerActive(),
      callback
    })
  }
}

module.exports = async (...args) => {
  const e = new Manager(...args)

  await e.init()

  return e
}
