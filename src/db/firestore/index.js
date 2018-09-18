const crypto = require('crypto')
const FirebaseAdmin = require('firebase-admin')

module.exports = async ({ config: { env, FIREBASE }, log: parentLog }) => {
  const log = parentLog.create('firestore')

  const cipher = crypto.createDecipheriv('aes-256-cbc', env.CONFIG_ENCRYPTION_KEY, env.CONFIG_ENCRYPTION_IV)
  const plaintext = cipher.update(FIREBASE.encryptedCredentials, 'base64', 'utf8') + cipher.final('utf8')
  const serviceAccount = JSON.parse(plaintext)

  FirebaseAdmin.initializeApp({
    databaseURL: FIREBASE.url,
    credential: FirebaseAdmin.credential.cert(serviceAccount)
  })

  const db = FirebaseAdmin.firestore()

  db.settings({
    timestampsInSnapshots: true
  })

  await db.getCollections()

  log.info('Connected to Firestore!')

  return db
}
