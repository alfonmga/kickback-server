import Log from 'logarama'
import { generateMnemonic, EthHdWallet } from 'eth-hd-wallet'

import createDb from './'

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

      const doc = await nativeDb.doc(`user/${userAddress}`).get()

      const data = doc.data()

      expect(data.lastUpdated).toBeGreaterThan(user.lastUpdated)

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

      const doc = await nativeDb.doc(`user/${userAddress}`).get()

      const data = doc.data()

      expect(data.email).toEqual(user.email)
    })

    it('handles case when new email given', async () => {
      await db.updateUserProfile(userAddress, {
        email: 'test-newemail@kickback.events'
      })

      const doc = await nativeDb.doc(`user/${userAddress}`).get()

      const data = doc.data()

      expect(data.email).toEqual({
        verified: user.email.verified,
        pending: 'test-newemail@kickback.events'
      })
    })
  })
})
