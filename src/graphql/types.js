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

input PartyMetaInput {
  name: String
  description: String
  date: String
  location: String
}

type SocialMedia {
  type: String!
  value: String!
}

input SocialMediaInput {
  type: String!
  value: String!
}

type LegalAgreement {
  type: String!
  accepted: Int!
}

input LegalAgreementInput {
  type: String!
  accepted: Int!
}

type UserProfile {
  created: Int!
  address: String!
  avatarUrl: String
  social: [SocialMedia]
  legal: [LegalAgreement]
}

input UserProfileInput {
  email: String
  social: [SocialMediaInput]
  legal: [LegalAgreementInput]
}

type LoginChallenge {
  str: String!
}

enum AttendeeStatus {
  REGISTERED
  SHOWED_UP
  ATTENDED
  WITHDRAWN_PAYOUT
  UNKNOWN
}

type Attendee {
  address: String!
  status: AttendeeStatus!
}

input AttendeeInput {
  address: String!
  status: AttendeeStatus!
}

type Query {
  activeParties: [Party]
  party(address: String!): Party
  attendees(address: String!): [Attendee]
  userProfile(address: String!): UserProfile
}

type Mutation {
  createLoginChallenge(address: String!): LoginChallenge
  updateUserProfile(profile: UserProfileInput!): UserProfile
  updatePartyMeta(address: String!, meta: PartyMetaInput!): Party
  updateAttendeeStatus(address: String!, attendeee: AttendeeInput!): Attendee
}
`
