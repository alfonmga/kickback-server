const { gql } = require('apollo-server-koa')

module.exports = gql`
type Address {
  hex: String!
}

type Party {
  name: String!
  address: Address!
  deposit: String!
  attendeeLimit: Int!
  attendees: Int!
}

type Query {
  allParties: [Party]
}
`
