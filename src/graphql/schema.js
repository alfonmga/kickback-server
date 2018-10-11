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
  participantLimit: Int!
  participants: [Participant]!
  owner: UserProfile!
  admins: [UserProfile]!
  ended: Boolean
  cancelled: Boolean
}

input PartyMetaInput {
  name: String!
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
  MARKETING_INFO
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

enum ParticipantStatus {
  REGISTERED
  SHOWED_UP
  WITHDRAWN_PAYOUT
  UNKNOWN
}

# we only allow certain statuses to be externally updateable
enum UpdateableParticipantStatus {
  REGISTERED # if they don't show up
  SHOWED_UP # if they show up
}

type Participant {
  user: UserProfile
  index: Int
  status: ParticipantStatus
}

input ParticipantInput {
  address: String!
  status: UpdateableParticipantStatus!
}

type Query {
  allParties: [Party]
  activeParties: [Party]
  party(address: String!): Party
  userProfile(address: String!): UserProfile
}

type Mutation {
  createPendingParty(meta: PartyMetaInput!): ID
  createLoginChallenge(address: String!): LoginChallenge
  loginUser: UserProfile
  updateUserProfile(profile: UserProfileInput!): UserProfile
  updatePartyMeta(address: String!, meta: PartyMetaInput!): Party
  updateParticipantStatus(address: String!, participant: ParticipantInput!): Participant
}
`
