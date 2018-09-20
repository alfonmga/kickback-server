module.exports = [
  'VERIFY_EMAIL',
  'REGISTERED_AS_ATTENDEE',
  'PAYOUT_READY',
  'PAYOUT_PENDING',
  'ATTENDEE_FEEDBACK',
  'HOST_FEEDBACK'
].reduce((m, a) => {
  m[a] = a
  return m
}, {})
