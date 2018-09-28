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
  status; AttendeeStatus!
}

type Query {
  activeParties: [Party]
  attendees(party: String!): [Attendee]
  userProfile(address: String!): UserProfile
}

type Mutation {
  createLoginChallenge(address: String!): LoginChallenge
  updateUserProfile(profile: UserProfileInput!): UserProfile
  updatePartyMeta(party: String!, meta: PartyMetaInput!): Party
  updateAttendeeStatus(party: String!, attendeee: AttendeeInput!): Attendee
}
`
