import Ganache from 'ganache-core'
import Web3 from 'web3'
import uuid from 'uuid'
import delay from 'delay'
import { toBN, toHex, toWei } from 'web3-utils'
import { Conference } from '@noblocknoparty/contracts'
import { generateMnemonic, EthHdWallet } from 'eth-hd-wallet'

import createLog from '../log'
import createDb from './'
import { getContract } from '../utils/contracts'
import { NOTIFICATION } from '../constants/events'
import { PARTICIPANT_STATUS } from '../constants/status'
import { VERIFY_EMAIL } from '../constants/notifications'
import { SESSION_VALIDITY_SECONDS } from '../constants/session'
import { TERMS_AND_CONDITIONS, PRIVACY_POLICY, MARKETING_INFO } from '../constants/legal'

const wallet = EthHdWallet.fromMnemonic(generateMnemonic())

const newAddr = () => wallet.generateAddresses(1).pop()

const createUserProfile = address => ({
  address,
  lastUpdated: Date.now(),
  realName: 'my name',
  email: {
    verified: 'test@kickback.events'
  },
  legal: [
    {
      type: TERMS_AND_CONDITIONS,
      accepted: `${Date.now()}`,
    },
    {
      type: PRIVACY_POLICY,
      accepted: `${Date.now()}`,
    },
    {
      type: MARKETING_INFO,
      accepted: `${Date.now()}`,
    },
  ],
  social: {
    twitter: 'https://twitter.com/wearekickback'
  }
})

