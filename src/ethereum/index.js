const Web3 = require('web3')
const { Deployer } = require('@noblocknoparty/contracts')

const { getContract } = require('./utils')


class EventWatcher {
  constructor (log, eventName, eventEmitter, responseProcessor) {
    this.eventName = eventName
    this.log = log
    this.eventEmitter = eventEmitter
    this.listeners = []
    this.responseProcessor = responseProcessor

    this.eventEmitter.on('data', this._onData.bind(this))
    this.eventEmitter.on('error', this._onError.bind(this))
  }

  addListener (cb) {
    const existing = this.listeners.find(f => f === cb)

    if (!existing) {
      this.listeners.push(cb)
    }
  }

  _onData (data) {
    this.log.trace(`${this.eventName} subscription event`, data)

    if (this.responseProcessor) {
      data = this.responseProcessor(data)
    }

    this.listeners.forEach(fn => {
      try {
        fn(data)
      } catch (err) {
        this.log.warn(`${this.eventName} subscription callback error`, err)
      }
    })
  }

  _onError (err) {
    this.log.error(`${this.eventName} subscription error`, err)
  }

  async shutdown () {
    this.listeners = []
    this.eventEmitter.removeAllListeners()
  }
}


class Manager {
  constructor (config, log) {
    this.config = config
    this.log = log
  }

  async init () {
    this.wsWeb3 = new Web3(
      this.config.provider || new Web3.providers.WebsocketProvider(this.config.ETHEREUM_ENDPOINT_WS)
    )

    this.httpWeb3 = new Web3(
      this.config.provider || new Web3.providers.HttpProvider(this.config.ETHEREUM_ENDPOINT_RPC)
    )

    this.log.info(`Ethereum connected to '${this.config.NETWORK}', real network id: ${await this.httpWeb3.eth.net.getId()}`)

    const contract = getContract(Deployer, this.httpWeb3)
    if (this.config.env.DEPLOYER_CONTRACT_ADDRESS) {
      this.deployer = await contract.at(this.config.env.DEPLOYER_CONTRACT_ADDRESS)
    } else {
      this.deployer = await contract.deployed()
    }

    this.blockWatcher = await this._subscribe('newBlockHeaders')
    this.newPartyWatcher = await this._watchEvent(this.deployer, 'NewParty', {}, ({ returnValues }) => ({
      ...returnValues
    }))
  }

  async shutdown () {
    await Promise.all([
      (this.blockWatcher ? this.blockWatcher.shutdown() : Promise.resolve()),
      (this.newPartyWatcher ? this.newPartyWatcher.shutdown() : Promise.resolve())
    ])
  }

  onBlock (cb) {
    this.blockWatcher.addListener(cb)
  }

  onNewParty (cb) {
    this.newPartyWatcher.addListener(cb)
  }

  getWeb3 () {
    return this.httpWeb3
  }

  async _subscribe (filterName, ...filterArgs) {
    const sub = await new Promise((resolve, reject) => {
      const e = this.wsWeb3.eth.subscribe(filterName, ...filterArgs, err => {
        if (err) {
          reject(err)
        }
      })

      // if not yet errored then must be ok!
      setTimeout(() => resolve(e), 250)
    })

    return new EventWatcher(this.log, filterName, sub)
  }

  async _watchEvent (truffleContract, eventName, filterArgs, responseProcessor) {
    const eventWatcher = await new Promise((resolve, reject) => {
      const e = truffleContract.contract.events[eventName](filterArgs, err => {
        if (err) {
          reject(err)
        }
      })

      // if not yet errored then must be ok!
      setTimeout(() => resolve(e), 250)
    })

    return new EventWatcher(this.log, eventName, eventWatcher, responseProcessor)
  }
}

module.exports = async (config, log) => {
  const e = new Manager(config, log)

  await e.init()

  return e
}
