import admin from "firebase-admin";

let firebaseInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseInitialized || admin.apps.length) {
    return true;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase Admin SDK credentials not configured. Firebase auth verification will be skipped.");
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    firebaseInitialized = true;
    console.log("Firebase Admin SDK initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    return false;
  }
}

export function isFirebaseAdminReady(): boolean {
  return initializeFirebaseAdmin();
}

export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
  if (!isFirebaseAdminReady()) {
    console.warn("[FirebaseAdmin] Admin not ready, skipping token verification");
    return null;
  }

  try {
    console.log(`[FirebaseAdmin] Verifying token (length=${idToken?.length || 0})...`);
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log(`[FirebaseAdmin] Token verified: uid=${decodedToken.uid}, email=${decodedToken.email}, provider=${decodedToken.firebase?.sign_in_provider}`);
    return decodedToken;
  } catch (error: any) {
    console.error(`[FirebaseAdmin] Token verification FAILED: code=${error?.code}, message=${error?.message}`);
    return null;
  }
}

export function getFirebaseUidFromToken(decodedToken: admin.auth.DecodedIdToken): string {
  return decodedToken.uid;
}

export function getEmailFromToken(decodedToken: admin.auth.DecodedIdToken): string | undefined {
  return decodedToken.email;
}
