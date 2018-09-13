const { toHex, hexToNumber } = require('web3-utils')

const setupCloudDb = require('./cloud')
const setupMemDb = require('./mem')

class Db {
  constructor ({ nativeDb, log }) {
    this._nativeDb = nativeDb
    this._log = log
  }

  async addParty (partyInstance) {
    const doc = await this._nativeDb.doc(`party/${partyInstance.address}`)

    if (doc.exists) {
      return this._log.warn('Party already exists in db!')
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
      ended,
      created: Date.now(),
      lastUpdated: Date.now()
    })

    this._log.info(`New party added to db: ${doc.id}`)

    return doc
  }

  async updateParty (partyInstance) {
    const doc = await this._nativeDb.get(`party/${partyInstance.address}`)

    if (!doc.exists) {
      return this._log.error('Party does not exist in db!')
    }

    // fetch data from contract
    const [ limitOfParticipants, registered, ended ] = await Promise.all([
      partyInstance.limitOfParticipants(),
      partyInstance.registered(),
      partyInstance.ended()
    ])

    await doc.update({
      attendeeLimit: hexToNumber(toHex(limitOfParticipants)),
      attendees: hexToNumber(toHex(registered)),
      ended,
      lastUpdated: Date.now()
    })

    return doc
  }

  async getActiveParties ({ stalestFirst = false, limit = undefined } = {}) {
    let query = this._nativeDb.collection('party')
      .where('ended', '==', false)

    if (stalestFirst) {
      query = query.orderBy('lastUpdated', 'asc')
    } else {
      query = query.orderBy('created', 'desc')
    }

    if (limit) {
      query = query.limit(limit)
    }

    return (await query.get()).docs.map(doc => {
      const m = doc.data()
      m.address = doc.id
      m.id = doc.id
      return m
    })
  }
}

module.exports = async ({ config, log }) => {
  const nativeDb = config.MEM_DB
    ? await setupMemDb({ config, log })
    : await setupCloudDb({ config, log })

  return new Db({ nativeDb, log })
}
