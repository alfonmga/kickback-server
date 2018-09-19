import Log from 'logarama'
import { generateMnemonic, EthHdWallet } from 'eth-hd-wallet'

import createDb from './'
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
  let blockChain
  let db
  let nativeDb
  let config

  beforeAll(async () => {
    log = new Log({
      minLevel: 'info'
    })

    const networkId = Math.random()

    blockChain = {
      getNetworkId: () => networkId
    }

    config = require('../config')

    db = await createDb({ config, log, blockChain })
    nativeDb = db._nativeDb
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
