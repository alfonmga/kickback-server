const { gql } = require('apollo-server-koa')

module.exports = gql`
type Party {
  name: String!
  description: String
  location: String
  image: String
  date: String
  address: String!
  deposit: String!
  coolingPeriod: String!
  attendeeLimit: Int!
  attendees: [Attendee]!
  owner: UserProfile!
  admins: [UserProfile]!
  ended: Boolean
  cancelled: Boolean
}

input PartyMetaInput {
  name: String
  description: String
  date: String
  location: String
  image: String
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
  address: String!
  created: String
  lastLogin: String
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
  WITHDRAWN_PAYOUT
  UNKNOWN
}

# we only allow certain statuses to be externally updateable
enum UpdateableAttendeeStatus {
  REGISTERED # if they don't show up
  SHOWED_UP # if they show up
}

type Attendee {
  user: UserProfile!
  index: Int!
  status: AttendeeStatus!
}

input AttendeeInput {
  address: String!
  status: UpdateableAttendeeStatus!
}

type Query {
  activeParties: [Party]
  party(address: String!): Party
  userProfile(address: String!): UserProfile
}

type Mutation {
  createLoginChallenge(address: String!): LoginChallenge
  loginUser: UserProfile
  updateUserProfile(profile: UserProfileInput!): UserProfile
  updatePartyMeta(address: String!, meta: PartyMetaInput!): Party
  updateAttendeeStatus(address: String!, attendee: AttendeeInput!): Attendee
}
`
