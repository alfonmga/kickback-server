const safeGet = require('lodash.get')
const EventEmitter = require('eventemitter3')
const uuid = require('uuid')
const { toBN, toHex, hexToNumber } = require('web3-utils')

const setupFirestoreDb = require('./firestore')
const { NOTIFICATION } = require('../constants/events')
const { SESSION_VALIDITY_SECONDS } = require('../constants/session')
const { VERIFY_EMAIL } = require('../constants/notifications')
const { PARTICIPANT_STATUS } = require('../constants/status')
const {
  stringsMatchIgnoreCase,
  assertEthereumAddress,
  assertEmail,
  hasAcceptedLegalAgreements,
  removeUndefinedValuesFromObject
} = require('../utils/validators')

class Db extends EventEmitter {
  constructor ({ nativeDb, log, blockChain }) {
    super()
    this._nativeDb = nativeDb
    this._log = log
    this._blockChain = blockChain
  }

  async notifyUser (userAddress, type, data) {
    assertEthereumAddress(userAddress)

    const id = uuid()

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

    const doc = await this._getUser(userAddress, { mustExist: true })

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

    const doc = await this._getUser(userAddress, { mustExist: true })

    const { email = {} } = doc.data

    if (newEmail && !stringsMatchIgnoreCase(email.verified, newEmail)) {
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
    const doc = await this._getUser(userAddress, { mustExist: true })

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

  async createPendingParty (owner, data) {
    const id = uuid()

    if (!data.name) {
      throw new Error('Pending party name must be set!')
    }

    const doc = await this._getPendingParty(id)

    const meta = this._extractPartyMeta(data)

    this._log.info(`Creating pending party ${id} for owner: ${owner} ...`)

    await doc.set({
      ...meta,
      owner: owner.toLowerCase(),
    })

    return id
  }

  async updatePartyMeta (address, data) {
    const doc = await this._getParty(address)

    if (!doc.exists) {
      this._log.warn(`Party not found: ${address}`)

      return
    }

    const meta = this._extractPartyMeta(data)

    this._log.info(`Party ${address} meta update: ${meta}`)

    await doc.update(meta)
  }

  async addPartyFromContract (partyInstance) {
    const { address } = partyInstance

    const doc = await this._getParty(address)

    if (doc.exists) {
      this._log.warn(`Party ${address} already exists in db`)

      return
    }

    this._log.info(`Inserting new party from contract: ${address} ...`)

    // fetch data from contract
    const [
      owner,
      admins,
      name,
      deposit,
      limitOfParticipants,
      coolingPeriod,
    ] = await Promise.all([
      partyInstance.owner(),
      partyInstance.getAdmins(),
      partyInstance.name(),
      partyInstance.deposit(),
      partyInstance.limitOfParticipants(),
      partyInstance.coolingPeriod(),
    ])

    // fetch pending party
    // name in contrat should match id of pending party doc! - this is how we
    // ensure only parties we approve of can show up on our website, despite
    // people calling our deployer contract directly!
    const pendingParty = await this._getPendingParty(name)

    if (!pendingParty.exists) {
      this._log.warn(`Party ${address} does not have a matching pending party entry.`)

      return
    }

    const meta = this._extractPartyMeta(pendingParty.data)

    await doc.set({
      ...meta,
      address: address.toLowerCase(),
      network: this._blockChain.networkId,
      deposit: toHex(deposit),
      participantLimit: hexToNumber(toHex(limitOfParticipants)),
      coolingPeriod: toHex(coolingPeriod),
      ended: false,
      cancelled: false,
      owner: owner.toLowerCase(),
      admins: admins.map(a => a.toLowerCase()),
      created: Date.now(),
    })

    // delete pending party
    await pendingParty.delete()
  }

  async getParties ({ stalestFirst = false, limit = undefined, onlyActive = false } = {}) {
    let query = this._nativeDb.collection('party')
      .where('network', '==', this._blockChain.networkId)

    if (onlyActive) {
      query = query.where('ended', '==', false)
    }

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

  async getParticipants (partyAddress) {
    const list = await this._getParticipantList(partyAddress)

    return list.exists ? list.data.participants : []
  }

  async finalizeAttendance (partyAddress, maps) {
    partyAddress = partyAddress.toLowerCase()

    const party = await this._getParty(partyAddress)

    if (!party.exists) {
      this._log.warn(`Party not found: ${partyAddress}`)

      return
    } else if (party.data.ended || party.data.cancelled) {
      this._log.warn(`Party ${partyAddress} already ended/cancelled, so cannot finalize`)

      return
    }

    const participantList = await this._getParticipantList(partyAddress)

    if (!participantList.exists) {
      this._log.warn(`No participant list found for party ${partyAddress}`)

      return
    }

    if (participantList.data.finalized) {
      this._log.warn(`Party ${partyAddress} already finalized`)

      return
    }

    const { participants = [] } = participantList.data

    // sort
    participants.sort(({ index: indexA }, { index: indexB }) => (
      (parseInt(indexA, 10) < parseInt(indexB, 10)) ? -1 : 1
    ))

    // check maps length
    const totalBits = maps.length * 256
    const numMapsCorrect = totalBits >= participants.length && totalBits - participants.length < 256
    if (!numMapsCorrect) {
      this._log.warn(`Invalid no. of maps provided for finalizeing party ${partyAddress}`)

      return
    }

    this._log.warn(`Finalizing attendance for party ${partyAddress} ...`)

    const mapBNs = maps.map(m => toBN(m))
    const zeroBN = toBN(0)
    participants.forEach((a, index) => {
      const mapIndex = parseInt(Math.floor(index / 256), 10)
      const bitIndex = index % 256

      const result = mapBNs[mapIndex].and(toBN(0).bincn(bitIndex))

      a.status = result.gt(zeroBN) ? PARTICIPANT_STATUS.SHOWED_UP : PARTICIPANT_STATUS.REGISTERED
    })

    await participantList.set({
      address: partyAddress,
      participants: [ ...participants ],
      finalized: true,
    })
  }

  async updateParticipantStatus (partyAddress, participantAddress, { status, index } = {}) {
    partyAddress = partyAddress.toLowerCase()

    const party = await this._getParty(partyAddress)

    if (!party.exists) {
      this._log.warn(`Party not found: ${partyAddress}`)

      return {}
    } else if (party.data.ended && PARTICIPANT_STATUS.WITHDRAWN_PAYOUT !== status) {
      this._log.warn(`Party ${partyAddress} already ended, so can only update status of participant ${participantAddress} to ${PARTICIPANT_STATUS.WITHDRAWN_PAYOUT}`)

      return {}
    }

    const participantList = await this._getParticipantList(partyAddress)

    if (safeGet(participantList, 'data.finalized') && PARTICIPANT_STATUS.WITHDRAWN_PAYOUT !== status) {
      this._log.warn(`Party ${partyAddress} already finalized, so can only update status of participant ${participantAddress} to ${PARTICIPANT_STATUS.WITHDRAWN_PAYOUT}`)

      return {}
    }

    participantAddress = participantAddress.toLowerCase()

    const newEntry = {
      address: participantAddress,
      status,
      // get their user profile to inject social link
      social: safeGet(await this.getUserProfile(participantAddress), 'social', null)
    }

    if (0 <= index) {
      newEntry.index = index
    }

    this._log.info(`Update status of participant ${participantAddress} at party ${partyAddress} to ${JSON.stringify(newEntry)}`)

    // no participant list exists yet, so create one
    if (!participantList.exists) {
      await participantList.set({
        address: partyAddress,
        participants: [ newEntry ],
      })
    } else {
      const list = participantList.data.participants
      const listIndex = list.findIndex(
        ({ address: a }) => stringsMatchIgnoreCase(a, participantAddress)
      )

      // if participant found
      if (0 <= listIndex) {
        // don't overwrite existing index unless we have a new value
        if (undefined === newEntry.index && undefined !== list[listIndex].index) {
          newEntry.index = list[listIndex].index
        }

        list.splice(listIndex, 1, newEntry)

        await participantList.update({
          participants: [ ...list ],
        })
      }
      // if participant not found
      else {
        await participantList.update({
          participants: [ ...list, newEntry ],
        })
      }
    }

    return newEntry
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
          admins: [ ...admins, adminAddress ]
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
          admins: [ ...admins ]
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

  async _getUser (address, { mustExist = false } = {}) {
    const ref = await this._get(`user/${address.toLowerCase()}`)

    if (mustExist && !ref.exists) {
      throw new Error(`User not found: ${address}`)
    }

    return ref
  }

  async _getParty (address) {
    return this._get(`party/${this._id(address.toLowerCase())}`)
  }

  async _getPendingParty (id) {
    return this._get(`pendingParty/${this._id(id)}`)
  }

  async _getParticipantList (address) {
    return this._get(`participantList/${this._id(address.toLowerCase())}`)
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
      removeUndefinedValuesFromObject(props)
      const ts = Date.now()
      return orig.call(ref, {
        ...props,
        lastUpdated: ts
      })
    })(ref.update)

    // wrap set()
    ref.set = (orig => props => {
      removeUndefinedValuesFromObject(props)
      const ts = Date.now()
      return orig.call(ref, {
        ...props,
        lastUpdated: ts
      })
    })(ref.set)

    return ref
  }

  _id (str) {
    return `${str}-${this._blockChain.networkId}`
  }

  _extractPartyMeta (doc) {
    return [ 'name', 'description', 'date', 'location', 'image' ].reduce((m, k) => {
      if (undefined !== doc[k]) {
        m[k] = doc[k]
      }
      return m
    }, {})
  }
}

module.exports = async ({ config, log, blockChain }) => {
  const nativeDb = await setupFirestoreDb({ config, log })

  return new Db({ nativeDb, log, blockChain })
}
