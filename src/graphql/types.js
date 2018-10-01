const { gql } = require('apollo-server-koa')

module.exports = gql`
type Party {
  name: String!
  description: String
  location: String
  date: String
  address: String!
  deposit: String!
  coolingPeriod: String!
  attendeeLimit: Int!
  attendees: Int!
  owner: String!
  admins: [String]
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

enum LegalAgreementType {
  TERMS_AND_CONDITIONS
  PRIVACY_POLICY
}

type LegalAgreement {
  type: LegalAgreementType!
  accepted: String!
}

input LegalAgreementInput {
  type: LegalAgreementType!
  accepted: String!
}

type EmailSettings {
  verified: String
  pending: String
}

type UserProfile {
  created: String
  lastLogin: String,
  address: String
  social: [SocialMedia]
  email: EmailSettings
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
  loginUser: UserProfile
  updateUserProfile(profile: UserProfileInput!): UserProfile
  updatePartyMeta(address: String!, meta: PartyMetaInput!): Party
  updateAttendeeStatus(address: String!, attendeee: AttendeeInput!): Attendee
}
`
