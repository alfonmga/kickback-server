const promisify = require('es6-promisify')
const safeGet = require('lodash.get')
const mailgun = require('mailgun-js')

const { RSVP_CONFIRMED } = require('../../../constants/notifications')
const rsvpConfirmed = require('./templates/rsvpConfirmed')

module.exports = ({ config, log: parentLog, db }) => {
  const log = parentLog.create('sendNotificationEmail')

  const mg = mailgun({
    apiKey: config.MAILGUN_API_KEY,
    domain: 'kickback.events'
  })

  const msgs = mg.messages()
  const send = promisify(msgs.send, msgs)

  return async ({ ids, type, data }) => {
    const users = Object.values(ids)

    log.debug(`Processing ${users.length} notifications of type ${type} ...`)

    // dont yet support everything
    switch (type) {
      case RSVP_CONFIRMED:
        break
      default:
        return
    }

    const user = await db.getUserProfile(userAddress, true)
    const email = safeGet(user, 'email.verified', safeGet(user, 'email.pending'))

    let text
    let subject

    switch (type) {
      case RSVP_CONFIRMED:
        subject = `You have successfully RSVP'd for: ${data.eventTitle}`
        text = rsvpConfirmed({
          name: safeGet(user, 'username', 'Kickback user'),
          ...data,
        })
        break
      default:
        throw new Error(`No email template found for notification type: ${type}`)
    }

    if (email) {
      log.info(`Sending email for notification ${id} of type ${type} for user ${userAddress} ...`)

      await send({
        from: 'Kickback <hello@kickback.events>',
        to: email,
        subject,
        text
      })
    }
  }
}
