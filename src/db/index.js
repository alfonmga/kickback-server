const { toHex, hexToNumber } = require('web3-utils')

const setupCloudDb = require('./cloud')
const setupMemDb = require('./mem')

class Db {
  constructor ({ nativeDb, log }) {
    this.nativeDb = nativeDb
    this.log = log
  }

  async addParty (partyInstance) {
    const doc = await this.nativeDb.get(`party/${partyInstance.address}`)

    if (doc.exists) {
      return this.log.warn('Party already exists in db!')
    }

    // fetch data from contract
    const [ name, deposit, limitOfParticipants, coolingPeriod, ended ] = await Promise.all([
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod(),
      partyInstance.ended()
    ])

    await doc.set({
      name,
      deposit: toHex(deposit),
      attendeeLimit: hexToNumber(toHex(limitOfParticipants)),
      attendees: 0,
      coolingPeriod: toHex(coolingPeriod),
      ended
    })

    return doc
  }

  async updateParty (partyInstance) {
    const doc = await this.nativeDb.get(`party/${partyInstance.address}`)

    if (!doc.exists) {
      return this.log.error('Party does not exist in db!')
    }

    // fetch data from contract
    const [ limitOfParticipants, registered, ended ] = await Promise.all([
      partyInstance.limitOfParticipants(),
      partyInstance.registered(),
      partyInstance.ended()
    ])

    await doc.set({
      attendeeLimit: hexToNumber(toHex(limitOfParticipants)),
      attendees: hexToNumber(toHex(registered)),
      ended
    })

    return doc
  }
}

module.exports = ({ config, log }) => {
  const nativeDb = config.MEM_DB ? setupMemDb({ config, log }) : setupCloudDb({ config, log })

  return new Db({ nativeDb, log })
}
