const EventEmitter = require('eventemitter3')
const { generate: randStr } = require('randomstring')
const { toHex, hexToNumber } = require('web3-utils')

const setupFirestoreDb = require('./firestore')
const { NOTIFICATION } = require('../constants/events')
const { SESSION_VALIDITY_SECONDS } = require('../constants/session')
const { VERIFY_EMAIL } = require('../constants/notifications')
const { assertEthereumAddress, assertEmail } = require('../utils/validators')

class Db extends EventEmitter {
  constructor ({ nativeDb, log, blockChain }) {
    super()
    this._nativeDb = nativeDb
    this._log = log
    this._blockChain = blockChain
  }

  async notifyUser (userAddress, type, data) {
    assertEthereumAddress(userAddress)

    const id = randStr(10)

    await this._nativeDb.doc(`notification/${id}`).set({
      user: userAddress.toLowerCase(),
      type,
      data,
      created: Date.now(),
      lastUpdated: Date.now(),
      seen: false, // if user has seen it
      email_sent: false, // if system has processed it by sending an email to user
    })

    this.emit(NOTIFICATION, id)

    return id
  }

  async updateUserProfile (userAddress, profile) {
    const { email: newEmail, social } = profile

    assertEthereumAddress(userAddress)

    if (newEmail) {
      assertEmail(newEmail)
    }

    const doc = await this._getUser(userAddress, true)

    const { email = {} } = doc.data

    if (newEmail && email.verified !== newEmail) {
      email.pending = newEmail

      this.notifyUser(userAddress, VERIFY_EMAIL, { email: newEmail })
    }

    await doc.update({
      lastUpdated: Date.now(),
      email,
      social: (social || []).reduce((m, { type, value }) => {
        m[type] = value
        return m
      }, {})
    })

    return this.getUserProfile(userAddress)
  }

  async getUserProfile (userAddress, isOwner = false) {
    const doc = await this._getUser(userAddress)

    if (!doc.exists) {
      return {}
    }

    const { address, social, created, email } = doc.data

    return {
      address,
      created,
      social: Object.keys(social || {}).reduce((m, type) => {
        m.push({
          type,
          value: social[type]
        })

        return m
      }, []),
      /* only want owner to see their own email address */
      ...(isOwner ? { email } : {})
    }
  }

  async getLoginChallenge (userAddress) {
    const doc = await this._getUser(userAddress, true)

    const { challenge, created = 0 } = (doc.data.login || {})

    // check login session validity
    if (created < (Date.now() - SESSION_VALIDITY_SECONDS * 1000)) {
      throw new Error(`User login session has expired: ${userAddress}`)
    }

    return challenge
  }

  async createLoginChallenge (userAddress) {
    assertEthereumAddress(userAddress)

    const newProps = {
      address: userAddress.toLowerCase(),
      login: {
        challenge: `Hello! please sign this friendly message using your private key to start using KickBack (timestamp: ${Date.now()})`,
        created: Date.now()
      },
      lastUpdated: Date.now()
    }

    const doc = await this._getUser(userAddress)

    if (!doc.exists) {
      newProps.created = newProps.lastUpdated

      await doc.set(newProps)
    } else {
      await doc.update(newProps)
    }

    return newProps.login.challenge
  }

  async addPartyFromContract (partyInstance) {
    const { address } = partyInstance

    const doc = await this._getParty(address)

    if (doc.exists) {
      this._log.warn(`Party already exists in db: ${address}`)

      return
    }

    this._log.info(`Adding new party at: ${address}`)

    // fetch data from contract
    const [
      owner,
      admins,
      name,
      deposit,
      limitOfParticipants,
      coolingPeriod,
      ended
    ] = await Promise.all([
      partyInstance.owner(),
      partyInstance.getAdmins(),
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod(),
      partyInstance.ended()
    ])

    await doc.set({
      address: address.toLowerCase(),
      network: this._blockChain.networkId,
      name,
      deposit: toHex(deposit),
      attendeeLimit: hexToNumber(toHex(limitOfParticipants)),
      attendees: 0,
      coolingPeriod: toHex(coolingPeriod),
      ended,
      owner: owner.toLowerCase(),
      admins: admins.map(a => a.toLowerCase()),
      created: Date.now(),
      lastUpdated: Date.now()
    })

    this._log.info(`New party added to db: ${doc.id}`)
  }

  async getActiveParties ({ stalestFirst = false, limit = undefined } = {}) {
    let query = this._nativeDb.collection('party')
      .where('ended', '==', false)
      .where('network', '==', this._blockChain.networkId)

    if (stalestFirst) {
      query = query.orderBy('lastUpdated', 'asc')
    } else {
      query = query.orderBy('created', 'desc')
    }

    if (limit) {
      query = query.limit(limit)
    }

    return (await query.get()).docs.map(doc => doc.data())
  }

