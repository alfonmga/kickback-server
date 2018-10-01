const EventEmitter = require('eventemitter3')
const { generate: randStr } = require('randomstring')
const { toHex, hexToNumber } = require('web3-utils')

const setupFirestoreDb = require('./firestore')
const { NOTIFICATION } = require('../constants/events')
const { SESSION_VALIDITY_SECONDS } = require('../constants/session')
const { VERIFY_EMAIL } = require('../constants/notifications')
const { PARTY_STATUS } = require('../constants/status')
const { assertEthereumAddress, assertEmail, hasAcceptedLegalAgreements } = require('../utils/validators')

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

    const doc = await this._get(`notification/${id}`)

    await doc.set({
      user: userAddress.toLowerCase(),
      type,
      data,
      email_sent: false, // if system has processed it by sending an email to user
      seen: false,
    })

    this.emit(NOTIFICATION, id)

    return id
  }

  async loginUser (userAddress) {
    assertEthereumAddress(userAddress)

    const doc = await this._getUser(userAddress, true)

    this._log.info(`Updating login timestamp for user ${userAddress} ...`)

    await doc.update({
      lastLogin: Date.now()
    })

    return this.getUserProfile(userAddress, true)
  }

  async updateUserProfile (userAddress, profile) {
    const { email: newEmail, social, legal } = profile

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

    // legal agreements are a must have
    if (!hasAcceptedLegalAgreements(doc.data.legal) && !hasAcceptedLegalAgreements(legal)) {
      throw new Error('Legal agreements not found')
    }

    this._log.info(`Updating profile for user ${userAddress} ...`)

    await doc.update({
      email,
      legal: legal || doc.data.legal,
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

    const { address, social, legal, created, lastLogin, email } = doc.data

    return {
      address,
      created,
      lastLogin,
      social: Object.keys(social || {}).reduce((m, type) => {
        m.push({
          type,
          value: social[type]
        })

        return m
      }, []),
      /* only want owner to see their own email address */
      ...(isOwner ? { email, legal } : {})
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
    }

    const doc = await this._getUser(userAddress)

    if (!doc.exists) {
      await doc.set(newProps)
    } else {
      await doc.update(newProps)
    }

    return newProps.login.challenge
  }

  async getParty (address) {
    const doc = await this._getParty(address)

    return doc.exists ? doc.data : null
  }

  async updatePartyMeta (address, data) {
    const doc = await this._getParty(address)

    if (!doc.exists) {
      this._log.warn(`Party not found: ${address}`)

      return
    }


    const meta = [ 'name', 'description', 'date', 'location' ].reduce((m, k) => {
      if (undefined !== data[k]) {
        m[k] = data[k]
      }
      return m
    }, {})

    this._log.info(`Party ${address} meta update: ${meta}`)

    await doc.update(meta)
  }

  async updatePartyFromContract (partyInstance) {
    const { address } = partyInstance

    const doc = await this._getParty(address)

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

    const props = {
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
      status: PARTY_STATUS.DEPLOYED,
    }

    if (doc.exists) {
      this._log.info(`Updating party from contract: ${address}`)

      await doc.update(props)
    } else {
      this._log.info(`Insertng new party from contract: ${address}`)

      await doc.set(props)
    }
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
        }),
        party.update({
          attendees: 1,
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
        })
      }
      // if attendee not found
      else if (0 > index) {
        await Promise.all([
          attendeeList.update({
            attendees: list.concat(newEntry),
          }),
          party.update({
            attendees: list.length + 1,
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
      })
    }
  }

  async getKey (key) {
    const doc = await this._get(`setting/${this._id(key)}`)

    return doc.exists ? doc.data.value : undefined
  }

  async setKey (key, value) {
    const doc = await this._get(`setting/${this._id(key)}`)

    await doc.set({ value })
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

    // wrap update()
    ref.update = (orig => props => {
      const ts = Date.now()
      return orig.call(ref, {
        ...props,
        lastUpdated: ts
      })
    })(ref.update)

    // wrap set()
    ref.set = (orig => props => {
      const ts = Date.now()
      return orig.call(ref, {
        ...props,
        created: ts,
        lastUpdated: ts
      })
    })(ref.set)

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
