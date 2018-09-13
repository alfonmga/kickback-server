const { gql } = require('apollo-server-koa')

module.exports = gql`
type Address {
  hex: String!
}

type Party {
  name: String
  address: Address!
  deposit: String
  attendeeLimit: Int
  attendees: Int
  created: String
  lastUpdated: String
}

type Query {
  allParties: [Party]
}
`
