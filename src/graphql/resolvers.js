const { STATUS: ATTENDEE_STATUS } = require('../constants/attendees')

const assertUser = user => {
  if (!user) {
    throw new Error(`Not logged in!`)
  }
}

module.exports = ({ db }) => ({
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
      assertUser(user)

      const { address } = user

      return db.updateUserProfile(address, profile)
    }
  },
  LoginChallenge: {
    str: s => s
  },
  Attendee: {
    status: ({ status }) => {
      // eslint-disable-next-line no-restricted-syntax
      for (const key in ATTENDEE_STATUS) {
        if (ATTENDEE_STATUS[key] === status) {
          return key
        }
      }

      return 'UNKNOWN'
    }
  }
})
