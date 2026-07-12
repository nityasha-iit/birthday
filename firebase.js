/* ═══════════════════════════════════════════════════════════════
   firebase.js — Shared Memory Persistence
   
   This file connects to Firebase so both Nityasha and Sahasra
   can upload and view new memories from anywhere.

   ════════════════════════════════════════════════════════════════
   HOW TO SET UP FIREBASE (takes about 5 minutes)
   ════════════════════════════════════════════════════════════════

   STEP 1 — Create a Firebase project
   ─────────────────────────────────────────────────────────────
   a) Go to: https://console.firebase.google.com
   b) Click "Add project"
   c) Name it anything (e.g., "sahasra-birthday")
   d) Disable Google Analytics (not needed)
   e) Click "Create project"

   STEP 2 — Register your web app
   ─────────────────────────────────────────────────────────────
   a) In the Firebase Console, click the Web icon: < / >
   b) Enter a nickname (e.g., "birthday-web")
   c) Skip Firebase Hosting for now → click "Register app"
   d) You'll see a config block like this:
      const firebaseConfig = {
        apiKey: "AIzaXXX...",
        authDomain: "your-project.firebaseapp.com",
        ...
      };
   e) COPY that config and PASTE it below, replacing the placeholder values

   STEP 3 — Create Firestore Database
   ─────────────────────────────────────────────────────────────
   a) In Firebase Console → Build → Firestore Database
   b) Click "Create database"
   c) Choose "Start in test mode" → Next
   d) Select a region (asia-south1 is good for India) → Enable

   STEP 4 — Create Firebase Storage
   ─────────────────────────────────────────────────────────────
   a) In Firebase Console → Build → Storage
   b) Click "Get started" → Next → Done

   STEP 5 — Set Security Rules (after testing)
   ─────────────────────────────────────────────────────────────
   Firestore Rules (allows both of you to read/write):
   ┌──────────────────────────────────────────────────────────┐
   │ rules_version = '2';                                     │
   │ service cloud.firestore {                                │
   │   match /databases/{database}/documents {                │
   │     match /memories/{doc} {                              │
   │       allow read, write: if true; // Open personal use   │
   │     }                                                    │
   │   }                                                      │
   │ }                                                        │
   └──────────────────────────────────────────────────────────┘

   Storage Rules:
   ┌──────────────────────────────────────────────────────────┐
   │ rules_version = '2';                                     │
   │ service firebase.storage {                               │
   │   match /b/{bucket}/o {                                  │
   │     match /memories/{allPaths=**} {                      │
   │       allow read, write: if true;                        │
   │     }                                                    │
   │   }                                                      │
   │ }                                                        │
   └──────────────────────────────────────────────────────────┘

   STEP 6 — Share the site
   ─────────────────────────────────────────────────────────────
   Host your birthday website using any of these free options:
   • GitHub Pages (free, easy): https://pages.github.com
   • Vercel (free, fast):       https://vercel.com
   • Netlify (free, drag-drop): https://netlify.com
   Send Sahasra the link — she can view and add memories too!

═══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   FIREBASE CONFIGURATION
   REPLACE: paste your own config values here
────────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

/* ──────────────────────────────────────────────────────────────
   INITIALIZATION
   Automatically detects whether you've added real credentials.
────────────────────────────────────────────────────────────── */
let db, storage;
const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase app (compat SDK — same syntax as v8)
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db      = firebase.firestore();
    storage = firebase.storage();

    // Enable Firestore offline persistence (optional but great UX)
    db.enablePersistence().catch(err => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open — persistence only works in one tab
        console.warn('Firestore: offline persistence disabled (multiple tabs).');
      } else if (err.code === 'unimplemented') {
        // Browser doesn't support it
        console.warn('Firestore: offline persistence not supported in this browser.');
      }
    });

    console.info('✅ Firebase connected. Memories will be saved to the cloud.');

    // Auto-load existing memories on page init
    loadMemories();
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err.message);
    console.error('Double-check your config values in firebase.js');
  }
} else {
  // Graceful degradation: site looks perfect, memory upload shows info message
  console.info('ℹ️  Firebase is not configured yet.');
  console.info('    Open firebase.js and follow the setup instructions at the top.');
  console.info('    The site works without Firebase — memory upload will just show a notice.');

  // Show a soft info message in the form
  setTimeout(() => {
    const status = document.getElementById('form-status');
    if (status) {
      status.textContent = 'Firebase not set up yet — see firebase.js for instructions.';
      status.style.color = '#999';
    }
  }, 1000);
}

