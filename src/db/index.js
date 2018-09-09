const setupCloudDb = require('./cloud')
const setupMemDb = require('./mem')

class Db {
  constructor (nativeDb, log) {
    this.nativeDb = nativeDb
    this.log = log
  }

  async addParty (partyInstance) {
    const existing = await this.nativeDb.get(partyInstance.address)

    if (existing) {
      return this.log.warn('Party already exists in db!')
    }

    // fetch data from contract
    const [ name, deposit, limitOfParticipants, coolingPeriod ] = await Promise.all([
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod()
    ])

    await this.nativeDb.




    address: contractInstance.address,
    name,
    deposit,
    limitOfParticipants,
    coolingPeriod

  }
}

module.exports = (config, log) => {
  const nativeDb = config.MEM_DB ? setupMemDb(config, log) : setupCloudDb(config, log)

  return new Db(nativeDb, log)
}
