const FirebaseAdmin = require('firebase-admin')

module.exports = ({ FIREBASE }, log) => {
  // eslint-disable-next-line import/no-dynamic-require
  const serviceAccount = require(FIREBASE.keyFilename)

  FirebaseAdmin.initializeApp({
    credential: FirebaseAdmin.credential.cert(serviceAccount)
  })

  const db = FirebaseAdmin.firestore()

  log.info('Firestore connected')

  return db
}
