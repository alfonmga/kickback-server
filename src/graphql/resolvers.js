const safeGet = require('lodash.get')
const { addressesMatch, PARTICIPANT_STATUS } = require('@noblocknoparty/shared')

const { ADMIN, OWNER } = require('../constants/roles')

const assertUser = async user => {
  if (!safeGet(user, 'address')) {
    throw new Error('Not logged in!')
  }
}

const participantStatusToInternalStatus = status => (
  PARTICIPANT_STATUS[status] || PARTICIPANT_STATUS.UNKNOWN
)

const internalStatusToParticipantStatus = status => {
  // eslint-disable-next-line no-restricted-syntax
  for (const key in PARTICIPANT_STATUS) {
    if (PARTICIPANT_STATUS[key] === status) {
      return key
    }
  }

  return 'UNKNOWN'
}

module.exports = ({ db, blockChain }) => {
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
      userProfile: async (_, { address }, { user }) => (
        loadProfileOrJustReturnAddress(address, user)
      ),
    },
    Mutation: {
      createLoginChallenge: async (_, { address }) => db.createLoginChallenge(address),
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
      createPendingParty: async (_, { meta }, { user }) => {
        await assertUser(user)

        return db.createPendingParty(user.address, meta)
      },
      updateParticipantStatus: async (_, {
        address: partyAddress,
        participant: { address, status }
      }, context) => {
        await assertPartyRole(partyAddress, context.user, ADMIN)
        context.isPartyAdmin = true
        return db.updateParticipantStatus(
          partyAddress, address, { status: participantStatusToInternalStatus(status) }
        )
      },
    },
    Party: {
      owner: async ({ owner }, _, { user }) => (
        loadProfileOrJustReturnAddress(owner, user)
      ),
      admins: async ({ admins }, _, { user }) => (
        (admins || []).map(admin => (
          loadProfileOrJustReturnAddress(admin, user)
        ))
      ),
      participants: async (party, _, context) => {
        context.isPartyAdmin = hasPartyRole(party, context.user, ADMIN)
        return db.getParticipants(party.address)
      },
    },
    LoginChallenge: {
      str: s => s
    },
    Participant: {
      status: ({ status }) => internalStatusToParticipantStatus(status),
      user: ({ address, social, username, realName }, _, { isPartyAdmin }) => ({
        address,
        social,
        username,
        realName: isPartyAdmin ? realName : null,
      }),
      index: ({ index }) => parseInt(index, 10),
    },
  }
}
