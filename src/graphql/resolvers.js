module.exports = ({ db }) => ({
  Query: {
    allParties: async () => db.getActiveParties(),
  },
  Address: {
    hex: a => a
  }
})