describe('db', () => {
  let log
  let provider
  let accounts
  let web3
  let blockChain
  let db
  let nativeDb
  let config

  let loadUser
  let saveUser
  let updateUser
  let loadParty
  let saveParty
  let loadPendingParty
  let savePendingParty
  let deletePendingParty
  let loadNotification
  let loadParticipantList
  let saveParticipantList
  let loadKey
  let saveKey

  beforeAll(async () => {
    log = createLog({
      LOG: 'info',
      APP_MODE: 'test'
    })

    config = require('../config')

    provider = Ganache.provider({
      total_accounts: 4,
    })

    const { accounts: accountsMap } = provider.manager.state
    accounts = Object.keys(accountsMap)

    web3 = new Web3(provider)
    const networkId = await web3.eth.net.getId()

    console.log(`Network id: ${networkId}`)

    blockChain = { web3, networkId }

    db = await createDb({ config, log, blockChain })
    nativeDb = db._nativeDb

    const extractData = d => d.data()

    saveUser = async (address, data) => nativeDb.doc(`user/${address.toLowerCase()}`).set({
      address,
      ...data
    })
    updateUser = async (address, data) => nativeDb.doc(`user/${address.toLowerCase()}`).update(data)
    loadUser = async address => nativeDb.doc(`user/${address.toLowerCase()}`).get().then(extractData)

    saveParty = async (address, data) => nativeDb.doc(`party/${address.toLowerCase()}-${networkId}`).set({
      address,
      network: networkId,
      ...data
    })
    loadParty = async address => nativeDb.doc(`party/${address.toLowerCase()}-${networkId}`).get().then(extractData)

    savePendingParty = async (id, data) => nativeDb.doc(`pendingParty/${id}-${networkId}`).set(data)
    loadPendingParty = async id => nativeDb.doc(`pendingParty/${id}-${networkId}`).get().then(extractData)
    deletePendingParty = async id => nativeDb.doc(`pendingParty/${id}-${networkId}`).delete()

    loadNotification = async id => nativeDb.doc(`notification/${id}`).get().then(extractData)

    saveParticipantList = async (address, list, extra = {}) => nativeDb.doc(`participantList/${address.toLowerCase()}-${networkId}`).set({
      address,
      participants: list,
      ...extra,
    })
    loadParticipantList = async address => nativeDb.doc(`participantList/${address.toLowerCase()}-${networkId}`).get().then(extractData)

    saveKey = async (key, value) => nativeDb.doc(`setting/${key}-${networkId}`).set({ value })
    loadKey = async key => nativeDb.doc(`setting/${key}-${networkId}`).get().then(extractData)
  })

  describe('getKey', () => {
    it('returns undefined if key not set', async () => {
      const id = `test-${Date.now()}`

      expect(await db.getKey(id)).toBeUndefined()
    })

    it('returns value if key set', async () => {
      const id = `test-${Date.now()}`

      await saveKey(id, 'key value')

      expect(await db.getKey(id)).toEqual('key value')
    })
  })

  describe('setKey', () => {
    it('sets key if not previously set', async () => {
      const id = `test-${Date.now()}`

      await db.setKey(id, 'new value')

      const { value, lastUpdated } = await loadKey(id)

      expect(value).toEqual('new value')
      expect(lastUpdated).toBeGreaterThan(0)
    })

    it('overwrites previous value', async () => {
      const id = `test-${Date.now()}`

      await saveKey(id, 'old value')

      await db.setKey(id, 'new value')

      const { value, lastUpdated } = await loadKey(id)

      expect(value).toEqual('new value')
      expect(lastUpdated).toBeGreaterThan(0)
    })
  })

  describe('notifyUser', () => {
    it('throws if address is invalid', async () => {
      try {
        await db.notifyUser('invalid')
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('invalid ethereum address'))
      }
    })

    it('emits an event', async () => {
      const userAddress = newAddr()

      const spy = jest.fn()
      db.on(NOTIFICATION, spy)

      const id = await db.notifyUser(userAddress, 'type1', 'data1')

      expect(spy).toHaveBeenCalledWith(id)
    })

    it('creates an entry', async () => {
      const userAddress = newAddr()

      const id = await db.notifyUser(userAddress, 'type1', 'data1')

      const notification = await loadNotification(id)

      expect(notification).toMatchObject({
        user: userAddress,
        type: 'type1',
        data: 'data1',
        seen: false, // if user has seen it
        email_sent: false, // if system has processed it by sending an email to user
      })

      expect(notification.lastUpdated).toBeDefined()
    })

    it('lowercases the user address', async () => {
      const userAddress = newAddr().toUpperCase()

      const id = await db.notifyUser(userAddress, 'type1', 'data1')

      const notification = await loadNotification(id)

      expect(notification).toMatchObject({
        user: userAddress.toLowerCase(),
      })
    })
  })

  describe('getParties', () => {
    beforeAll(async () => {
      await saveParty('testparty1', {
        network: 123,
        ended: false,
        lastUpdated: 1,
        created: 1,
      })

      await saveParty('testparty2', {
        ended: false,
        lastUpdated: 2,
        created: 1,
      })

      await saveParty('testparty3', {
        ended: true,
        lastUpdated: 3,
        created: 2,
      })

      await saveParty('testparty4', {
        ended: false,
        lastUpdated: 2,
        created: 1,
      })

      await saveParty('testparty5', {
        ended: false,
        lastUpdated: 4,
        created: 3,
      })

      await saveParty('testparty6', {
        network: 123,
        ended: false,
        lastUpdated: 5,
        created: 4,
      })
    })

    it('returns all newest first by default', async () => {
      const events = await db.getParties()

      expect(events.length).toEqual(4)

      expect(events[0]).toMatchObject({
        address: 'testparty5',
      })

      expect(events[1]).toMatchObject({
        address: 'testparty3',
      })

      expect(events[2]).toMatchObject({
        address: 'testparty4',
      })

      expect(events[3]).toMatchObject({
        address: 'testparty2',
      })
    })

    it('can return limited results', async () => {
      const events = await db.getParties({ limit: 1 })

      expect(events.length).toEqual(1)

      expect(events[0]).toMatchObject({
        address: 'testparty5',
      })
    })

    it('can return only active parties', async () => {
      const events = await db.getParties({ onlyActive: true })

      expect(events.length).toEqual(3)

      expect(events[0]).toMatchObject({
        address: 'testparty5',
      })

      expect(events[1]).toMatchObject({
        address: 'testparty4',
      })

      expect(events[2]).toMatchObject({
        address: 'testparty2',
      })
    })

    it('can return in order stalest first', async () => {
      const events = await db.getParties({ stalestFirst: true, onlyActive: true })

      expect(events.length).toEqual(3)

      expect(events[0]).toMatchObject({
        address: 'testparty2',
      })

      expect(events[1]).toMatchObject({
        address: 'testparty4',
      })

      expect(events[2]).toMatchObject({
        address: 'testparty5',
      })
    })
  })

  describe('updatePartyMeta', () => {
    let partyAddress

    beforeEach(async () => {
      partyAddress = newAddr()

      await saveParty(partyAddress, {
        shouldNotUse: false,
        name: 'name1',
        description: 'desc1',
        date: 'date1',
        location: 'location1',
        image: 'image1',
      })
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.updatePartyMeta(invalidPartyAddress, {})

      const party = await loadParty(invalidPartyAddress)

      expect(party).toBeUndefined()
    })

    it('updates party meta if found', async () => {
      await db.updatePartyMeta(partyAddress, {
        name: 'name2',
        description: 'desc2',
        date: 'date2',
        location: 'location2',
        image: 'image2',
        shouldNotUse: true,
      })

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        name: 'name2',
        description: 'desc2',
        date: 'date2',
        location: 'location2',
        image: 'image2',
        shouldNotUse: false,
      })

      expect(party.lastUpdated).toBeGreaterThan(0)
    })

    it('handles uppercase party address', async () => {
      await db.updatePartyMeta(partyAddress.toUpperCase(), {
        name: 'test3',
      })

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        name: 'test3',
      })
    })
  })

  describe('createPendingParty', () => {
    it('throws if name not set', async () => {
      try {
        await db.createPendingParty(newAddr(), {})
      } catch (err) {
        expect(err.message).toEqual(expect.stringContaining('name must be set'))
      }
    })

    it('creates entry and returns the id', async () => {
      const owner = newAddr()

      const id = await db.createPendingParty(owner, {
        name: 'party1',
        description: 'desc1',
        date: 'date1',
        location: 'location1',
        image: 'image1',
        shouldNotUse: 123,
      })

      const doc = await loadPendingParty(id)

      expect(doc).toMatchObject({
        owner: owner.toLowerCase(),
        name: 'party1',
        description: 'desc1',
        date: 'date1',
        location: 'location1',
        image: 'image1',
      })
    })
  })

  describe('addPartyFromContract', () => {
    let id
    let party

    beforeEach(async () => {
      id = uuid()

      party = await getContract(Conference, web3, { from: accounts[0] }).new(
        id, toHex(toWei('0.2', 'ether')), 100, 2, accounts[0]
      )
      // add additional admin
      await party.grant([ accounts[2] ])
    })

    it('does nothing if it already exists in db', async () => {
      await saveParty(party.address, {
        shouldNotUse: true,
        name: 'test-original',
      })

      await db.addPartyFromContract(party)

      const data = await loadParty(party.address)

      expect(data).toMatchObject({
        shouldNotUse: true,
        name: 'test-original',
      })
    })

    it('does nothing if pending party entry not found', async () => {
      await deletePendingParty(id)

      await db.addPartyFromContract(party)

      expect(await loadParty(party.address)).toBeUndefined()
    })

    it('creates new party entry and deletes the pending party entry', async () => {
      await savePendingParty(id, {
        owner: accounts[1].toLowerCase() /* should be ignored */,
        name: 'test',
        shouldNotUse: 123,
      })

      await db.addPartyFromContract(party)

      const data = await loadParty(party.address)

      expect(data).toMatchObject({
        address: party.address.toLowerCase(),
        network: blockChain.networkId,
        name: 'test',
        deposit: toHex(toWei('0.2', 'ether')),
        participantLimit: 100,
        coolingPeriod: toHex(2),
        ended: false,
        cancelled: false,
      })

      expect(data.owner).toEqualIgnoreCase(accounts[0])
      expect(data.admins.length).toEqual(1)
      expect(data.admins[0]).toEqualIgnoreCase(accounts[2])
      expect(data.shouldNotUse).toBeUndefined()

      expect(data.lastUpdated).toBeGreaterThan(0)

      expect(await loadPendingParty(id)).toBeUndefined()
    })

    it('does not record whether party has already ended as we will do this later on', async () => {
      await savePendingParty(id, {
        owner: accounts[0].toLowerCase(),
        name: 'test'
      })

      await party.cancel()

      await db.addPartyFromContract(party)

      const data = await loadParty(party.address)

      expect(data).toMatchObject({
        ended: false,
        cancelled: false,
      })
    })
  })

  describe('getLoginChallenge', () => {
    let userAddress

    beforeEach(async () => {
      userAddress = newAddr()

      await saveUser(userAddress, createUserProfile(userAddress))
    })

    it('throws if user not found', async () => {
      try {
        await db.getLoginChallenge('invalid')
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if challenge has expired', async () => {
      await updateUser(userAddress, {
        login: {
          challenge: 'challenge',
          created: Date.now() - (SESSION_VALIDITY_SECONDS * 1000) - 1
        }
      })

      try {
        await db.getLoginChallenge(userAddress)
      } catch (err) {
        expect(err.message).toEqual(expect.stringContaining('login session has expired'))
      }
    })

    it('returns challenge if not yet expired', async () => {
      await updateUser(userAddress, {
        login: {
          challenge: 'challenge1',
          created: Date.now()
        }
      })

      const str = await db.getLoginChallenge(userAddress)

      expect(str).toEqual('challenge1')
    })

    it('handles address in uppercase', async () => {
      await updateUser(userAddress, {
        login: {
          challenge: 'challenge1',
          created: Date.now()
        }
      })

      const str = await db.getLoginChallenge(userAddress.toUpperCase())

      expect(str).toEqual('challenge1')
    })
  })

  describe('createLoginChallenge', () => {
    let userAddress
    let user

    beforeEach(async () => {
      userAddress = newAddr()

      await saveUser(userAddress, createUserProfile(userAddress))

      user = await loadUser(userAddress)
    })

    it('throws if invalid address format', async () => {
      try {
        await db.createLoginChallenge('invalid')
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('updates existing user', async () => {
      const str = await db.createLoginChallenge(userAddress)

      const data = await loadUser(userAddress)

      expect(data.lastUpdated).toBeGreaterThan(user.lastUpdated)
      expect(data.login.challenge).toEqual(str)
    })

    it('creates new user', async () => {
      const addr = newAddr()

      const str = await db.createLoginChallenge(addr)

      const data = await loadUser(addr)

      expect(data.lastUpdated).toBeGreaterThan(0)
      expect(data.login.challenge).toEqual(str)
    })

    it('lowercases the user address', async () => {
      const addr = newAddr().toUpperCase()

      await db.createLoginChallenge(addr)

      const data = await loadUser(addr.toLowerCase())

      expect(data.address).toEqual(addr.toLowerCase())
    })
  })

  describe('getUserProfile', () => {
    let userAddress
    let user

    beforeEach(async () => {
      userAddress = newAddr()

      await saveUser(userAddress, createUserProfile(userAddress))

      user = await loadUser(userAddress)
    })

    it('returns empty if user not found', async () => {
      const ret = await db.getUserProfile(newAddr())

      expect(ret).toEqual({})
    })

    it('returns profile if user found', async () => {
      const ret = await db.getUserProfile(userAddress)

      expect(ret).toEqual({
        address: userAddress,
        social: [
          {
            type: 'twitter',
            value: user.social.twitter
          }
        ]
      })
    })

    it('returns private info if my profile', async () => {
      const ret = await db.getUserProfile(userAddress, true)

      expect(ret.legal).toBeDefined()
      expect(ret.legal.length).toEqual(3)
      expect(ret.legal[0].type).toEqual(TERMS_AND_CONDITIONS)
      expect(ret.legal[1].type).toEqual(PRIVACY_POLICY)
      expect(ret.legal[2].type).toEqual(MARKETING_INFO)
    })

    it('handles user address in uppercase', async () => {
      const ret = await db.getUserProfile(userAddress.toUpperCase())

      expect(ret.address).toEqual(userAddress)
    })

    it('returns email too if user is profile owner', async () => {
      const ret = await db.getUserProfile(userAddress, true)

      expect(ret).toMatchObject({
        email: user.email,
      })
    })
  })

  describe('getParty', () => {
    let partyAddress

    beforeEach(async () => {
      partyAddress = newAddr()

      await saveParty(partyAddress, {
        shouldNotUse: false,
        name: 'name1',
        description: 'desc1',
        date: 'date1',
        location: 'location1',
      })
    })

    it('returns null if not found', async () => {
      const doc = await db.getParty(newAddr())

      expect(doc).toEqual(null)
    })

    it('returns party if found', async () => {
      const doc = await db.getParty(partyAddress)

      expect(doc).toMatchObject({
        name: 'name1'
      })
    })

    it('auto-lowercases party address', async () => {
      const doc = await db.getParty(partyAddress.toUpperCase())

      expect(doc).toMatchObject({
        name: 'name1'
      })
    })
  })

  describe('loginUser', () => {
    let userAddress
    let profile

    beforeEach(async () => {
      userAddress = newAddr()
      profile = createUserProfile(userAddress)

      await saveUser(userAddress, profile)
    })

    it('throws if address is invalid', async () => {
      try {
        await db.loginUser('invalid')
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if user not found', async () => {
      try {
        await db.loginUser(newAddr())
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('returns profile if user found', async () => {
      const ret = await db.loginUser(userAddress)

      expect(ret).toMatchObject({
        address: userAddress,
        email: {
          verified: 'test@kickback.events'
        },
        social: [ {
          type: 'twitter',
          value: 'https://twitter.com/wearekickback',
        } ]
      })

      expect(ret.lastLogin).toBeGreaterThan(0)
    })

    it('updates lastLogin timestamp every time', async () => {
      const { lastLogin } = await db.loginUser(userAddress)

      await delay(100)

      const { lastLogin: lastLogin2 } = await db.loginUser(userAddress)

      expect(lastLogin2).toBeGreaterThan(lastLogin)
    })
  })

  describe('updateUserProfile', () => {
    let userAddress
    let user
    let legal

    beforeEach(async () => {
      userAddress = newAddr()

      const newUser = createUserProfile(userAddress)
      delete newUser.legal

      await saveUser(userAddress, newUser)

      user = await loadUser(userAddress)

      legal = [
        {
          type: TERMS_AND_CONDITIONS,
          accepted: `${Date.now()}`,
        },
        {
          type: PRIVACY_POLICY,
          accepted: `${Date.now()}`,
        },
      ]
    })

    it('throws if address is invalid', async () => {
      try {
        await db.updateUserProfile('invalid', {
          username: userAddress.substr(0, 15),
          email: 'test-newemail@kickback.events'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if email address is invalid', async () => {
      try {
        await db.updateUserProfile(userAddress, {
          username: userAddress.substr(0, 15),
          email: 'test-newemail@kickbac'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if user not found', async () => {
      try {
        await db.updateUserProfile(newAddr(), {
          username: userAddress.substr(0, 15),
          email: 'test-newemail@kickback.events'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if required legal agreements not found', async () => {
      try {
        await db.updateUserProfile(userAddress, {
          username: userAddress.substr(0, 15),
          email: 'test-newemail@kickback.events',
          legal: [
            {
              type: MARKETING_INFO,
              accepted: `${Date.now()}`,
            }
          ]
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('legal agreements must'))
      }
    })

    it('throws if legal agreements are incomplete', async () => {
      try {
        await db.updateUserProfile(userAddress, {
          username: userAddress.substr(0, 15),
          email: 'test-newemail@kickback.events',
          legal: [ legal[0] ],
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('legal agreements must'))
      }
    })

    it('throws if username already set and trying to set again', async () => {
      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        legal
      })

      try {
        await db.updateUserProfile(userAddress, {
          username: userAddress.substr(0, 8),
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('cannot change username'))
      }
    })

    it('but does not throw if username already set and trying to set again with same username', async () => {
      const username = userAddress.substr(0, 15)

      await db.updateUserProfile(userAddress, {
        username,
        legal
      })

      await db.updateUserProfile(userAddress, {
        username,
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        username,
      })
    })

    it('throws if username not already set and not provided', async () => {
      try {
        await db.updateUserProfile(userAddress, {
          legal
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('username must be provided'))
      }
    })

    it('throws if username already taken and ignores case', async () => {
      const username = `Taken${userAddress.substr(0, 5).toUpperCase()}`

      await saveUser(newAddr(), {
        username: username.toLowerCase(),
      })

      try {
        await db.updateUserProfile(userAddress, {
          legal,
          username: username.toUpperCase(),
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('already taken'))
      }
    })

    it('sets username once', async () => {
      const username = `Taken${userAddress.substr(0, 5).toUpperCase()}`

      await db.updateUserProfile(userAddress, {
        legal,
        username,
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        username: username.toLowerCase(),
      })
    })

    it('throws on invalid username', async () => {
      const username = `123456789012345678`

      try {
        await db.updateUserProfile(userAddress, {
          legal,
          username,
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('invalid username'))
      }
    })

    it('throws on invalid real name', async () => {
      const realName = `1`

      try {
        await db.updateUserProfile(userAddress, {
          legal,
          realName,
          username: userAddress.substr(0, 10)
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('invalid real name'))
      }
    })

    it('does not throw if legal agreement already in db', async () => {
      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        legal
      })

      await db.updateUserProfile(userAddress, {})

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        legal
      })
    })

    it('updates social links', async () => {
      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        legal,
        social: [
          {
            type: 'insta',
            value: '@test'
          }
        ]
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        email: {
          verified: 'test@kickback.events'
        },
        social: {
          insta: '@test'
        }
      })
    })

    it('requires real name to be provided', async () => {
      await saveUser(userAddress, {
        realName: null
      })

      try {
        await db.updateUserProfile(userAddress, {
          username: userAddress.substr(0, 15),
          legal,
        })
      } catch (err) {
        expect(err.message.toLowerCase()).toEqual(expect.stringContaining('real name must be provided'))
      }

      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        legal,
        realName: 'Test Name',
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        realName: 'Test Name',
      })
    })

    it('updates real name', async () => {
      await saveUser(userAddress, {
        realName: 'realname1'
      })

      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        legal,
        realName: 'Ram Bo',
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        realName: 'Ram Bo',
      })
    })

    it('handles user address in uppercase', async () => {
      await db.updateUserProfile(userAddress.toUpperCase(), {
        username: userAddress.substr(0, 15),
        social: [],
        legal
      })

      const data = await loadUser(userAddress)

      expect(data).toMatchObject({
        social: {}
      })
    })

    it('returns user profile with all fields', async () => {
      const username = userAddress.substr(0, 15)

      const social = [
        {
          type: 'insta',
          value: '@test'
        }
      ]

      const ret = await db.updateUserProfile(userAddress, {
        username,
        social,
        legal
      })

      expect(ret).toMatchObject({
        address: userAddress.toLowerCase(),
        username,
        social,
        legal,
        realName: 'my name',
        email: {
          verified: user.email.verified
        },
      })
    })

    it('ignores same email being passed in', async () => {
      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        email: user.email.verified,
        legal
      })

      const data = await loadUser(userAddress)

      expect(data.email).toEqual(user.email)
    })

    it('handles case when new email given', async () => {
      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        email: 'test-newemail@kickback.events',
        legal
      })

      const data = await loadUser(userAddress)

      expect(data.email).toEqual({
        verified: user.email.verified,
        pending: 'test-newemail@kickback.events'
      })
    })

    it('creates notification when new email given', async () => {
      db.notifyUser = jest.fn(() => Promise.resolve())

      await db.updateUserProfile(userAddress, {
        username: userAddress.substr(0, 15),
        email: 'test-newemail@kickback.events',
        legal,
      })

      expect(db.notifyUser).toHaveBeenCalledWith(userAddress, VERIFY_EMAIL, {
        email: 'test-newemail@kickback.events'
      })
    })
  })

  describe('getParticipants', () => {
    it('returns empty if not found', async () => {
      expect(await db.getParticipants('invalid')).toEqual([])
    })

    it('returns list if found', async () => {
      const list = [
        { address: newAddr(), status: PARTICIPANT_STATUS.REGISTERED },
        { address: newAddr(), status: PARTICIPANT_STATUS.SHOWED_UP },
      ]

      const party = newAddr()

      await saveParticipantList(party, list)

      expect(await db.getParticipants(party)).toEqual(list)
    })

    it('handles uppercase address', async () => {
      const list = [
        { address: newAddr(), status: PARTICIPANT_STATUS.REGISTERED },
        { address: newAddr(), status: PARTICIPANT_STATUS.SHOWED_UP },
      ]

      const party = newAddr()

      await saveParticipantList(party, list)

      expect(await db.getParticipants(party.toUpperCase())).toEqual(list)
    })
  })

  describe('updateParticipantStatus', () => {
    let partyAddress

    beforeEach(async () => {
      partyAddress = newAddr()

      await saveParty(partyAddress, {})
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      const ret = await db.updateParticipantStatus(invalidPartyAddress, newAddr(), {
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 5
      })

      expect(ret).toEqual({})

      const doc = await loadParticipantList(partyAddress)

      expect(doc).toBeUndefined()
    })

    it('does nothing if party ended', async () => {
      await saveParty(partyAddress, {
        ended: true,
      })

      const ret = await db.updateParticipantStatus(partyAddress, newAddr(), {
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 5
      })

      expect(ret).toEqual({})

      const doc = await loadParticipantList(partyAddress)

      expect(doc).toBeUndefined()
    })

    it('does allow setting status to WITHDRAWN_PAYOUT even if party ended', async () => {
      await saveParty(partyAddress, {
        ended: true,
      })
      const addr1 = newAddr()
      const ret = await db.updateParticipantStatus(partyAddress, addr1, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 5
      })

      expect(ret).not.toEqual({})

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        {
          address: addr1,
          status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          index: 5,
        }
      ])
    })

    it('does nothing if attendance already finalized', async () => {
      const addr1 = newAddr()
      const addr2 = newAddr()

      const originalList = [
        { address: addr1, status: PARTICIPANT_STATUS.SHOWED_UP, index: 1, },
        { address: addr2, status: PARTICIPANT_STATUS.REGISTERED, index: 2, },
      ]

      await saveParticipantList(partyAddress, originalList, {
        finalized: true,
      })

      const ret = await db.updateParticipantStatus(partyAddress, addr1, {
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 5
      })

      expect(ret).toEqual({})

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(originalList)
    })

    it('does allow setting status to WITHDRAWN_PAYOUT even if attendance already finalized', async () => {
      const addr1 = newAddr()
      const addr2 = newAddr()

      const originalList = [
        { address: addr1, status: PARTICIPANT_STATUS.SHOWED_UP, index: 1, },
        { address: addr2, status: PARTICIPANT_STATUS.REGISTERED, index: 2, },
      ]

      await saveParticipantList(partyAddress, originalList, {
        finalized: true,
      })

      const ret = await db.updateParticipantStatus(partyAddress, addr1, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 5
      })

      expect(ret).not.toEqual({})

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        { address: addr1, status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT, index: 5 },
        { address: addr2, status: PARTICIPANT_STATUS.REGISTERED, index: 2, },
      ])
    })

    it('creates participant list and updates party participants count if it does not exist yet', async () => {
      const participantAddress = newAddr()

      const ret = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 5
      })

      expect(ret).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 5,
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.REGISTERED,
          index: 5,
        }
      ])
      expect(doc.address).toEqual(partyAddress)
      expect(doc.lastUpdated).toBeDefined()
    })

    it('auto-lowercases all addresses', async () => {
      const participantAddress = newAddr()

      const ret = await db.updateParticipantStatus(
        partyAddress.toUpperCase(), participantAddress.toUpperCase(), {
          status: PARTICIPANT_STATUS.REGISTERED
        }
      )

      expect(ret).toEqual({
        address: participantAddress.toLowerCase(),
        status: PARTICIPANT_STATUS.REGISTERED,
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        { address: participantAddress, status: PARTICIPANT_STATUS.REGISTERED }
      ])
      expect(doc.address).toEqual(partyAddress)
      expect(doc.lastUpdated).toBeDefined()
    })

    it('appends to participant list and updates party participants count if participant not already in list', async () => {
      const originalList = [
        { address: newAddr(), status: PARTICIPANT_STATUS.SHOWED_UP }
      ]

      await saveParticipantList(partyAddress, originalList)

      const participantAddress = newAddr()

      const ret = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 3,
      })

      expect(ret).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.REGISTERED,
        index: 3,
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        ...originalList,
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.REGISTERED,
          index: 3,
        },
      ])
    })

    it('updates participant list entry if participant already in list', async () => {
      const participantAddress = newAddr()

      const originalList = [
        { address: participantAddress, status: PARTICIPANT_STATUS.SHOWED_UP },
        { address: newAddr(), status: PARTICIPANT_STATUS.REGISTERED }
      ]

      await saveParticipantList(partyAddress, originalList)

      const ret = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
      })

      expect(ret).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        { address: participantAddress, status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT },
        originalList[1],
      ])
    })

    it('overrides participant index only if valid new index value provided', async () => {
      const participantAddress = newAddr()

      const originalList = [
        { address: participantAddress, status: PARTICIPANT_STATUS.SHOWED_UP, index: 6 },
      ]

      await saveParticipantList(partyAddress, originalList)

      const ret = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: undefined
      })

      expect(ret).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 6,
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          index: 6,
        },
      ])

      const ret2 = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 8
      })

      expect(ret2).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 8,
      })

      const doc2 = await loadParticipantList(partyAddress)

      expect(doc2.participants).toEqual([
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          index: 8,
        },
      ])
    })

    it('overrides participant user profile data with what is in current profile', async () => {
      const participantAddress = newAddr()

      const originalList = [
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.SHOWED_UP,
          index: 6,
          social: 123,
          username: 'me',
          realName: 'carlos matos',
        },
      ]

      await saveParticipantList(partyAddress, originalList)

      const ret = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: undefined
      })

      expect(ret).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 6,
        social: 123,
        username: 'me',
        realName: 'carlos matos',
      })

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual([
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          index: 6,
          social: 123,
          username: 'me',
          realName: 'carlos matos',
        },
      ])

      db.getUserProfile = () => ({
        social: 456,
        realName: 'march',
        username: 'march234'
      })

      const ret2 = await db.updateParticipantStatus(partyAddress, participantAddress, {
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 8
      })

      expect(ret2).toEqual({
        address: participantAddress,
        status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
        index: 8,
        social: 456,
        realName: 'march',
        username: 'march234'
      })

      const doc2 = await loadParticipantList(partyAddress)

      expect(doc2.participants).toEqual([
        {
          address: participantAddress,
          status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          index: 8,
          social: 456,
          realName: 'march',
          username: 'march234'
        },
      ])
    })
  })

  describe('finalize', () => {
    let partyAddress
    let participants
    let maxParticipants

    beforeEach(async () => {
      partyAddress = newAddr()

      await saveParty(partyAddress, {})

      maxParticipants = 351
      participants = []
      for (let i = 0; maxParticipants > i; i += 1) {
        participants.push(
          {
            address: newAddr(),
            index: i + 1,
            status: PARTICIPANT_STATUS.WITHDRAWN_PAYOUT,
          }
        )
      }

      await saveParticipantList(partyAddress, participants)
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.finalize(invalidPartyAddress, [ 0, 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('does nothing if party cancelled', async () => {
      await saveParty(partyAddress, {
        cancelled: true,
      })

      await db.finalize(partyAddress, [ 0, 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('does nothing if party ended', async () => {
      await saveParty(partyAddress, {
        ended: true,
      })

      await db.finalize(partyAddress, [ 0, 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('does nothing if attendance already finalized', async () => {
      await saveParticipantList(partyAddress, participants, {
        finalized: true
      })

      await db.finalize(partyAddress, [ 0, 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('does nothing if not enough maps given', async () => {
      await db.finalize(partyAddress, [ 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('does nothing if too many maps given', async () => {
      await db.finalize(partyAddress, [ 0, 0, 0 ])

      const doc = await loadParticipantList(partyAddress)

      expect(doc.participants).toEqual(participants)
    })

    it('finalizes attendance - p0', async () => {
      await db.finalize(partyAddress, [ 1, 0 ])

      const doc = await loadParticipantList(partyAddress)

      const expectedParticipants = [ ...participants ]
      for (let i = 0; participants.length > i; i += 1) {
        expectedParticipants[i].status = PARTICIPANT_STATUS.REGISTERED
      }
      expectedParticipants[0].status = PARTICIPANT_STATUS.SHOWED_UP

      expect(doc.participants).toEqual(expectedParticipants)

      const party = await loadParty(partyAddress)
      expect(party.ended).toEqual(true)
    })

    it('finalizes attendance - p0, p255, p257, 349, pMax', async () => {
      const maps = [
        toBN(0).bincn(0).bincn(255),
        toBN(0).bincn(1).bincn(349 % 256).bincn((participants.length - 1) % 256),
      ]

      await db.finalize(partyAddress, maps)

      const doc = await loadParticipantList(partyAddress)

      const expectedParticipants = [ ...participants ]
      for (let i = 0; participants.length > i; i += 1) {
        expectedParticipants[i].status = PARTICIPANT_STATUS.REGISTERED
      }
      expectedParticipants[0].status = PARTICIPANT_STATUS.SHOWED_UP
      expectedParticipants[255].status = PARTICIPANT_STATUS.SHOWED_UP
      expectedParticipants[257].status = PARTICIPANT_STATUS.SHOWED_UP
      expectedParticipants[349].status = PARTICIPANT_STATUS.SHOWED_UP
      expectedParticipants[expectedParticipants.length - 1].status = PARTICIPANT_STATUS.SHOWED_UP

      expect(doc.participants).toEqual(expectedParticipants)
      expect(doc.finalized).toEqual(true)

      const party = await loadParty(partyAddress)
      expect(party.ended).toEqual(true)
    })

    it('finalizes attendance - all', async () => {
      let bn = toBN(0)
      for (let i = 0; 256 > i; i += 1) {
        bn = bn.bincn(i)
      }
      const maps = [ bn.toString(16), bn.toString(16) ]

      await db.finalize(partyAddress, maps)

      const doc = await loadParticipantList(partyAddress)

      const expectedParticipants = [ ...participants ]
      for (let i = 0; participants.length > i; i += 1) {
        expectedParticipants[i].status = PARTICIPANT_STATUS.SHOWED_UP
      }

      expect(doc.participants).toEqual(expectedParticipants)
      expect(doc.finalized).toEqual(true)

      const party = await loadParty(partyAddress)
      expect(party.ended).toEqual(true)
    })

    it('finalizes attendance - none', async () => {
      const maps = [ '0', '0' ]

      await db.finalize(partyAddress, maps)

      const doc = await loadParticipantList(partyAddress)

      const expectedParticipants = [ ...participants ]
      for (let i = 0; participants.length > i; i += 1) {
        expectedParticipants[i].status = PARTICIPANT_STATUS.REGISTERED
      }

      expect(doc.participants).toEqual(expectedParticipants)
      expect(doc.finalized).toEqual(true)

      const party = await loadParty(partyAddress)
      expect(party.ended).toEqual(true)
    })
  })

  describe('markPartyCancelled', () => {
    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.markPartyCancelled(invalidPartyAddress)

      const party = await loadParty(invalidPartyAddress)

      expect(party).toBeUndefined()
    })

    it('marks party as ended if found', async () => {
      const address = newAddr()

      await saveParty(address, {
        ended: false,
        cancelled: false
      })

      await db.markPartyCancelled(address)

      const party = await loadParty(address)

      expect(party).toMatchObject({
        ended: true,
        cancelled: true,
      })

      expect(party.lastUpdated).toBeGreaterThan(0)
    })

    it('handles uppercase party address', async () => {
      const address = newAddr()

      await saveParty(address, {
        ended: false,
        cancelled: false
      })

      await db.markPartyCancelled(address.toUpperCase())

      const party = await loadParty(address)

      expect(party).toMatchObject({
        ended: true,
        cancelled: true,
      })
    })
  })

  describe('addAdmin', () => {
    let partyAddress

    beforeEach(async () => {
      partyAddress = newAddr()

      await saveParty(partyAddress, {})
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.addPartyAdmin(invalidPartyAddress, newAddr())

      const party = await loadParty(invalidPartyAddress)

      expect(party).toBeUndefined()
    })

    it('adds admin', async () => {
      const adminAddress = newAddr()

      await db.addPartyAdmin(partyAddress, adminAddress)

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress ],
      })

      expect(party.lastUpdated).toBeGreaterThan(0)
    })

    it('checks to see if admin already added', async () => {
      const adminAddress = newAddr()

      await saveParty(partyAddress, {
        admins: [ adminAddress ]
      })

      await db.addPartyAdmin(partyAddress, adminAddress)

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress ],
      })
    })

    it('auto-lowercases addresses', async () => {
      const adminAddress = newAddr()

      await saveParty(partyAddress, {
        admins: [ adminAddress ]
      })

      await db.addPartyAdmin(partyAddress.toUpperCase(), adminAddress.toUpperCase())

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress ],
      })
    })
  })

  describe('removeAdmin', () => {
    let adminAddress
    let adminAddress2
    let partyAddress

    beforeEach(async () => {
      adminAddress = newAddr()
      adminAddress2 = newAddr()
      partyAddress = newAddr()

      await saveParty(partyAddress, {
        admins: [ adminAddress, adminAddress2 ]
      })
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.removePartyAdmin(invalidPartyAddress, newAddr())

      const party = await loadParty(invalidPartyAddress)

      expect(party).toBeUndefined()
    })

    it('does nothing if admin not found', async () => {
      await db.removePartyAdmin(partyAddress, newAddr())

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress, adminAddress2 ],
      })
    })

    it('removes admin if found', async () => {
      await db.removePartyAdmin(partyAddress, adminAddress)

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress2 ],
      })

      expect(party.lastUpdated).toBeGreaterThan(0)
    })

    it('auto-lowercases addresses', async () => {
      await db.removePartyAdmin(partyAddress.toUpperCase(), adminAddress.toUpperCase())

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        admins: [ adminAddress2 ],
      })
    })
  })

  describe('setNewPartyOwner', () => {
    let partyAddress
    let ownerAddress

    beforeEach(async () => {
      partyAddress = newAddr()
      ownerAddress = newAddr()

      await saveParty(partyAddress, {
        owner: ownerAddress
      })
    })

    it('does nothing if party not found', async () => {
      const invalidPartyAddress = newAddr()

      await db.setNewPartyOwner(invalidPartyAddress, newAddr())

      const party = await loadParty(invalidPartyAddress)

      expect(party).toBeUndefined()
    })

    it('sets new owner', async () => {
      const newOwner = newAddr()

      await db.setNewPartyOwner(partyAddress, newOwner)

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        owner: newOwner
      })

      expect(party.lastUpdated).toBeGreaterThan(0)
    })

    it('auto-lowercases addresses', async () => {
      const newOwner = newAddr()

      await db.setNewPartyOwner(partyAddress.toUpperCase(), newOwner.toUpperCase())

      const party = await loadParty(partyAddress)

      expect(party).toMatchObject({
        owner: newOwner
      })
    })
  })
})
