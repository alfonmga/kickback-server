const { toHex, hexToNumber } = require('web3-utils')

const setupFirestoreDb = require('./firestore')
const { SESSION_VALIDITY_SECONDS } = require('../constants/session')
const { assertEthereumAddress, assertEmail } = require('../utils/validators')

class Db {
  constructor ({ nativeDb, log }) {
    this._nativeDb = nativeDb
    this._log = log
  }

  async updateUserProfile (userAddress, profile) {
    const { email: newEmail, social } = profile

    assertEthereumAddress(userAddress)

    if (newEmail) {
      assertEmail(newEmail)
    }

    const doc = await this._loadUserWhoMustExist(userAddress)

    const { email = {} } = doc.data()

    if (email.verified !== newEmail) {
      email.pending = newEmail

      // TODO: send confirmation email!
    }

    await doc.update({
      lastUpdated: Date.now(),
      email,
      social: social.reduce((m, { type, value }) => {
        m[type] = value
        return m
      }, {})
    })

    return this.getUserProfile(userAddress)
  }

  async getUserProfile (userAddress, isOwner = false) {
    const doc = await this._nativeDb.doc(`user/${userAddress}`).get()

    if (!doc.exists) {
      return {}
    }

    const { social, created, email } = doc.data()

    return {
      address: userAddress,
      created,
      social: Object.keys(social || {}).reduce((m, type) => {
        m.push({
          type,
          value: social[type]
        })

        return m
      }, []),
      /* only want owner to see their own email address */
      ...(isOwner ? email : {})
    }
  }

  async getLoginChallenge (userAddress) {
    const doc = await this._loadUserWhoMustExist(userAddress)

    const { challenge, created } = doc.data().auth

    // check login session validity
    if (created < (Date.now() + SESSION_VALIDITY_SECONDS * 1000)) {
      throw new Error(`User login session has expired: ${userAddress}`)
    }

    return challenge
  }

  async createLoginChallenge (userAddress) {
    assertEthereumAddress(userAddress)

    const doc = this._nativeDb.doc(`user/${userAddress}`)

    const newProps = {
      login: {
        challenge: `Hello! please sign this friendly message using your private key to start using KickBack (timestamp: ${Date.now()})`,
        created: Date.now()
      },
      lastUpdated: Date.now()
    }

    if (!(await doc.get()).exists) {
      newProps.created = Date.now()

      await doc.set(newProps)
    } else {
      await doc.update(newProps)
    }

    return newProps.login.challenge
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

  async _loadUserWhoMustExist (userAddress) {
    assertEthereumAddress(userAddress)

    const doc = await this._nativeDb.doc(`user/${userAddress}`).get()

    if (!doc.exists) {
      throw new Error(`User not found: ${userAddress}`)
    }

    return doc
  }
}

module.exports = async ({ config, log }) => {
  const nativeDb = await setupFirestoreDb({ config, log })

  return new Db({ nativeDb, log })
}
