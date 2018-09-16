const { gql } = require('apollo-server-koa')

module.exports = gql`
type Party {
  name: String
  address: String!
  deposit: String
  attendeeLimit: Int
  attendees: Int
  created: String
  lastUpdated: String
}

type SocialMedia {
  type: String!
  value: String!
}

input SocialMediaInput {
  type: String!
  value: String!
}

type UserProfile {
  created: Int!
  address: String!
  avatarUrl: String
  social: [SocialMedia]
}

input UserProfileInput {
  email: String
  social: [SocialMediaInput]
}

type LoginChallenge {
  str: String!
}

type Query {
  allParties: [Party]
  userProfile(address: String!): UserProfile
}

type Mutation {
  createLoginChallenge(address: String!): LoginChallenge
  updateUserProfile(profile: UserProfileInput!): UserProfile
}
`
