const EventEmitter = require('eventemitter3')
const Web3 = require('web3')
const { Deployer, Conference } = require('@noblocknoparty/contracts')

const { getContract } = require('./utils')
const { BLOCK, NEW_PARTY } = require('../constants/events')


class EventWatcher {
  constructor ({ log, eventName, lowLevelEmitter, callback }) {
    this.eventName = eventName
    this.log = log
    this.lowLevelEmitter = lowLevelEmitter
    this.callback = callback

    this.lowLevelEmitter.on('data', this._onData.bind(this))
    this.lowLevelEmitter.on('error', this._onError.bind(this))
  }

  addListener (cb) {
    const existing = this.listeners.find(f => f === cb)

    if (!existing) {
      this.listeners.push(cb)
    }
  }

  _onData (data) {
    this.log.trace(`${this.eventName} subscription event`, data)

    this.callback(data)
  }

  _onError (err) {
    this.log.error(`${this.eventName} subscription error`, err)
  }

  async shutdown () {
    this.lowLevelEmitter.removeAllListeners()
  }
}


class Manager extends EventEmitter {
  constructor ({ config, log }) {
    super()
    this.config = config
    this.log = log.create('ethereum')
  }

  async init () {
    this.wsWeb3 = new Web3(
      this.config.provider || new Web3.providers.WebsocketProvider(this.config.ETHEREUM_ENDPOINT_WS)
    )

    this.httpWeb3 = new Web3(
      this.config.provider || new Web3.providers.HttpProvider(this.config.ETHEREUM_ENDPOINT_RPC)
    )

    this.log.info(`Ethereum connected to '${this.config.NETWORK}', real network id: ${await this.httpWeb3.eth.net.getId()}`)

    const contract = this.getDeployerContract()

    if (this.config.env.DEPLOYER_CONTRACT_ADDRESS) {
      this.deployer = await contract.at(this.config.env.DEPLOYER_CONTRACT_ADDRESS)
    } else {
      this.deployer = await contract.deployed()
    }

    this.blockWatcher = await this._subscribe(
      'newBlockHeaders', {}, this._onBlock.bind(this)
    )

    this.newPartyWatcher = await this._watchEvent(
      this.deployer, 'NewParty', {}, this._onNewParty.bind(this)
    )
  }

  async shutdown () {
    await Promise.all([
      (this.blockWatcher ? this.blockWatcher.shutdown() : Promise.resolve()),
      (this.newPartyWatcher ? this.newPartyWatcher.shutdown() : Promise.resolve())
    ])
  }

  getWeb3 () {
    return this.httpWeb3
  }

  getDeployerContract () {
    return getContract(Deployer, this.wsWeb3)
  }

  getPartyContract () {
    return getContract(Conference, this.wsWeb3)
  }

  _onBlock (data) {
    this.emit(BLOCK, data)
  }

  _onNewParty ({ returnValues: { deployedAddress } }) {
    const contract = this.getPartyContract()

    contract.at(deployedAddress)
      .then(contractInstance => (
        Promise.all([
          contractInstance.name(),
          contractInstance.deposit(),
          contractInstance.limitOfParticipants(),
          contractInstance.coolingPeriod()
        ])
          .then(([ name, deposit, limitOfParticipants, coolingPeriod ]) => {
            this.emit(NEW_PARTY, {
              address: contractInstance.address,
              name,
              deposit,
              limitOfParticipants,
              coolingPeriod
            })
          })
      ))
      .catch(err => {
        this.log.error(`Error processing party at ${deployedAddress}`, err)
      })
  }

  async _subscribe (filterName, filterArgs, callback) {
    const sub = await new Promise((resolve, reject) => {
      const e = this.wsWeb3.eth.subscribe(filterName, filterArgs, err => {
        if (err) {
          reject(err)
        }
      })

      // if not yet errored then must be ok!
      setTimeout(() => resolve(e), 250)
    })

    return new EventWatcher({
      log: this.log,
      eventName: filterName,
      lowLevelEmitter: sub,
      callback
    })
  }

  async _watchEvent (truffleContract, eventName, filterArgs, callback) {
    const eventWatcher = await new Promise((resolve, reject) => {
      const e = truffleContract.contract.events[eventName](filterArgs, err => {
        if (err) {
          reject(err)
        }
      })

      // if not yet errored then must be ok!
      setTimeout(() => resolve(e), 250)
    })

    return new EventWatcher({ log: this.log, eventName, lowLevelEmitter: eventWatcher, callback })
  }
}

module.exports = async (...args) => {
  const e = new Manager(...args)

  await e.init()

  return e
}
