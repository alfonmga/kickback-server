const safeGet = require('lodash.get')
const { ATTENDEE_STATUS } = require('../constants/status')
const { ADMIN, OWNER } = require('../constants/roles')

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

    const isOwner = party && party.owner === user.address
    const isAdmin = party && party.admins.find(a => a === user.address)

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

  return {
    Query: {
      activeParties: async () => db.getActiveParties(),
      userProfile: async (_, { address }, { user }) => (
        db.getUserProfile(address, user && user.address === address)
      ),
      attendees: async (_, { party }) => db.getAttendees(party),
    },
    Mutation: {
      createLoginChallenge: async (_, { address }) => db.createLoginChallenge(address),
      updateUserProfile: async (_, { profile }, { user }) => {
        await assertUser(user)

        const { address } = user

        return db.updateUserProfile(address, profile)
      },
      updatePartyMeta: async (_, { party, meta }, { user }) => {
        await assertPartyRole(party, user, OWNER)

        return db.updatePartyMeta(party, meta)
      },
      updateAttendeeStatus: async (_, { party, attendee: { address, status } }, { user }) => {
        await assertPartyRole(party, user, ADMIN)

        return db.updateAttendeeStatus(party, address, attendeeStatusToInternalStatus(status))
      },
    },
    LoginChallenge: {
      str: s => s
    },
    Attendee: {
      status: ({ status }) => internalStatusToAttendeeStatus(status)
    }
  }
}
