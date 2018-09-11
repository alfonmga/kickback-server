const { toHex, hexToNumber } = require('web3-utils')

const setupCloudDb = require('./cloud')
const setupMemDb = require('./mem')

class Db {
  constructor (nativeDb, log) {
    this.nativeDb = nativeDb
    this.log = log
  }

  async addParty (partyInstance) {
    const doc = await this.nativeDb.get(`party/${partyInstance.address}`)

    if (doc.exists) {
      return this.log.warn('Party already exists in db!')
    }

    // fetch data from contract
    const [ name, deposit, limitOfParticipants, coolingPeriod ] = await Promise.all([
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod()
    ])

    await doc.set({
      name,
      deposit: toHex(deposit),
      limitOfParticipants: hexToNumber(toHex(limitOfParticipants)),
      coolingPeriod: toHex(coolingPeriod),
    })

    return doc
  }
}

module.exports = (config, log) => {
  const nativeDb = config.MEM_DB ? setupMemDb(config, log) : setupCloudDb(config, log)

  return new Db(nativeDb, log)
}
