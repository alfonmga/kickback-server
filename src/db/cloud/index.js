const FirebaseAdmin = require('firebase-admin')

module.exports = async ({ config: { FIREBASE }, log: parentLog }) => {
  const log = parentLog.create('firestore')

  // eslint-disable-next-line import/no-dynamic-require
  const serviceAccount = require(FIREBASE.keyFilename)

  FirebaseAdmin.initializeApp({
    credential: FirebaseAdmin.credential.cert(serviceAccount)
  })

  const db = FirebaseAdmin.firestore()

  db.settings({
    timestampsInSnapshots: true
  })

  await db.getCollections()

  log.info('Connected to Firestore cloud!')

  return db
}
