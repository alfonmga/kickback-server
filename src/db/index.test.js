import Ganache from 'ganache-core'
import Web3 from 'web3'
import { toHex, toWei } from 'web3-utils'
import { Conference } from '@noblocknoparty/contracts'
import Log from 'logarama'
import { generateMnemonic, EthHdWallet } from 'eth-hd-wallet'

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

  beforeAll(async () => {
    log = new Log({
      minLevel: 'info'
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

    blockChain = {
      getNetworkId: () => networkId
    }

    db = await createDb({ config, log, blockChain })
    nativeDb = db._nativeDb
  })

  describe('addParty', () => {
    let party

    beforeEach(async () => {
      party = await getContract(Conference, web3, { from: accounts[0] }).new(
        'test', toHex(toWei('0.2', 'ether')), 100, 2, 'test', accounts[0]
      )
    })

    it('does nothing if party already exists in db', async () => {
      await nativeDb.doc(`party/${party.address}`).set({
        dummy: true
      })

      await db.addParty(party)

      const data = (await nativeDb.doc(`party/${party.address}`).get()).data()

      expect(data).toEqual({
        dummy: true
      })
    })

    it('adds new party to db', async () => {
      await db.addParty(party)

      const data = (await nativeDb.doc(`party/${party.address}`).get()).data()

      expect(data).toMatchObject({
        network: blockChain.getNetworkId(),
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

  describe('updateParty', () => {
    let party

    beforeEach(async () => {
      party = await getContract(Conference, web3, { from: accounts[0] }).new(
        'test', toHex(toWei('0.2', 'ether')), 100, 2, 'test', accounts[0]
      )
    })

    it('does nothing if party does not exist in db', async () => {
      await db.updateParty(party)

      const doc = await nativeDb.doc(`party/${party.address}`).get()

      expect(doc.exists).toBeFalsy()
    })

    it('updates party data if it exists in db', async () => {
      await nativeDb.doc(`party/${party.address}`).set({
        // we expect the update to override these values
        attendeeLimit: 5000,
        attendees: 6000,
        ended: true,
        lastUpdated: 1
      })

      await db.updateParty(party)

      const data = (await nativeDb.doc(`party/${party.address}`).get()).data()

      expect(data).toMatchObject({
        attendeeLimit: 100,
        attendees: 0,
        ended: false,
      })

      expect(data.lastUpdated).toBeGreaterThan(1)
    })
  })

  describe('getLoginChallenge', () => {
    let userAddress
    let userRef

    beforeEach(async () => {
      userAddress = newAddr()

      userRef = nativeDb.doc(`user/${userAddress}`)
      await userRef.set(createUserProfile(userAddress))
    })

    it('throws if user not found', async () => {
      try {
        await db.getLoginChallenge('invalid')
      } catch (err) {
        expect(err).toBeDefined()
      }
    })

    it('throws if challenge has expired', async () => {
      await userRef.update({
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
      await userRef.update({
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

      const userRef = nativeDb.doc(`user/${userAddress}`)
      await userRef.set(createUserProfile(userAddress))
      user = (await userRef.get()).data()
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

      const data = (await nativeDb.doc(`user/${userAddress}`).get()).data()

      expect(data.created).toEqual(user.created)
      expect(data.lastUpdated).toBeGreaterThan(user.lastUpdated)
      expect(data.login.challenge).toEqual(str)
      expect(data.login.created).toEqual(data.lastUpdated)
    })

    it('creates new user', async () => {
      const addr = newAddr()

      const str = await db.createLoginChallenge(addr)

      const data = (await nativeDb.doc(`user/${addr}`).get()).data()

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

      const userRef = nativeDb.doc(`user/${userAddress}`)
      await userRef.set(createUserProfile(userAddress))
      user = (await userRef.get()).data()
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

      const userRef = nativeDb.doc(`user/${userAddress}`)
      await userRef.set(createUserProfile(userAddress))
      user = (await userRef.get()).data()
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

      const data = (await nativeDb.doc(`user/${userAddress}`).get()).data()

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

      const data = (await nativeDb.doc(`user/${userAddress}`).get()).data()

      expect(data.email).toEqual(user.email)
    })

    it('handles case when new email given', async () => {
      await db.updateUserProfile(userAddress, {
        email: 'test-newemail@kickback.events'
      })

      const data = (await nativeDb.doc(`user/${userAddress}`).get()).data()

      expect(data.email).toEqual({
        verified: user.email.verified,
        pending: 'test-newemail@kickback.events'
      })
    })
  })
})
