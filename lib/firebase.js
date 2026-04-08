const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return;

  const credentialsJson = process.env.FIREBASE_CREDENTIALS_JSON;
  const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH;

  if (credentialsJson) {
    const serviceAccount = JSON.parse(credentialsJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (credentialsPath) {
    const serviceAccount = require(credentialsPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp();
  }

  initialized = true;
}

function getAuth() {
  initFirebase();
  return admin.auth();
}

function getMessaging() {
  initFirebase();
  return admin.messaging();
}

module.exports = { initFirebase, getAuth, getMessaging };
