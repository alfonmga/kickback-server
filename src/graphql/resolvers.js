const safeGet = require('lodash.get')
const { ATTENDEE_STATUS } = require('../constants/status')
const { ADMIN, OWNER } = require('../constants/roles')
const { addressesMatch } = require('../utils/validators')

const assertUser = async user => {
  if (!safeGet(user, 'address')) {
    throw new Error('Not logged in!')
  }
}

const attendeeStatusToInternalStatus = status => (
  ATTENDEE_STATUS[status] || ATTENDEE_STATUS.UNKNOWN
)

const internalStatusToAttendeeStatus = status => {
  // eslint-disable-next-line no-restricted-syntax
  for (const key in ATTENDEE_STATUS) {
    if (ATTENDEE_STATUS[key] === status) {
      return key
    }
  }

  return 'UNKNOWN'
}

module.exports = ({ db }) => {
  const assertPartyRole = async (partyAddress, user, role) => {
    assertUser(user)

    const party = await db.getParty(partyAddress)

    const isOwner = party && addressesMatch(party.owner, user)
    const isAdmin = party && party.admins.find(a => addressesMatch(a, user.address))

    switch (role) {
      case ADMIN: {
        if (isAdmin || isOwner) {
          return
        }
        break
      }
      case OWNER: {
        if (isOwner) {
          return
        }
        break
      }
      default:
        break
    }

    throw new Error(`Must have role: ${role}`)
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
      activeParties: async () => db.getActiveParties(),
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
      updateAttendeeStatus: async (_, {
        address: partyAddress,
        attendee: { address, status }
      }, { user }) => {
        await assertPartyRole(partyAddress, user, ADMIN)

        return db.updateAttendeeStatus(
          partyAddress, address, { status: attendeeStatusToInternalStatus(status) }
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
      attendees: async ({ address }) => db.getAttendees(address),
    },
    LoginChallenge: {
      str: s => s
    },
    Attendee: {
      status: ({ status }) => internalStatusToAttendeeStatus(status),
      user: ({ address, social }) => ({ address, social })
    },
  }
}
