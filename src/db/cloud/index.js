const FirebaseAdmin = require('firebase-admin')

module.exports = ({ config: { FIREBASE }, log: parentLog }) => {
  const log = parentLog.create('firestore')

  // eslint-disable-next-line import/no-dynamic-require
  const serviceAccount = require(FIREBASE.keyFilename)

  FirebaseAdmin.initializeApp({
    credential: FirebaseAdmin.credential.cert(serviceAccount)
  })

  const db = FirebaseAdmin.firestore()

  log.info('Connected')

  return db
}
