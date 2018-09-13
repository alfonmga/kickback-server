const { ApolloServer } = require('apollo-server-koa')

const types = require('./types')
const createResolvers = require('./resolvers')

module.exports = ({ db, server: app }) => {
  const server = new ApolloServer({
    introspection: true,
    typeDefs: types,
    resolvers: createResolvers({ db }),
  })

  server.applyMiddleware({ app })
}
