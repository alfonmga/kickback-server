const safeGet = require('lodash.get')
const {
  addressesMatch,
  trimOrEmpty,
  PARTICIPANT_STATUS
} = require('@noblocknoparty/shared')

const { ADMIN, OWNER } = require('../constants/roles')

const assertUser = async user => {
  if (!safeGet(user, 'address')) {
    throw new Error('Not logged in!')
  }
}

<<<<<<< HEAD
const participantStatusToInternalStatus = status =>
  PARTICIPANT_STATUS[status] || PARTICIPANT_STATUS.UNKNOWN
=======
const participantStatusToInternalStatus = status => {
  if (!PARTICIPANT_STATUS[status]) {
    throw new Error(`Unrecognized status: ${status}`)
  }

  return status
}
>>>>>>> aa2403517bbbe2ace5239b2221e15ecc93d3eb90

const internalStatusToParticipantStatus = status => {
  // eslint-disable-next-line no-restricted-syntax
  for (const key in PARTICIPANT_STATUS) {
    if (PARTICIPANT_STATUS[key] === status) {
      return key
    }
  }

  return 'UNKNOWN'
}

module.exports = ({ config, db, blockChain }) => {
  const assertSuperAdminPassword = password => {
    if (trimOrEmpty(config.SUPERADMIN_PASSWORD) !== trimOrEmpty(password)) {
      throw new Error('Incorrect superadmin password')
    }
  }

  const hasPartyRole = (party, user, role) => {
    if (!party || !user) {
      return false
    }

    const isOwner = addressesMatch(party.owner, user.address)
    const isAdmin = party.admins.find(a => addressesMatch(a, user.address))

    switch (role) {
      case ADMIN: {
        if (isAdmin || isOwner) {
          return true
        }
        break
      }
      case OWNER: {
        if (isOwner) {
          return true
        }
        break
      }
      default:
        break
    }

    return false
  }

  const assertPartyRole = async (partyAddress, user, role) => {
    assertUser(user)

    const party = await db.getParty(partyAddress)

    if (!hasPartyRole(party, user, role)) {
      throw new Error(`Must have role: ${role}`)
    }
  }

  const loadProfileOrJustReturnAddress = async (address, currentUser) => {
    const profile = await db.getUserProfile(
      address,
      currentUser && addressesMatch(currentUser.address, address)
    )

    return {
      ...profile,
      address
    }
  }

  return {
    Query: {
      networkId: async () => blockChain.networkId,
      allParties: async () => db.getParties(),
      activeParties: async () => db.getParties({ onlyActive: true }),
      party: async (_, { address }) => db.getParty(address),
      partyAdminView: async (_, { address }, context) => {
        const party = await db.getParty(address)
        await assertPartyRole(partyAddress, context.user, ADMIN)
        context.isPartyAdmin = true
        context.isPartyAdminView = true
        return {
          ...party
        }
      },
      userProfile: async (_, { address }, { user }) =>
        loadProfileOrJustReturnAddress(address, user)
    },
    Mutation: {
      createLoginChallenge: async (_, { address }) =>
        db.createLoginChallenge(address),
      loginUser: async (_, __, { user }) => {
        await assertUser(user)

        return db.loginUser(user.address)
      },
      updateUserProfile: async (_, { profile }, { user }) => {
        await assertUser(user)

        const { address } = user

        return db.updateUserProfile(address, profile)
      },
      updatePartyMeta: async (_, { address: partyAddress, meta }, { user }) => {
        await assertPartyRole(partyAddress, user, OWNER)

        return db.updatePartyMeta(partyAddress, meta)
      },
      createPendingParty: async (_, { meta, password }, { user }) => {
        assertSuperAdminPassword(password)

        await assertUser(user)

        return db.createPendingParty(user.address, meta)
      },
      updateParticipantStatus: async (
        _,
        { address: partyAddress, participant: { address, status } },
        context
      ) => {
        await assertPartyRole(partyAddress, context.user, ADMIN)
        context.isPartyAdmin = true
        return db.updateParticipantStatus(partyAddress, address, {
          status: participantStatusToInternalStatus(status)
        })
      }
    },
    Party: {
      owner: async ({ owner }, _, { user }) =>
        loadProfileOrJustReturnAddress(owner, user),
      admins: async ({ admins }, _, { user }) =>
        (admins || []).map(admin =>
          loadProfileOrJustReturnAddress(admin, user)
        ),
      participants: async party => db.getParticipants(party.address)
    },
    LoginChallenge: {
      str: s => s
    },
    Participant: {
      status: ({ status }) => internalStatusToParticipantStatus(status),
      user: async (user, _, context) => {
        const { address, social, username, realName } = user
        const { isPartyAdmin, isPartyAdminView } = context

        if (isPartyAdminView) {
          const userProfile = await db.getUserProfile(address, true)
          const {
            email,
            legal,
            social,
            username,
            realName,
            address
          } = userProfile
          return {
            email,
            legal,
            address: address.toLowerCase(),
            social,
            username,
            realName
          }
        }

        return {
          address,
          social,
          username,
          realName: isPartyAdmin ? realName : null
        }
      },
      index: ({ index }) => parseInt(index, 10)
    }
  }
}