  async getAttendees (partyAddress) {
    const list = await this._getAttendeeList(partyAddress)

    return list.exists ? list.data.attendees : []
  }

  async updateAttendeeStatus (partyAddress, attendeeAddress, status) {
    partyAddress = partyAddress.toLowerCase()

    const party = await this._getParty(partyAddress)

    if (!party.exists) {
      this._log.warn(`Party not found: ${partyAddress}`)

      return
    }

    attendeeAddress = attendeeAddress.toLowerCase()

    this._log.info(`Update status of attendee ${attendeeAddress} at party ${partyAddress} to ${status}`)

    const newEntry = {
      address: attendeeAddress,
      status,
    }

    const attendeeList = await this._getAttendeeList(partyAddress)

    // no attendee list exists yet, so create one
    if (!attendeeList.exists) {
      await Promise.all([
        attendeeList.set({
          address: partyAddress,
          attendees: [ newEntry ],
          created: Date.now(),
          lastUpdated: Date.now(),
        }),
        party.update({
          attendees: 1,
          lastUpdated: Date.now()
        })
      ])
    } else {
      const list = attendeeList.data.attendees
      const index = list.findIndex(({ address: a }) => a === attendeeAddress)

      // if attendee found
      if (0 <= index) {
        list.splice(index, 1, newEntry)

        await attendeeList.update({
          attendees: list,
          lastUpdated: Date.now(),
        })
      }
      // if attendee not found
      else if (0 > index) {
        await Promise.all([
          attendeeList.update({
            attendees: list.concat(newEntry),
            lastUpdated: Date.now(),
          }),
          party.update({
            attendees: list.length + 1,
            lastUpdated: Date.now()
          })
        ])
      }
    }
  }

  async setNewPartyOwner (address, newOwnerAddress) {
    address = address.toLowerCase()

    const doc = await this._getParty(address)

    assertEthereumAddress(newOwnerAddress)

    newOwnerAddress = newOwnerAddress.toLowerCase()

    if (doc.exists) {
      this._log.info(`Party ${address} has new owner: ${newOwnerAddress}`)

      await doc.update({
        owner: newOwnerAddress,
      })
    }
  }

  async addPartyAdmin (address, adminAddress) {
    address = address.toLowerCase()

    const doc = await this._getParty(address)

    assertEthereumAddress(adminAddress)

    adminAddress = adminAddress.toLowerCase()

    if (doc.exists) {
      const { admins = [] } = doc.data

      if (!admins.includes(adminAddress)) {
        this._log.info(`Party ${address} adds admin: ${adminAddress}`)

        await doc.update({
          admins: admins.concat(adminAddress)
        })
      }
    }
  }

  async removePartyAdmin (address, adminAddress) {
    address = address.toLowerCase()

    const doc = await this._getParty(address)

    assertEthereumAddress(adminAddress)

    adminAddress = adminAddress.toLowerCase()

    if (doc.exists) {
      const { admins = [] } = doc.data

      const pos = admins.indexOf(adminAddress)

      if (0 <= pos) {
        this._log.info(`Party ${address} removes admin: ${adminAddress}`)

        admins.splice(pos, 1)

        await doc.update({
          admins,
        })
      }
    }
  }

  async markPartyEnded (address) {
    address = address.toLowerCase()

    const doc = await this._getParty(address)

    if (doc.exists) {
      this._log.info(`Party ${address} ended`)

      await doc.update({
        ended: true,
        lastUpdated: Date.now()
      })
    }
  }

  async markPartyCancelled (address) {
    address = address.toLowerCase()

    const doc = await this._getParty(address)

    if (doc.exists) {
      this._log.info(`Party ${address} cancelled`)

      await doc.update({
        cancelled: true,
        ended: true,
        lastUpdated: Date.now()
      })
    }
  }

  async getKey (key) {
    return (await this._nativeDb.doc(`setting/${this._id(key)}`).get()).get('value')
  }

  async setKey (key, value) {
    return this._nativeDb.doc(`setting/${this._id(key)}`).set({ value })
  }

  async _getUser (address, mustExist = false) {
    const ref = await this._get(`user/${address.toLowerCase()}`)

    if (mustExist && !ref.exists) {
      throw new Error(`User not found: ${address}`)
    }

    return ref
  }

  async _getParty (address) {
    return this._get(`party/${this._id(address.toLowerCase())}`)
  }

  async _getAttendeeList (address) {
    return this._get(`attendeeList/${this._id(address.toLowerCase())}`)
  }

  async _get (refPath) {
    const ref = this._nativeDb.doc(refPath)
    const doc = await ref.get()

    if (doc.exists) {
      ref.exists = true
      ref.data = doc.data()
    }

    return ref
  }

  _id (str) {
    return `${str}-${this._blockChain.networkId}`
  }
}

module.exports = async ({ config, log, blockChain }) => {
  const nativeDb = await setupFirestoreDb({ config, log })

  return new Db({ nativeDb, log, blockChain })
}