/* ══════════════════════════════════════════════════════════════
   FIREBASE FUNCTIONS
══════════════════════════════════════════════════════════════ */

/**
 * addMemory — Upload a photo and save its metadata to Firestore
 *
 * @param {File}   file   — The image file from the upload input
 * @param {string} title  — Memory title (max 80 chars)
 * @param {string} date   — Date string (YYYY-MM-DD)
 * @param {string} note   — Short note about the memory (max 400 chars)
 * @returns {Promise<string>} — Download URL of the uploaded image
 */
window.addMemory = async function addMemory(file, title, date, note) {
  if (!isFirebaseConfigured || !db || !storage) {
    throw new Error(
      'Firebase is not configured. Open firebase.js and follow the setup instructions.'
    );
  }

  // Sanitize file name — replace spaces and special chars
  const safeName  = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const timestamp = Date.now();
  const filePath  = `memories/${timestamp}_${safeName}`;
  const storageRef = storage.ref(filePath);

  // Upload the image to Firebase Storage
  const uploadTask = storageRef.put(file, { contentType: file.type });

  await new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        // Optional: track upload progress
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        const btn = document.querySelector('.btn-text');
        if (btn) btn.textContent = `Uploading… ${pct}%`;
      },
      error => reject(error),   // Upload failed
      resolve                   // Upload complete
    );
  });

  // Get the public download URL from Storage
  const imageUrl = await storageRef.getDownloadURL();

  // Save the memory document to Firestore
  await db.collection('memories').add({
    imageUrl,
    title:     title.trim()  || 'Untitled',
    date:      date           || '',
    note:      note.trim()   || '',
    // Server-side timestamp (accurate even if client clock is wrong)
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return imageUrl;
};

/**
 * loadMemories — Fetch all memories from Firestore and render them
 *
 * Called automatically on page load (if Firebase is configured)
 * and again after a new memory is saved.
 */
window.loadMemories = async function loadMemories() {
  if (!isFirebaseConfigured || !db) return;

  const feed = document.getElementById('memories-feed');
  if (!feed) return;

  try {
    // Fetch memories ordered newest-first
    const snapshot = await db
      .collection('memories')
      .orderBy('createdAt', 'desc')
      .get();

    feed.innerHTML = ''; // Clear existing cards

    if (snapshot.empty) {
      feed.innerHTML = '<p class="no-memories">No shared memories yet — add the first one below! 💜</p>';
      return;
    }

    snapshot.forEach(doc => {
      renderMemoryCard(doc.data(), feed);
    });
  } catch (err) {
    console.warn('Could not load memories from Firestore:', err.message);
    feed.innerHTML = '<p class="no-memories">Could not load memories. Check your Firebase connection.</p>';
  }
};

/**
 * renderMemoryCard — Create and append a memory card to the feed
 *
 * @param {Object}      memory    — Memory data from Firestore
 * @param {HTMLElement} container — The feed container element
 */
function renderMemoryCard(memory, container) {
  const card = document.createElement('article');
  card.className = 'memory-feed-card';

  // Format date nicely if present
  let formattedDate = '';
  if (memory.date) {
    try {
      formattedDate = new Date(memory.date + 'T00:00:00').toLocaleDateString('en-US', {
        year:  'numeric',
        month: 'long',
        day:   'numeric',
      });
    } catch (_) {
      formattedDate = memory.date;
    }
  }

  card.innerHTML = `
    <div class="memory-feed-photo">
      <img
        src="${escapeHtml(memory.imageUrl)}"
        alt="${escapeHtml(memory.title)}"
        loading="lazy"
      >
    </div>
    <div class="memory-feed-info">
      <h4 class="memory-feed-title">${escapeHtml(memory.title)}</h4>
      ${formattedDate ? `<p class="memory-feed-date">${escapeHtml(formattedDate)}</p>` : ''}
      ${memory.note   ? `<p class="memory-feed-note">${escapeHtml(memory.note)}</p>`   : ''}
    </div>
  `;

  container.appendChild(card);
}

/**
 * escapeHtml — Prevent XSS when inserting dynamic content into HTML
 *
 * @param {string} str — Raw string from user/database
 * @returns {string}    — HTML-safe string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
