module.exports = [
  /* ask user to verify their email address */
  'VERIFY_EMAIL',
  /* once user has registered for an event */
  'RSVP_CONFIRMED',
  /* once payouts are ready for an event */
  'PAYOUT_READY',
  /* if user not yet withdrawn payout */
  'PAYOUT_STILL_PENDING',
  /* asking participant for feedback */
  'PARTICIPANT_FEEDBACK',
  /* asking event host for feedback */
  'HOST_FEEDBACK'
].reduce((m, a) => {
  m[a] = a
  return m
}, {})
