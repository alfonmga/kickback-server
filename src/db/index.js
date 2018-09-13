const { toHex, hexToNumber } = require('web3-utils')

const setupFirestoreDb = require('./firestore')

class Db {
  constructor ({ nativeDb, log }) {
    this._nativeDb = nativeDb
    this._log = log
  }

  async addParty (partyInstance) {
    const { address } = partyInstance

    const doc = this._nativeDb.doc(`party/${address}`)

    if ((await doc.get()).exists) {
      this._log.error(`Party already exists in db: ${address}`)

      return
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
  }

  async updateParty (partyInstance) {
    const { address } = partyInstance

    const doc = this._nativeDb.doc(`party/${address}`)

    if (!(await doc.get()).exists) {
      this._log.error(`Party does not exist in db: ${address}`)

      return
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
      m.ref = doc.ref.path
      return m
    })
  }
}

module.exports = async ({ config, log }) => {
  const nativeDb = await setupFirestoreDb({ config, log })

  return new Db({ nativeDb, log })
}
