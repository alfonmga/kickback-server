import Ganache from 'ganache-core'
import Web3 from 'web3'
import { toHex, toWei } from 'web3-utils'
import { Conference } from '@noblocknoparty/contracts'
import { generateMnemonic, EthHdWallet } from 'eth-hd-wallet'

import createLog from '../log'
import createDb from './'
import { getContract } from '../utils/contracts'
import { SESSION_VALIDITY_SECONDS } from '../constants/session'

const wallet = EthHdWallet.fromMnemonic(generateMnemonic())

const newAddr = () => wallet.generateAddresses(1).pop()

const createUserProfile = address => ({
  address,
  lastUpdated: Date.now(),
  created: Date.now(),
  email: {
    verified: 'test@kickback.events'
  },
  social: {
    twitter: 'https://twitter.com/wearekickback'
  }
})

describe('ethereum', () => {
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

    saveUser = async (address, data) => nativeDb.doc(`user/${address}`).set({
      address,
      ...data
    })
    updateUser = async (address, data) => nativeDb.doc(`user/${address}`).update(data)
    loadUser = async address => nativeDb.doc(`user/${address}`).get().then(d => d.data())

    saveParty = async (address, data) => nativeDb.doc(`party/${address}-${networkId}`).set({
      address,
      network: networkId,
      ...data
    })
    loadParty = async address => nativeDb.doc(`party/${address}-${networkId}`).get().then(d => d.data())
  })

  describe('getActiveParties', () => {
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
      const events = await db.getActiveParties()

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

    it('can return limited results', async () => {
      const events = await db.getActiveParties({ limit: 1 })

      expect(events.length).toEqual(1)

      expect(events[0]).toMatchObject({
        address: 'testparty5',
      })
    })

    it('can return in order stalest first', async () => {
      const events = await db.getActiveParties({ stalestFirst: true })

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

  describe('addPartyFromContract', () => {
    let party

    beforeEach(async () => {
      party = await getContract(Conference, web3, { from: accounts[0] }).new(
        'test', toHex(toWei('0.2', 'ether')), 100, 2, 'test', accounts[0]
      )
    })

    it('does nothing if party already exists in db', async () => {
      await saveParty(party.address, {
        dummy: true
      })

      const unchanged = await loadParty(party.address)

      await db.addPartyFromContract(party)

      const data = await loadParty(party.address)

      expect(data).toEqual(unchanged)
    })

    it('adds new party to db', async () => {
      await db.addPartyFromContract(party)

      const data = await loadParty(party.address)

      expect(data).toMatchObject({
        network: blockChain.networkId,
        name: 'test',
        deposit: toHex(toWei('0.2', 'ether')),
        attendeeLimit: 100,
        attendees: 0,
        coolingPeriod: toHex(2),
        ended: false,
      })

      expect(data.created).toBeGreaterThan(0)
      expect(data.created).toEqual(data.lastUpdated)
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

      expect(data.created).toEqual(user.created)
      expect(data.lastUpdated).toBeGreaterThan(user.lastUpdated)
      expect(data.login.challenge).toEqual(str)
      expect(data.login.created).toEqual(data.lastUpdated)
    })

    it('creates new user', async () => {
      const addr = newAddr()

      const str = await db.createLoginChallenge(addr)

      const data = await loadUser(addr)

      expect(data.created).toBeDefined()
      expect(data.lastUpdated).toEqual(data.created)
      expect(data.login.challenge).toEqual(str)
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
        created: user.created,
        social: [
          {
            type: 'twitter',
            value: user.social.twitter
          }
        ]
      })
    })

    it('returns email too if user is profile owner', async () => {
      const ret = await db.getUserProfile(userAddress, true)

      expect(ret).toMatchObject({
        email: user.email,
      })
    })
  })

  describe('updateUserProfile', () => {
    let userAddress
    let user

    beforeEach(async () => {
      userAddress = newAddr()

      await saveUser(userAddress, createUserProfile(userAddress))
      user = await loadUser(userAddress)
    })

    it('throws if address is invalid', async () => {
      try {
        await db.updateUserProfile('invalid', {
          email: 'test-newemail@kickback.events'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if email address is invalid', async () => {
      try {
        await db.updateUserProfile(userAddress, {
          email: 'test-newemail@kickbac'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if user not found', async () => {
      try {
        await db.updateUserProfile(newAddr(), {
          email: 'test-newemail@kickback.events'
        })
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('updates social links', async () => {
      await db.updateUserProfile(userAddress, {
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

    it('ignores same email being passed in', async () => {
      await db.updateUserProfile(userAddress, {
        email: user.email.verified
      })

      const data = await loadUser(userAddress)

      expect(data.email).toEqual(user.email)
    })

    it('handles case when new email given', async () => {
      await db.updateUserProfile(userAddress, {
        email: 'test-newemail@kickback.events'
      })

      const data = await loadUser(userAddress)

      expect(data.email).toEqual({
        verified: user.email.verified,
        pending: 'test-newemail@kickback.events'
      })
    })
  })
})
