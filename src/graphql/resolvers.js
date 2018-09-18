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
    )
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
  }
})
