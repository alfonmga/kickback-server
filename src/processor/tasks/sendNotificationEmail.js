module.exports = ({ log: parentLog }) => {
  const log = parentLog.create('sendNotificationEmail')

  return async () => {
    log.debug('Running task ...')
  }
}
