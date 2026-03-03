/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  LABB v5 — app.js                                           ║
 * ║  Firebase Compat SDK v9.23.0 (NO ES modules)                ║
 * ║                                                             ║
 * ║  MODULE MAP                                                 ║
 * ║  ─────────────────────────────────────────────────────────  ║
 * ║  §0  FIREBASE CONFIG  ← paste your keys here               ║
 * ║  §1  FIREBASE INIT    ← synchronous SDK bootstrap          ║
 * ║  §2  GLOBAL STATE     ← single source of truth             ║
 * ║  §3  GLOBAL SETTINGS  ← Firestore sync for all settings    ║
 * ║  §4  UI UTILITIES     ← toast, modal, nav, particles       ║
 * ║  §5  AUTH             ← sign-in, register, guest, signout  ║
 * ║  §6  USER DATA        ← Firestore CRUD, addCoins, deduct   ║
 * ║  §7  ADS MODULE       ← showVideoAd() with AdMob hook      ║
 * ║  §8  DAILY STREAK     ← Mon-Sun real-date + ad-gate        ║
 * ║  §9  PAGES            ← Home, Games, Shop, Earn, Profile   ║
 * ║  §10 SHOP             ← user buy flow                      ║
 * ║  §11 EARN             ← video ads, tasks, referral         ║
 * ║  §12 ADMIN            ← hardcoded email guard              ║
 * ║  §13 GAMES (10 total) ← all game logic                     ║
 * ║  §14 BOOT             ← app entry point                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   §0  FIREBASE CONFIG
   ▶ THIS IS THE ONLY PLACE YOU NEED TO CHANGE FIREBASE KEYS.
   ▶ Replace the values below with your own Firebase project config.
   ▶ Find them in: Firebase Console → Project Settings → Your apps
══════════════════════════════════════════════════════════════ */
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA9bSbE7ltn7PzhWklmD8W6z-TZ3gfQtqM",
  authDomain:        "labb-b3cb1.firebaseapp.com",
  projectId:         "labb-b3cb1",
  storageBucket:     "labb-b3cb1.firebasestorage.app",
  messagingSenderId: "97117319309",
  appId:             "1:97117319309:web:1fdad90dc53bfa9f59f2c4",
  measurementId:     "G-GHWZ7HSN01"
};

/* ══════════════════════════════════════════════════════════════
   §0b  ADMIN ACCESS — hardcoded email
   Only this exact email gets the Admin tab and all admin powers.
══════════════════════════════════════════════════════════════ */
var ADMIN_EMAIL = "yannaing.yannaingynt@gmail.com";

/* ══════════════════════════════════════════════════════════════
   §1  FIREBASE INIT
   Runs synchronously immediately when app.js is parsed.
   window.AUTH, window.DB, window.FSV are guaranteed to exist
   before any other function in this file is called.
   This is what prevents "firebase is not defined" errors.
══════════════════════════════════════════════════════════════ */
(function FIREBASE_INIT() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    window.AUTH = firebase.auth();
    window.DB   = firebase.firestore();
    window.FSV  = firebase.firestore.FieldValue;
    window.FB   = true;
    console.log('[LABB] Firebase 9.23.0 compat — initialized OK');
  } catch (e) {
    window.FB = false;
    console.error('[LABB] Firebase init FAILED:', e.message);
  }
}());

/* ══════════════════════════════════════════════════════════════
   §2  GLOBAL STATE
══════════════════════════════════════════════════════════════ */
var S = {
  user:       null,     // Firestore user document (live local copy)
  uid:        null,     // Firebase Auth UID
  email:      null,     // Firebase Auth email
  isGuest:    false,
  isAdmin:    false,
  lang:       'en',
  tab:        'home',
  authDone:   false,    // prevents double-fire from onAuthStateChanged
  shopItems:  [],
  settings:   null,     // globalSettings document from Firestore
  settingsUnsub: null,  // real-time listener unsubscribe fn

  // scratch-pad for admin edit
  editUID:    '',
  editName:   '',
  buyItemId:  null,

  // loading gate: app launches when all 3 are true
  loaded: { auth: false, settings: false, shop: false },
};

/* ══════════════════════════════════════════════════════════════
   §3  GLOBAL SETTINGS MODULE
   Fetches & live-syncs the `globalSettings` Firestore document.
   All game toggles, rewards, leaderboard prizes, purchase limits
   are stored here and applied throughout the app.
══════════════════════════════════════════════════════════════ */
var Settings = (function () {

  // DEFAULT VALUES — used if Firestore doc doesn't exist yet
  var DEFAULTS = {
    adsEnabled: true,
    adRewards: { short: 25, long: 50, full: 100 },
    games: {
      wheel:    { enabled: true,  reward: 100 },
      scratch:  { enabled: true,  reward: 75  },
      math:     { enabled: true,  reward: 40  },
      dice:     { enabled: true,  reward: 50  },
      slots:    { enabled: true,  reward: 120 },
      cardflip: { enabled: true,  reward: 60  },
      numguess: { enabled: true,  reward: 80  },
      rps:      { enabled: true,  reward: 30  },
      wordscram:{ enabled: true,  reward: 45  },
      cointoss: { enabled: true,  reward: 25  },
    },
    leaderboardPrizes: { first: 500, second: 300, third: 150 },
    dailyBuyLimit: 5,
  };

  function get(path) {
    // path e.g. 'games.wheel.reward' or 'adsEnabled'
    var parts = path.split('.');
    var src = (S.settings) ? S.settings : DEFAULTS;
    var val = src;
    for (var i = 0; i < parts.length; i++) {
      val = val ? val[parts[i]] : undefined;
    }
    if (val === undefined) {
      // fall back to defaults
      val = DEFAULTS;
      for (var j = 0; j < parts.length; j++) val = val ? val[parts[j]] : undefined;
    }
    return val;
  }

  function load() {
    if (!window.FB || !window.DB) {
      S.settings = DEFAULTS;
      _markLoaded();
      return;
    }
    UI.setLoad('Loading settings...', 55);
    // Real-time listener — updates live whenever admin saves
    S.settingsUnsub = window.DB.collection('meta').doc('globalSettings')
      .onSnapshot(function (snap) {
        if (snap.exists) {
          S.settings = snap.data();
        } else {
          // First run: write defaults to Firestore
          S.settings = JSON.parse(JSON.stringify(DEFAULTS));
          if (S.isAdmin) {
            window.DB.collection('meta').doc('globalSettings').set(S.settings).catch(function () {});
          }
        }
        _markLoaded();
        // If already launched, re-render current page so game toggles apply
        if (S.loaded.auth && S.loaded.shop) Pages.render(S.tab);
      }, function () {
        S.settings = DEFAULTS;
        _markLoaded();
      });
  }

  function _markLoaded() {
    if (!S.loaded.settings) {
      S.loaded.settings = true;
      Boot.tryLaunch();
    }
  }

  function gameEnabled(id) { return get('games.' + id + '.enabled') !== false; }
  function gameReward(id)   { return get('games.' + id + '.reward') || 25; }

  return { get, load, gameEnabled, gameReward, DEFAULTS };
}());

/* ══════════════════════════════════════════════════════════════
   §4  UI UTILITIES
══════════════════════════════════════════════════════════════ */
var UI = (function () {

  // ── show/hide ──
  function show(id) { var e = document.getElementById(id); if (e) e.classList.remove('hidden'); }
  function hide(id) { var e = document.getElementById(id); if (e) e.classList.add('hidden'); }

  // ── modals ──
  function openModal(id) { show(id); }
  function closeModal(id) { hide(id); }
  function oclose(e, id) { if (e.target === e.currentTarget) closeModal(id); }

  // ── loading bar ──
  function setLoad(msg, pct) {
    var s = document.getElementById('ld-status'), b = document.getElementById('ld-bar');
    if (s) s.textContent = msg || '';
    if (b && pct !== undefined) b.style.width = pct + '%';
  }

  // ── toast ──
  var _tt = null;
  function toast(msg, type) {
    var el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.className = 'show ' + (type || 'ok');
    clearTimeout(_tt); _tt = setTimeout(function () { el.className = ''; }, 2900);
  }

  // ── coin pop ──
  function coinPop(n) {
    var el = document.createElement('div'); el.className = 'coin-pop';
    el.textContent = '+' + n + ' 🪙';
    el.style.cssText = 'left:' + (window.innerWidth / 2 - 32) + 'px;top:' + (window.innerHeight / 2 - 20) + 'px';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
  }

  // ── nav ──
  function nav(tab) {
    ['home','games','shop','earn','profile','admin'].forEach(function (t) {
      hide('pg-' + t);
      var b = document.getElementById('bn-' + t); if (b) b.classList.remove('active');
    });
    show('pg-' + tab);
    var btn = document.getElementById('bn-' + tab); if (btn) btn.classList.add('active');
    S.tab = tab;
    Pages.render(tab);
  }

  // ── language cycle ──
  var LANGS = ['en','my','zh'];
  function cycleLang() {
    var i = LANGS.indexOf(S.lang); S.lang = LANGS[(i + 1) % LANGS.length];
    var b = document.getElementById('lang-toggle');
    if (b) b.textContent = S.lang.toUpperCase();
    Pages.render(S.tab);
  }

  // ── header coins ──
  function refreshCoins() {
    var e = document.getElementById('hdr-coins');
    if (e && S.user) e.textContent = (S.user.coins || 0).toLocaleString();
  }

  // ── particles ──
  function initParticles() {
    var cv = document.getElementById('particle-canvas'); if (!cv) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    var ctx = cv.getContext('2d');
    var cols = ['#F0A500','#00D4C8','#7C5CFC','#40C8F0','#fff'];
    var pts = [];
    for (var i = 0; i < 28; i++) {
      pts.push({
        x: Math.random() * cv.width, y: Math.random() * cv.height,
        r: Math.random() * 1.4 + 0.3,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        c: cols[i % cols.length],
        a: Math.random() * 0.6 + 0.1, da: (Math.random() * 0.008 + 0.003) * (Math.random() < 0.5 ? 1 : -1),
      });
    }
    function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      pts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.a += p.da;
        if (p.a > 0.7 || p.a < 0.08) p.da *= -1;
        if (p.x < 0) p.x = cv.width; if (p.x > cv.width)  p.x = 0;
        if (p.y < 0) p.y = cv.height; if (p.y > cv.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1;
      });
      requestAnimationFrame(frame);
    }
    frame();
    window.addEventListener('resize', function () { cv.width = window.innerWidth; cv.height = window.innerHeight; });
  }

  return { show, hide, openModal, closeModal, oclose, setLoad, toast, coinPop, nav, cycleLang, refreshCoins, initParticles };
}());

/* ══════════════════════════════════════════════════════════════
   §5  AUTH MODULE
══════════════════════════════════════════════════════════════ */
var Auth = (function () {

  function tab(which) {
    ['in','up'].forEach(function (x) {
      document.getElementById('tsw-' + x).classList.remove('active');
      UI.hide('panel-' + x);
    });
    document.getElementById('tsw-' + which).classList.add('active');
    UI.show('panel-' + which);
    _err('');
  }

  function _err(msg) { var e = document.getElementById('auth-err'); if (e) e.textContent = msg; }

  function _clean(msg) {
    if (!msg) return 'An error occurred';
    msg = msg.replace('Firebase: ','').replace(/\(auth\/[^)]+\)/g,'').trim();
    if (/user-not-found|wrong-password|invalid-credential/.test(msg)) return 'Wrong email or password';
    if (/email-already/.test(msg)) return 'Email already registered';
    if (/weak-password/.test(msg))  return 'Password must be 6+ chars';
    if (/network/.test(msg))        return 'Network error — check connection';
    return msg;
  }

  function signIn() {
    var em = document.getElementById('si-email').value.trim();
    var pw = document.getElementById('si-pass').value;
    if (!em || !pw) { _err('Please fill all fields'); return; }
    if (!window.FB || !window.AUTH) { _err('Firebase unavailable — use Guest mode'); return; }
    _err('');
    window.AUTH.signInWithEmailAndPassword(em, pw).catch(function (e) { _err(_clean(e.message)); });
  }

  function signUp() {
    var nm = document.getElementById('su-name').value.trim();
    var em = document.getElementById('su-email').value.trim();
    var pw = document.getElementById('su-pass').value;
    if (!nm || !em || !pw) { _err('Please fill all fields'); return; }
    if (pw.length < 6) { _err('Password must be 6+ chars'); return; }
    if (!window.FB || !window.AUTH) { _err('Firebase unavailable — use Guest mode'); return; }
    _err('');
    window.AUTH.createUserWithEmailAndPassword(em, pw)
      .then(function (cred) {
        cred.user.updateProfile({ displayName: nm }).catch(function () {});
        Data.createUser(cred.user.uid, nm, em);
      })
      .catch(function (e) { _err(_clean(e.message)); });
  }

  function guest() {
    S.isGuest = true; S.isAdmin = false;
    S.uid = 'guest_' + Math.random().toString(36).slice(2, 8);
    S.email = '';
    S.user = _guestDoc();
    Boot.launch();
  }

  function _guestDoc() {
    return {
      uid: S.uid, name: 'Guest', email: '', coins: 100, level: 1, xp: 0,
      dailyStreak: 0, lastCheckin: '', streakHistory: {},
      gamesPlayed: 0, totalEarned: 100, role: 'user',
      dailyPurchases: {}, coinHistory: [{ desc:'Welcome Bonus', amt:100, date:_dl() }],
    };
  }

  /**
   * initListener — THE CORE FIX for "firebase is not defined"
   * window.AUTH was set synchronously in §1 FIREBASE_INIT before
   * this function can ever be called, so the error cannot occur.
   * The 400ms boot delay further ensures SDK scripts have fully parsed.
   */
  function initListener() {
    if (!window.FB || !window.AUTH) {
      UI.setLoad('Offline — use Guest mode', 80);
      setTimeout(function () {
        S.loaded.auth = true;
        UI.hide('screen-loading');
        UI.show('screen-auth');
      }, 800);
      return;
    }

    // Hard failsafe: never hang on loading screen > 9s
    var failsafe = setTimeout(function () {
      if (!S.authDone) {
        S.authDone = true; S.loaded.auth = true;
        UI.hide('screen-loading'); UI.show('screen-auth');
      }
    }, 9000);

    window.AUTH.onAuthStateChanged(function (fu) {
      if (S.authDone) return; // guard against double-fire
      S.authDone = true;
      clearTimeout(failsafe);

      if (fu) {
        S.uid   = fu.uid;
        S.email = fu.email || '';
        S.isGuest = false;
        S.isAdmin = (S.email === ADMIN_EMAIL);
        UI.setLoad('Loading profile...', 65);

        Data.getUser(fu.uid, function (doc) {
          if (!doc) doc = Data.createUser(fu.uid, fu.displayName || 'Player', fu.email || '');
          S.user = doc; S.user.uid = fu.uid;
          S.loaded.auth = true;
          Boot.tryLaunch();
        });
      } else {
        S.loaded.auth = true;
        UI.hide('screen-loading');
        UI.show('screen-auth');
      }
    });
  }

  function signOut() {
    if (S.settingsUnsub) { S.settingsUnsub(); S.settingsUnsub = null; }
    if (!S.isGuest && window.AUTH) window.AUTH.signOut().catch(function () {});
    S.user = null; S.uid = null; S.email = null;
    S.isGuest = false; S.isAdmin = false; S.authDone = false;
    S.loaded = { auth: false, settings: false, shop: false };
    UI.hide('screen-app'); UI.show('screen-auth');
  }

  return { tab, signIn, signUp, guest, initListener, signOut };
}());

/* ══════════════════════════════════════════════════════════════
   §6  USER DATA
══════════════════════════════════════════════════════════════ */
var Data = (function () {

  function createUser(uid, name, email) {
    var doc = {
      uid: uid, name: name || 'Player', email: email || '',
      coins: 100, level: 1, xp: 0,
      dailyStreak: 0, lastCheckin: '', streakHistory: {},
      gamesPlayed: 0, totalEarned: 100,
      role: email === ADMIN_EMAIL ? 'admin' : 'user',
      dailyPurchases: {},
      coinHistory: [{ desc: 'Welcome Bonus', amt: 100, date: _dl() }],
    };
    if (window.FB && window.DB) {
      window.DB.collection('users').doc(uid).set(doc).catch(function () {});
    }
    return doc;
  }

  function getUser(uid, cb) {
    if (!window.FB || !window.DB) { cb(null); return; }
    window.DB.collection('users').doc(uid).get()
      .then(function (snap) { cb(snap.exists ? Object.assign({ uid: uid }, snap.data()) : null); })
      .catch(function () { cb(null); });
  }

  function save(fields) {
    if (S.isGuest || !window.FB || !window.DB || !S.uid) return;
    window.DB.collection('users').doc(S.uid).update(fields).catch(function () {});
  }

  function addCoins(amount, desc) {
    var u = S.user; if (!u) return;
    u.coins = (u.coins || 0) + amount;
    u.totalEarned = (u.totalEarned || 0) + amount;
    u.gamesPlayed = (u.gamesPlayed || 0) + 1;
    var xp = Math.floor(amount * 1.5);
    u.xp = (u.xp || 0) + xp;
    var newLv = Math.floor(u.xp / 500) + 1;
    if (newLv > (u.level || 1)) { u.level = newLv; UI.toast('🎉 Level Up! LV ' + newLv, 'warn'); }
    u.coinHistory = [{ desc: desc, amt: amount, date: _dl() }].concat(u.coinHistory || []).slice(0, 60);
    UI.refreshCoins(); UI.coinPop(amount);
    if (!S.isGuest && window.FB && window.DB && S.uid) {
      window.DB.collection('users').doc(S.uid).update({
        coins: window.FSV.increment(amount),
        totalEarned: window.FSV.increment(amount),
        gamesPlayed: window.FSV.increment(1),
        xp: window.FSV.increment(xp),
        level: u.level,
        coinHistory: u.coinHistory,
      }).catch(function () {});
    }
  }

  function deductCoins(amount, desc) {
    var u = S.user; if (!u || (u.coins || 0) < amount) return false;
    u.coins -= amount;
    u.coinHistory = [{ desc: '−' + desc, amt: -amount, date: _dl() }].concat(u.coinHistory || []).slice(0, 60);
    UI.refreshCoins();
    if (!S.isGuest && window.FB && window.DB && S.uid) {
      window.DB.collection('users').doc(S.uid).update({
        coins: window.FSV.increment(-amount),
        coinHistory: u.coinHistory,
      }).catch(function () {});
    }
    return true;
  }

  return { createUser, getUser, save, addCoins, deductCoins };
}());

/* ══════════════════════════════════════════════════════════════
   §7  ADS MODULE
   showVideoAd() is the single integration point for any real
   ad network (AdMob, Unity Ads, AppLovin, etc.).
   Replace the simulate() body with the real SDK call.
   The callback receives { completed: bool, reward: number }.
══════════════════════════════════════════════════════════════ */
var Ads = (function () {

  /**
   * showVideoAd(options, callback)
   * options: { duration: seconds, reward: coins, label: string }
   * callback: function(result) where result = { completed: true/false, reward: number }
   *
   * TO INTEGRATE REAL AD NETWORK:
   *   Replace the simulate() call below with your SDK call.
   *   e.g. for AdMob (Capacitor):
   *     AdMob.prepareRewardVideoAd({ adId: 'ca-app-pub-xxx/yyy' })
   *       .then(() => AdMob.showRewardVideoAd())
   *       .then((reward) => callback({ completed: true, reward: options.reward }))
   *       .catch(() => callback({ completed: false, reward: 0 }));
   *
   *   e.g. for Unity Ads:
   *     UnityAds.show('rewardedVideo', (result) => {
   *       callback({ completed: result === 'completed', reward: options.reward });
   *     });
   */
  function showVideoAd(options, callback) {
    var adsEnabled = Settings.get('adsEnabled');
    if (!adsEnabled) {
      UI.toast('Ads are currently disabled', 'warn');
      callback({ completed: false, reward: 0 });
      return;
    }
    // ── SIMULATE (replace with real ad SDK call) ──
    _simulate(options, callback);
  }

  function _simulate(options, callback) {
    var dur = options.duration || 10;
    var reward = options.reward || 25;

    // Open the ad modal UI
    var lbl = document.getElementById('ad-label');
    var prog = document.getElementById('ad-prog');
    var timer = document.getElementById('ad-timer');
    var claimBtn = document.getElementById('ad-claim');
    var coinsLbl = document.getElementById('ad-coins-lbl');
    if (lbl)  lbl.textContent  = options.label || 'Watch the full ad to earn coins!';
    if (prog) prog.style.width = '0%';
    if (timer)timer.textContent = dur + 's remaining';
    if (claimBtn) { claimBtn.disabled = true; claimBtn.style.opacity = '.4'; }
    if (coinsLbl) coinsLbl.textContent = reward;
    UI.openModal('modal-ad');

    var elapsed = 0;
    var iv = setInterval(function () {
      elapsed++;
      if (prog)  prog.style.width = Math.min(elapsed / dur * 100, 100) + '%';
      if (timer) timer.textContent = Math.max(dur - elapsed, 0) + 's remaining';
      if (elapsed >= dur) {
        clearInterval(iv);
        if (timer) timer.textContent = '✓ Ad complete! Claim your reward.';
        if (claimBtn) { claimBtn.disabled = false; claimBtn.style.opacity = '1'; }
        // Store callback so claim button can fire it
        Ads._pendingCb = callback;
        Ads._pendingReward = reward;
      }
    }, 1000);
    Ads._pendingCb = null;
    Ads._pendingReward = 0;
    Ads._iv = iv;
  }

  function claim() {
    clearInterval(Ads._iv);
    UI.closeModal('modal-ad');
    if (typeof Ads._pendingCb === 'function') {
      Ads._pendingCb({ completed: true, reward: Ads._pendingReward });
      Ads._pendingCb = null;
    }
  }

  function skip() {
    clearInterval(Ads._iv);
    UI.closeModal('modal-ad');
    if (typeof Ads._pendingCb === 'function') {
      Ads._pendingCb({ completed: false, reward: 0 });
      Ads._pendingCb = null;
    }
    UI.toast('Ad skipped — no reward', 'warn');
  }

  return { showVideoAd, claim, skip };
}());

/* ══════════════════════════════════════════════════════════════
   §8  DAILY STREAK — Mon-Sun real-date system
   Rules:
   - Shows Mon/Tue/Wed/Thu/Fri/Sat/Sun dots based on REAL calendar
   - Each dot represents the actual weekday this week
   - Checking in marks today's dot as DONE
   - Missing yesterday = dot marked as MISSED (not just locked)
   - 1-day recovery: if you missed yesterday, you can watch an ad
     to recover the streak (ad-gate)
   - Streak resets if you miss 2+ consecutive days
   - Rewards escalate: base reward × streak_multiplier
══════════════════════════════════════════════════════════════ */
var Streak = (function () {

  var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var BASE_REWARD = 50;
  // Multipliers for days 1–7
  var MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 6];

  function _todayKey()     { return _dateKey(new Date()); }
  function _yesterdayKey() { return _dateKey(new Date(Date.now() - 86400000)); }
  function _dateKey(d)     { return d.getFullYear() + '-' + _p(d.getMonth()+1) + '-' + _p(d.getDate()); }
  function _p(n)           { return n < 10 ? '0' + n : '' + n; }
  function _weekStart()    {
    // Monday as week start
    var d = new Date(); var day = d.getDay(); // 0=Sun
    var diff = (day === 0) ? -6 : 1 - day;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  }

  function getWeekDots() {
    var u = S.user; if (!u) return [];
    var hist = u.streakHistory || {};
    var today = _todayKey();
    var ws = _weekStart();
    var dots = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      var key = _dateKey(d);
      var dayName = DAY_NAMES[d.getDay()];
      var isPast   = key < today;
      var isToday  = key === today;
      var state;
      if      (hist[key] === 'done')    state = 'done';
      else if (hist[key] === 'missed')  state = 'missed';
      else if (isToday)                  state = 'today';
      else if (isPast)                   state = 'missed';
      else                               state = 'locked';
      dots.push({ key: key, day: dayName, state: state, isToday: isToday });
    }
    return dots;
  }

  function canCheckIn() {
    var u = S.user; if (!u) return false;
    var hist = u.streakHistory || {};
    return hist[_todayKey()] !== 'done';
  }

  function canRecover() {
    // Can recover if yesterday was missed and today not yet done
    var u = S.user; if (!u) return false;
    var hist = u.streakHistory || {};
    var yk = _yesterdayKey();
    var tk = _todayKey();
    return hist[yk] === 'missed' && hist[tk] !== 'done';
  }

  function doCheckIn(recovered) {
    var u = S.user; if (!u || !canCheckIn()) return;
    var tk = _todayKey();
    var streak = u.dailyStreak || 0;

    // Determine new streak count
    var hist = u.streakHistory || {};
    var yk = _yesterdayKey();
    if (hist[yk] === 'done' || recovered) {
      streak = streak + 1; // continuing or recovered
    } else {
      streak = 1; // fresh start
    }
    streak = Math.min(streak, 7);

    // Calculate reward
    var mult = MULTIPLIERS[Math.min(streak - 1, 6)];
    var reward = Math.round(BASE_REWARD * mult);

    hist[tk] = 'done';
    u.streakHistory = hist;
    u.dailyStreak = streak;
    u.lastCheckin = tk;

    Data.addCoins(reward, 'Day ' + streak + ' Check-In' + (recovered ? ' (Recovered)' : ''));
    UI.toast('🔥 Day ' + streak + '! +' + reward + ' 🪙');
    Data.save({ streakHistory: hist, dailyStreak: streak, lastCheckin: tk });
    Pages.render('home');
  }

  function checkInWithAd() {
    // Ad-gate for recovery
    var reward = Settings.get('adRewards.short');
    Ads.showVideoAd({ duration: 15, reward: reward, label: 'Watch ad to recover your streak!' },
      function (res) {
        if (res.completed) {
          doCheckIn(true);
        } else {
          UI.toast('Watch the full ad to recover', 'warn');
        }
      }
    );
  }

  // Call daily to mark missed days
  function markMissedDays() {
    var u = S.user; if (!u) return;
    var hist = u.streakHistory || {};
    var ws = _weekStart();
    var today = _todayKey();
    var changed = false;
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      var key = _dateKey(d);
      if (key < today && !hist[key]) { hist[key] = 'missed'; changed = true; }
    }
    if (changed) { u.streakHistory = hist; Data.save({ streakHistory: hist }); }
  }

  return { getWeekDots, canCheckIn, canRecover, doCheckIn, checkInWithAd, markMissedDays };
}());

/* ══════════════════════════════════════════════════════════════
   §9  PAGES MODULE
══════════════════════════════════════════════════════════════ */
var Pages = (function () {

  function render(tab) {
    try {
      ({
        home:    renderHome,
        games:   renderGames,
        shop:    Shop.render,
        earn:    Earn.render,
        profile: renderProfile,
        admin:   Admin.render,
      }[tab] || renderHome)();
    } catch (e) { console.warn('Pages.render error:', tab, e); }
  }

  /* ── HOME ── */
  function renderHome() {
    var el = document.getElementById('pg-home'); if (!el || !S.user) return;
    var u = S.user;
    Streak.markMissedDays();
    var xpIn = (u.xp || 0) % 500;
    var dots = Streak.getWeekDots();
    var dotsHtml = dots.map(function (d) {
      return '<div class="sd ' + d.state + '">' +
        '<span class="sd-day">' + d.day + '</span>' +
        (d.state === 'done' ? '✓' : d.state === 'missed' ? '✕' : d.isToday ? '●' : '○') +
      '</div>';
    }).join('');

    var ciBtn = '', recovered = Streak.canRecover(), canCI = Streak.canCheckIn();
    if (!canCI) {
      ciBtn = '<button class="btn btn-ghost bfull" disabled>✓ Checked in today</button>';
    } else if (recovered) {
      ciBtn = '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button class="btn btn-amber bfull btn-pulse" onclick="Streak.doCheckIn(false)">🔥 Check In (+' + Math.round(50 * 1) + ' 🪙)</button>' +
        '<button class="btn btn-ghost bfull" onclick="Streak.checkInWithAd()">📺 Recover Streak with Ad</button>' +
      '</div>';
    } else {
      var streak = (u.dailyStreak || 0) + 1;
      var MULT = [1,1.5,2,2.5,3,4,6];
      var rw = Math.round(50 * (MULT[Math.min(streak-1,6)] || 1));
      ciBtn = '<button class="btn btn-teal bfull btn-pulse" onclick="Streak.doCheckIn(false)">🔥 Check In (+' + rw + ' 🪙)</button>';
    }

    el.innerHTML =
      // Hero
      '<div class="card card-amber mb14" style="padding:20px;background:linear-gradient(135deg,rgba(240,165,0,.07),rgba(0,212,200,.04))">' +
        '<div style="display:flex;align-items:center;gap:13px;margin-bottom:15px">' +
          '<div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,var(--violet),var(--cyan));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0">' + (u.name||'G').charAt(0).toUpperCase() + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;color:var(--t2)">' + _t('welcome') + '</div>' +
            '<div style="font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (u.name||_t('guest')) + '</div>' +
            '<div style="margin-top:4px"><span class="lv-chip">LV '+(u.level||1)+'</span>' +
              (S.isAdmin ? '<span class="badge bg-rose" style="margin-left:6px">ADMIN</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div class="mono" style="font-size:26px;font-weight:700;color:var(--amber);line-height:1">' + (u.coins||0).toLocaleString() + '</div>' +
            '<div style="font-size:10px;color:var(--t2);letter-spacing:1px">COINS</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">' +
          '<span style="color:var(--t2);text-transform:uppercase;letter-spacing:.5px">XP Progress</span>' +
          '<span class="mono" style="color:var(--t1);font-size:10px">' + xpIn + '/500</span>' +
        '</div>' +
        '<div class="prog-track"><div class="prog-fill" style="width:' + Math.round(xpIn/500*100) + '%"></div></div>' +
      '</div>' +
      // Streak
      '<div class="sec">🔥 Daily Streak</div>' +
      '<div class="card mb14" style="padding:16px">' +
        '<div style="font-size:12px;color:var(--t1);text-align:center;margin-bottom:10px">Streak: <strong>' + (u.dailyStreak||0) + ' day' + ((u.dailyStreak||0)===1?'':'s') + '</strong></div>' +
        '<div class="streak-row">' + dotsHtml + '</div>' +
        ciBtn +
      '</div>' +
      // Quick play
      '<div class="sec">⚡ Quick Play</div>' +
      '<div class="games-grid mb14">' +
        '<div class="gtile" style="--ta:var(--violet)" onclick="Games.open(\'wheel\')">' + (Settings.gameEnabled('wheel') ? '' : '<span class="gtile-off"><span class="badge bg-rose">OFF</span></span>') + '<span class="gico">🎡</span><div class="gnm">WHEEL SPIN</div><div class="grw">+'+Settings.gameReward('wheel')+' 🪙</div></div>' +
        '<div class="gtile" style="--ta:var(--amber)" onclick="Games.open(\'scratch\')">' + (Settings.gameEnabled('scratch') ? '' : '<span class="gtile-off"><span class="badge bg-rose">OFF</span></span>') + '<span class="gico">🎫</span><div class="gnm">LUCKY SCRATCH</div><div class="grw">+'+Settings.gameReward('scratch')+' 🪙</div></div>' +
      '</div>' +
      // Stats
      '<div class="sec">📊 Stats</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:13px">' +
        _sMini('🎮','Games', u.gamesPlayed||0) + _sMini('💰','Earned',(u.totalEarned||0).toLocaleString()) + _sMini('🔥','Streak',u.dailyStreak||0) +
      '</div>' +
      // Leaderboard
      '<div class="sec">🏆 Leaderboard</div>' +
      '<div class="card mb14" id="lb-box" style="padding:14px"><div class="tmut tc" style="padding:8px;font-size:13px">Loading...</div></div>' +
      '<div class="gap"></div>';

    _loadLB();
  }

  function _sMini(ic, lb, v) {
    return '<div class="stat-mini"><div class="sm-ico">'+ic+'</div><span class="sm-val">'+v+'</span><div class="sm-lbl">'+lb+'</div></div>';
  }

  function _loadLB() {
    var el = document.getElementById('lb-box'); if (!el) return;
    if (!window.FB || !window.DB) { el.innerHTML = '<div class="tmut tc" style="padding:8px;font-size:12px">' + (S.isGuest ? 'Sign in to see leaderboard' : 'Firebase offline') + '</div>'; return; }
    var prizes = Settings.get('leaderboardPrizes') || { first:500, second:300, third:150 };
    var prizeArr = [prizes.first, prizes.second, prizes.third];
    window.DB.collection('users').orderBy('coins','desc').limit(5).get()
      .then(function (snap) {
        var el = document.getElementById('lb-box'); if (!el) return;
        var medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
        el.innerHTML = snap.docs.map(function (doc, i) {
          var u = doc.data(), isMe = doc.id === S.uid;
          var prizeHtml = i < 3 ? '<span class="lb-prize-badge">+' + (prizeArr[i]||0) + '🪙/wk</span>' : '';
          return '<div class="lb-prize-row' + (isMe ? '" style="background:rgba(0,212,200,.05);border-radius:8px;padding:10px 8px;margin:-2px -4px' : '') + '">' +
            '<span class="lb-medal">'+medals[i]+'</span>' +
            '<span class="lb-name">'+(u.name||'Player')+'</span>' +
            prizeHtml +
            '<span class="lb-coins mono">'+(u.coins||0).toLocaleString()+'</span>' +
          '</div>';
        }).join('') || '<div class="tmut tc" style="padding:10px">No players yet</div>';
      }).catch(function () {
        var el = document.getElementById('lb-box');
        if (el) el.innerHTML = '<div class="tmut tc" style="padding:8px;font-size:12px">Could not load</div>';
      });
  }

  /* ── GAMES ── */
  function renderGames() {
    var el = document.getElementById('pg-games'); if (!el) return;
    var LIST = [
      { id:'wheel',     ico:'🎡', nm:'Wheel Spin',          ta:'var(--violet)' },
      { id:'scratch',   ico:'🎫', nm:'Lucky Scratch',       ta:'var(--amber)'  },
      { id:'math',      ico:'🧮', nm:'Math Quiz',            ta:'var(--sky)'    },
      { id:'dice',      ico:'🎲', nm:'Dice Roll',             ta:'var(--cyan)'   },
      { id:'slots',     ico:'🎰', nm:'Slot Machine',         ta:'var(--rose)'   },
      { id:'cardflip',  ico:'🃏', nm:'Card Flip',             ta:'var(--amber)'  },
      { id:'numguess',  ico:'🔢', nm:'Number Guess',         ta:'var(--sky)'    },
      { id:'rps',       ico:'✊', nm:'Rock Paper Scissors',  ta:'#EC4899'       },
      { id:'wordscram', ico:'🔤', nm:'Word Scramble',        ta:'var(--lime)'   },
      { id:'cointoss',  ico:'🪙', nm:'Coin Toss',             ta:'var(--amber)'  },
    ];
    el.innerHTML = '<div class="sec">🎮 All Games</div>' +
      '<div class="games-grid">' +
      LIST.map(function (g) {
        var on = Settings.gameEnabled(g.id);
        return '<div class="gtile' + (on ? '' : ' disabled-tile') + '" style="--ta:' + g.ta + '" onclick="' + (on ? 'Games.open(\'' + g.id + '\')' : 'UI.toast(\'This game is disabled\',\'warn\')') + '">' +
          (on ? '' : '<span class="gtile-off"><span class="badge bg-rose" style="font-size:8px">OFF</span></span>') +
          '<span class="gico">' + g.ico + '</span>' +
          '<div class="gnm">' + g.nm + '</div>' +
          '<div class="grw">+' + Settings.gameReward(g.id) + ' 🪙</div>' +
        '</div>';
      }).join('') + '</div><div class="gap"></div>';
  }

  /* ── PROFILE ── */
  var _ps = 'hist';
  function renderProfile() {
    var el = document.getElementById('pg-profile'); if (!el || !S.user) return;
    var u = S.user;
    var xpIn = (u.xp||0) % 500;
    el.innerHTML =
      '<div class="card mb14" style="padding:20px;text-align:center;background:linear-gradient(135deg,rgba(124,92,252,.08),rgba(0,212,200,.05))">' +
        '<div style="width:68px;height:68px;border-radius:20px;background:linear-gradient(135deg,var(--violet),var(--cyan));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 12px;box-shadow:0 0 30px rgba(124,92,252,.3)">' + (u.name||'G').charAt(0).toUpperCase() + '</div>' +
        '<div style="font-size:19px;font-weight:700;margin-bottom:3px">' + (u.name||_t('guest')) + '</div>' +
        '<div style="font-size:12px;color:var(--t1);margin-bottom:10px">' + (u.email||'Guest Account') + '</div>' +
        '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">' +
          '<span class="lv-chip">LV '+(u.level||1)+'</span>' +
          (S.isAdmin ? '<span class="badge bg-rose">ADMIN</span>' : '') +
          (S.isGuest ? '<span class="badge bg-violet">GUEST</span>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:13px">' +
        '<div class="card card-amber" style="padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">BALANCE</div><div class="mono" style="font-size:24px;color:var(--amber);font-weight:700">' + (u.coins||0).toLocaleString() + '</div></div>' +
        '<div class="card card-cyan"  style="padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">TOTAL EARNED</div><div class="mono" style="font-size:24px;color:var(--cyan);font-weight:700">' + (u.totalEarned||0).toLocaleString() + '</div></div>' +
      '</div>' +
      '<div class="card mb14" style="padding:14px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:7px;font-size:12px"><span style="font-weight:600;color:var(--t1)">Level '+(u.level||1)+' Progress</span><span class="mono" style="font-size:11px;color:var(--t2)">'+xpIn+'/500 XP</span></div>' +
        '<div class="prog-track"><div class="prog-fill" style="width:'+Math.round(xpIn/500*100)+'%"></div></div>' +
      '</div>' +
      '<div class="sub-tabs">' +
        '<button class="stab ' + (_ps==='hist'?'active':'') + '" onclick="Pages._psSub(\'hist\')">History</button>' +
        '<button class="stab ' + (_ps==='stats'?'active':'') + '" onclick="Pages._psSub(\'stats\')">Stats</button>' +
        '<button class="stab ' + (_ps==='set'?'active':'') + '"  onclick="Pages._psSub(\'set\')">Settings</button>' +
      '</div>' +
      '<div id="prof-body"></div><div class="gap"></div>';
    _renderProfSub(_ps);
  }

  function _psSub(s) { _ps = s; renderProfile(); }
  function _renderProfSub(s) {
    var el = document.getElementById('prof-body'); if (!el || !S.user) return;
    var u = S.user;
    if (s === 'hist') {
      var h = (u.coinHistory||[]).slice(0,25);
      el.innerHTML = '<div class="card" style="padding:14px">' +
        (h.length ? h.map(function (x) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bd)">' +
            '<div><div style="font-size:13px;font-weight:600">'+x.desc+'</div><div style="font-size:11px;color:var(--t2);margin-top:1px">'+x.date+'</div></div>' +
            '<div class="mono" style="font-size:13px;color:'+(x.amt<0?'var(--rose)':'var(--amber)')+';font-weight:700">'+(x.amt>0?'+':'')+x.amt+'</div>' +
          '</div>';
        }).join('') : '<div class="tmut tc" style="padding:20px">No history yet</div>') + '</div>';
    } else if (s === 'stats') {
      el.innerHTML = '<div class="card" style="padding:14px">' +
        [['🎮','Games Played',u.gamesPlayed||0],['💰','Total Earned',(u.totalEarned||0).toLocaleString()],
         ['🔥','Streak',u.dailyStreak||0],['⭐','Total XP',(u.xp||0).toLocaleString()],['🏆','Level',u.level||1]].map(function (r) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--bd)">' +
            '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">'+r[0]+'</span><span style="font-size:13px;font-weight:600">'+r[1]+'</span></div>' +
            '<span class="mono" style="font-size:14px;color:var(--amber);font-weight:700">'+r[2]+'</span>' +
          '</div>';
        }).join('') + '</div>';
    } else {
      el.innerHTML = '<div class="card" style="padding:14px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--bd);cursor:pointer" onclick="UI.cycleLang()">' +
          '<div><div style="font-size:13px;font-weight:700">Language</div><div style="font-size:11px;color:var(--t2)">EN / MY / ZH</div></div>' +
          '<span class="mono" style="color:var(--cyan);font-size:12px;font-weight:700">'+S.lang.toUpperCase()+'</span>' +
        '</div>' +
        '<div style="padding:11px 0;border-bottom:1px solid var(--bd)"><div style="font-size:13px;font-weight:700">App Version</div><div style="font-size:11px;color:var(--t2)">LABB v5 — Firebase 9.23.0 Compat</div></div>' +
        (S.isGuest ? '<div style="background:var(--violet-d);border:1px solid rgba(124,92,252,.2);border-radius:var(--r16);padding:13px;margin-top:12px;text-align:center"><div style="font-size:13px;font-weight:700;margin-bottom:4px">Playing as Guest</div><div style="font-size:12px;color:var(--t1);margin-bottom:12px">Register to save your progress</div><button class="btn btn-violet bfull" onclick="Auth.signOut()">Create Account</button></div>' : '') +
        '<button class="btn btn-rose bfull" style="margin-top:14px" onclick="Auth.signOut()">← Sign Out</button>' +
      '</div>';
    }
  }

  return { render, renderHome, renderGames, renderProfile, _psSub, _loadLB };
}());

/* ══════════════════════════════════════════════════════════════
   §10  SHOP MODULE — user buy flow
══════════════════════════════════════════════════════════════ */
var Shop = (function () {

  function render() {
    var el = document.getElementById('pg-shop'); if (!el) return;
    var items = S.shopItems.filter(function (i) { return i.status !== 'hidden'; });
    if (!items.length) {
      el.innerHTML = '<div class="sec">🛍️ Shop</div><div class="card" style="padding:24px;text-align:center"><div style="font-size:48px;margin-bottom:10px">🛍️</div><div style="font-size:15px;font-weight:700;margin-bottom:5px">Shop is empty</div><div class="tmut" style="font-size:13px">Admin hasn\'t added items yet.</div></div>';
      return;
    }
    el.innerHTML = '<div class="sec">🛍️ Shop</div>' +
      '<div class="shop-grid">' + items.map(_card).join('') + '</div>' +
      '<div class="gap"></div>';
  }

  function _card(item) {
    var oos = item.status === 'out_of_stock' || item.stock <= 0;
    var exp = item.expiry && new Date(item.expiry) < new Date();
    var na  = oos || exp;
    var imgHtml = _img(item.image, 44);
    return '<div class="scard">' +
      '<div class="scard-img">' + imgHtml + (na ? '<div class="oos-tag">'+(exp?'EXPIRED':'OOS')+'</div>' : '') + '</div>' +
      '<div class="scard-body">' +
        '<div class="scard-name">'+_esc(item.name)+'</div>' +
        (item.desc ? '<div class="scard-desc">'+_esc(item.desc)+'</div>' : '') +
        '<div class="scard-meta">Stock: '+(item.stock||0)+(item.expiry?' · Exp:'+item.expiry:'')+'</div>' +
      '</div>' +
      '<div class="scard-foot">' +
        '<span class="scard-price">🪙 '+(item.price||0).toLocaleString()+'</span>' +
        '<button class="btn btn-teal bsm" '+(na?'disabled':'onclick="Shop.openBuy(\''+item.id+'\')"')+'>'+(na?'OOS':'Buy')+'</button>' +
      '</div>' +
    '</div>';
  }

  function openBuy(id) {
    var item = S.shopItems.find(function (x) { return x.id === id; }); if (!item) return;

    // Check daily purchase limit
    var limit = Settings.get('dailyBuyLimit') || 5;
    var today = new Date().toDateString();
    var dp = (S.user && S.user.dailyPurchases) || {};
    var todayCount = dp[today] || 0;
    if (todayCount >= limit) { UI.toast('Daily purchase limit reached (' + limit + '/day)', 'err'); return; }

    S.buyItemId = id;
    var imgEl = document.getElementById('buy-img');
    imgEl.innerHTML = _img(item.image, 38);
    document.getElementById('buy-name').textContent = item.name;
    document.getElementById('buy-desc').textContent = item.desc || '';
    document.getElementById('buy-cost').textContent = '🪙 ' + (item.price||0).toLocaleString();
    document.getElementById('buy-bal').textContent  = '🪙 ' + ((S.user&&S.user.coins)||0).toLocaleString();
    UI.openModal('modal-buy');
  }

  function confirmBuy() {
    var item = S.shopItems.find(function (x) { return x.id === S.buyItemId; }); if (!item) return;
    if (!S.user || (S.user.coins||0) < item.price) { UI.toast('Not enough coins!', 'err'); return; }
    if (item.stock <= 0 || item.status === 'out_of_stock') { UI.toast('Out of stock!', 'err'); return; }

    var ok = Data.deductCoins(item.price, item.name); if (!ok) { UI.toast('Not enough coins!', 'err'); return; }

    // Track daily purchases
    var today = new Date().toDateString();
    var dp = (S.user.dailyPurchases) || {};
    dp[today] = (dp[today] || 0) + 1;
    S.user.dailyPurchases = dp;

    item.stock--; if (item.stock <= 0) item.status = 'out_of_stock';
    if (window.FB && window.DB && item.id) {
      window.DB.collection('shopItems').doc(item.id).update({ stock: window.FSV.increment(-1), status: item.status }).catch(function () {});
    }
    if (!S.isGuest && window.FB && window.DB && S.uid) {
      window.DB.collection('users').doc(S.uid).update({ dailyPurchases: dp }).catch(function () {});
    }
    UI.closeModal('modal-buy'); UI.toast('Purchase successful! 🎉');
    render();
  }

  function loadShop() {
    if (!window.FB || !window.DB) { S.shopItems = []; _markLoaded(); return; }
    UI.setLoad('Loading shop...', 88);
    window.DB.collection('shopItems').orderBy('createdAt','desc').get()
      .then(function (snap) {
        S.shopItems = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        _markLoaded();
      })
      .catch(function () { S.shopItems = []; _markLoaded(); });
  }

  function _markLoaded() {
    S.loaded.shop = true; Boot.tryLaunch();
  }

  return { render, openBuy, confirmBuy, loadShop };
}());

/* ══════════════════════════════════════════════════════════════
   §11  EARN MODULE
══════════════════════════════════════════════════════════════ */
var Earn = (function () {

  function render() {
    var el = document.getElementById('pg-earn'); if (!el) return;
    var u = S.user || {};
    var adsOn = Settings.get('adsEnabled');
    var sr = Settings.get('adRewards.short') || 25;
    var lr = Settings.get('adRewards.long')  || 50;
    var fr = Settings.get('adRewards.full')  || 100;
    var tasks = [
      { ico:'🎮', lbl:'Play 3 games',   rw:30, done:(u.gamesPlayed||0)>=3 },
      { ico:'🔥', lbl:'3-Day Streak',   rw:75, done:(u.dailyStreak||0)>=3 },
      { ico:'📺', lbl:'Watch 2 ads',    rw:40, done:false },
      { ico:'💰', lbl:'Earn 200 coins', rw:20, done:(u.totalEarned||0)>=200 },
    ];
    el.innerHTML =
      '<div class="sec">📺 Video Ads ' + (adsOn ? '' : '<span class="badge bg-rose">DISABLED</span>') + '</div>' +
      '<div class="card card-cyan mb12" style="padding:18px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
          '<div style="width:46px;height:46px;border-radius:14px;background:var(--cyan-d);border:1px solid rgba(0,212,200,.3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📺</div>' +
          '<div><div style="font-size:15px;font-weight:700">Watch Video Ads</div><div class="tmut" style="font-size:12px;margin-top:1px">Earn coins for every ad watched</div></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-teal bfull" ' + (adsOn?'':'disabled') + ' onclick="Earn.startAd(\'short\')">▶  Short Ad (10s) — +' + sr + ' 🪙</button>' +
          '<button class="btn btn-ghost bfull" ' + (adsOn?'':'disabled') + ' onclick="Earn.startAd(\'long\')">▶  Long Ad (30s) — +' + lr + ' 🪙</button>' +
          '<button class="btn btn-ghost bfull" ' + (adsOn?'':'disabled') + ' onclick="Earn.startAd(\'full\')">▶  Full Ad (60s) — +' + fr + ' 🪙</button>' +
        '</div>' +
      '</div>' +
      '<div class="sec">✅ Daily Tasks</div>' +
      '<div class="card mb12" style="padding:14px">' +
      tasks.map(function (tk) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)">' +
          '<span style="font-size:20px">'+tk.ico+'</span>' +
          '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+tk.lbl+'</div><div style="font-size:11px;color:var(--t2)">+'+tk.rw+' 🪙</div></div>' +
          '<span class="badge '+(tk.done?'bg-cyan':'bg-amber')+'">'+(tk.done?'✓ DONE':'PENDING')+'</span>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="sec">👥 Referral</div>' +
      '<div class="card mb12" style="padding:18px;text-align:center">' +
        '<div style="font-size:32px;margin-bottom:8px">🎁</div>' +
        '<div style="font-size:14px;font-weight:700;margin-bottom:4px">Invite Friends & Earn</div>' +
        '<div class="tmut" style="font-size:12px;margin-bottom:14px">+100 🪙 per friend who joins</div>' +
        '<div style="background:var(--s1);border:1px dashed var(--bd2);border-radius:var(--r12);padding:12px;font-family:var(--fm);font-size:14px;letter-spacing:3px;color:var(--cyan);margin-bottom:12px">LABB-'+((S.uid||'000000').slice(-6).toUpperCase())+'</div>' +
        '<button class="btn btn-ghost bfull" style="padding:12px" onclick="Earn.copyRef()">📋 Copy Code</button>' +
      '</div><div class="gap"></div>';
  }

  function startAd(type) {
    var dur = { short:10, long:30, full:60 }[type] || 10;
    var rw  = Settings.get('adRewards.' + type) || 25;
    Ads.showVideoAd({ duration: dur, reward: rw, label: 'Earn +' + rw + ' coins for watching!' },
      function (res) {
        if (res.completed) {
          Data.addCoins(res.reward, 'Video Ad Reward');
          UI.toast('+' + res.reward + ' 🪙 earned!');
        }
      }
    );
  }

  function claimAd() { Ads.claim(); }
  function skipAd()  { Ads.skip();  }

  function copyRef() {
    var code = 'LABB-' + ((S.uid||'000000').slice(-6).toUpperCase());
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () {});
    UI.toast('Referral code copied! 📋');
  }

  return { render, startAd, claimAd, skipAd, copyRef };
}());

/* ══════════════════════════════════════════════════════════════
   §12  ADMIN MODULE
   ── ACCESS STRICTLY LIMITED TO: ADMIN_EMAIL ──
   The Admin tab is hidden for all other users.
   All admin functions check S.isAdmin before executing.
══════════════════════════════════════════════════════════════ */
var Admin = (function () {

  function _guard() {
    if (!S.isAdmin) { UI.toast('Admin access denied', 'err'); return false; } return true;
  }

  /* ── Main admin page ── */
  function render() {
    var el = document.getElementById('pg-admin'); if (!el) return;
    if (!_guard()) {
      el.innerHTML = '<div class="tmut tc" style="padding:40px;font-size:14px">⛔ Access Denied</div>';
      return;
    }
    el.innerHTML =
      '<div class="sec">⚙️ Admin Panel</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
        '<div style="background:var(--rose-d);border:1px solid rgba(240,64,96,.22);border-radius:var(--r16);padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase">USERS</div><div class="mono" id="adm-tu" style="font-size:26px;font-weight:700;color:var(--rose)">—</div></div>' +
        '<div style="background:var(--amber-d);border:1px solid rgba(240,165,0,.22);border-radius:var(--r16);padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase">COINS ISSUED</div><div class="mono" id="adm-tc" style="font-size:26px;font-weight:700;color:var(--amber)">—</div></div>' +
      '</div>' +
      '<button class="btn btn-violet bfull mb12" onclick="Admin.openSettings()">⚙️ Global Settings</button>' +
      '<div class="sub-tabs">' +
        '<button class="stab active" id="at-users" onclick="Admin._tab(\'users\')">Users</button>' +
        '<button class="stab"        id="at-shop"  onclick="Admin._tab(\'shop\')">Shop Items</button>' +
      '</div>' +
      '<div id="adm-body"></div><div class="gap"></div>';
    _tab('users');
  }

  var _ct = 'users';
  function _tab(t) {
    _ct = t;
    ['users','shop'].forEach(function (x) { var b=document.getElementById('at-'+x); if(b)b.classList.remove('active'); });
    var ab = document.getElementById('at-' + t); if (ab) ab.classList.add('active');
    if (t === 'users') _renderUsers();
    else _renderShopAdmin();
  }

  /* ── USERS TAB ── */
  function _renderUsers() {
    var el = document.getElementById('adm-body'); if (!el) return;
    el.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<input class="finput" id="adm-srch" placeholder="Search name or email..." style="flex:1" oninput="Admin._filter()" />' +
        '<button class="btn btn-teal bsm" onclick="Admin.loadUsers()">🔄</button>' +
      '</div>' +
      '<div class="card" style="padding:14px;overflow-x:auto"><div id="adm-tbl">Loading...</div></div>';
    loadUsers();
  }

  function loadUsers() {
    if (!_guard()) return;
    if (!window.FB || !window.DB) { var e = document.getElementById('adm-tbl'); if(e) e.innerHTML='<div class="tmut tc" style="padding:20px">Firebase unavailable</div>'; return; }
    window.DB.collection('users').orderBy('coins','desc').get()
      .then(function (snap) {
        S.adminUsers = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
        var tc = 0; S.adminUsers.forEach(function (u) { tc += u.coins||0; });
        var tu = document.getElementById('adm-tu'), tcc = document.getElementById('adm-tc');
        if (tu)  tu.textContent  = S.adminUsers.length;
        if (tcc) tcc.textContent = tc.toLocaleString();
        _drawTable(S.adminUsers);
      })
      .catch(function (e) { var el=document.getElementById('adm-tbl'); if(el)el.innerHTML='<div style="color:var(--rose);tc;padding:20px">'+e.message+'</div>'; });
  }

  function _filter() {
    var q = (document.getElementById('adm-srch')||{}).value||''; q = q.toLowerCase();
    _drawTable(q ? (S.adminUsers||[]).filter(function(u){ return (u.name||'').toLowerCase().indexOf(q)>=0||(u.email||'').toLowerCase().indexOf(q)>=0; }) : (S.adminUsers||[]));
  }

  function _drawTable(list) {
    var el = document.getElementById('adm-tbl'); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="tmut tc" style="padding:20px">No users found</div>'; return; }
    el.innerHTML = '<table class="atable"><thead><tr><th>User</th><th>Coins</th><th>LV</th><th>Role</th><th>Actions</th></tr></thead><tbody>' +
      list.map(function (u) {
        return '<tr>' +
          '<td style="min-width:110px"><div style="font-size:13px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_esc(u.name||'—')+'</div><div style="font-size:10px;color:var(--t2);max-width:120px;overflow:hidden;text-overflow:ellipsis">'+_esc(u.email||'')+'</div></td>' +
          '<td><span class="mono" style="color:var(--amber);font-weight:700">'+(u.coins||0).toLocaleString()+'</span></td>' +
          '<td><span class="lv-chip" style="font-size:9px">LV'+(u.level||1)+'</span></td>' +
          '<td><span class="badge '+(u.role==='admin'?'bg-rose':'bg-cyan')+'">'+(u.role||'user')+'</span></td>' +
          '<td><div style="display:flex;gap:4px">' +
            '<button class="btn btn-amber bxs" onclick="Admin._openEdit(\''+u.uid+'\',\''+encodeURIComponent(u.name||'Player')+'\','+( u.coins||0)+')">✏️</button>' +
            '<button class="btn btn-ghost bxs" onclick="Admin._toggleRole(\''+u.uid+'\',\''+(u.role||'user')+'\')">⚡</button>' +
          '</div></td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  /* ── Edit Balance modal — only opened here, never on startup ── */
  function _openEdit(uid, nameEnc, coins) {
    if (!_guard()) return;
    S.editUID = uid; S.editName = decodeURIComponent(nameEnc);
    document.getElementById('ebal-name').textContent = S.editName;
    document.getElementById('ebal-val').value = coins;
    UI.openModal('modal-edit-bal');
  }

  function saveBalance() {
    if (!_guard()) return;
    var v = parseInt(document.getElementById('ebal-val').value||'0');
    if (isNaN(v)||v<0) { UI.toast('Invalid amount','err'); return; }
    if (!window.FB||!window.DB) { UI.toast('Firebase unavailable','err'); return; }
    window.DB.collection('users').doc(S.editUID).update({ coins: v })
      .then(function () {
        var u = (S.adminUsers||[]).find(function(x){return x.uid===S.editUID;}); if(u)u.coins=v;
        UI.closeModal('modal-edit-bal'); UI.toast(S.editName+' → '+v.toLocaleString()+' coins ✓');
        _drawTable(S.adminUsers||[]);
        var tc=0; (S.adminUsers||[]).forEach(function(x){tc+=x.coins||0;});
        var e=document.getElementById('adm-tc'); if(e)e.textContent=tc.toLocaleString();
      })
      .catch(function (e) { UI.toast(e.message,'err'); });
  }

  function _toggleRole(uid, role) {
    if (!_guard()) return;
    if (!window.FB||!window.DB){UI.toast('Firebase unavailable','err');return;}
    var nr = role==='admin'?'user':'admin';
    window.DB.collection('users').doc(uid).update({ role: nr })
      .then(function () {
        var u=(S.adminUsers||[]).find(function(x){return x.uid===uid;}); if(u)u.role=nr;
        _drawTable(S.adminUsers||[]); UI.toast('Role → '+nr+' ✓');
      })
      .catch(function(e){UI.toast(e.message,'err');});
  }

  /* ── SHOP ADMIN TAB ── */
  function _renderShopAdmin() {
    var el = document.getElementById('adm-body'); if (!el) return;
    el.innerHTML = '<button class="btn btn-teal bfull mb12" onclick="Admin._openItem(null)">➕ Add New Item</button><div id="adm-shop-list">' + _buildShopList() + '</div>';
  }

  function _buildShopList() {
    if (!S.shopItems.length) return '<div class="tmut tc" style="padding:20px">No items yet</div>';
    return S.shopItems.map(function (item) {
      var sb = {active:'<span class="badge bg-cyan">Active</span>',out_of_stock:'<span class="badge bg-rose">OOS</span>',hidden:'<span class="badge bg-violet">Hidden</span>'}[item.status]||'';
      var imgH = item.image ? (item.image.startsWith('http') ? '<img src="'+_esc(item.image)+'" style="width:100%;height:100%;object-fit:cover" />' : item.image) : '🎁';
      return '<div class="sir">' +
        '<div class="sir-thumb">'+imgH+'</div>' +
        '<div class="sir-info"><div class="sir-name">'+_esc(item.name)+'</div><div class="sir-meta mono">🪙'+(item.price||0)+' · Stock:'+(item.stock||0)+(item.expiry?' · Exp:'+item.expiry:'')+'</div></div>' +
        sb +
        '<div class="sir-acts">' +
          '<button class="btn btn-amber bxs" onclick="Admin._openItem(\''+item.id+'\')">✏️</button>' +
          '<button class="btn btn-rose bxs"  onclick="Admin._delItem(\''+item.id+'\')">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _openItem(id) {
    if (!_guard()) return;
    document.getElementById('item-mo-title').textContent = id ? '✏️ Edit Item' : '➕ Add Item';
    document.getElementById('item-edit-id').value = id || '';
    var item = id ? S.shopItems.find(function(x){return x.id===id;}) : null;
    ['item-name','item-img','item-desc','item-expiry'].forEach(function(k){ document.getElementById(k).value = item ? (item[k.replace('item-','').replace('img','image').replace('desc','desc').replace('expiry','expiry').replace('name','name')]||'') : ''; });
    document.getElementById('item-name').value   = item ? (item.name||'')   : '';
    document.getElementById('item-img').value    = item ? (item.image||'')  : '';
    document.getElementById('item-desc').value   = item ? (item.desc||'')   : '';
    document.getElementById('item-expiry').value = item ? (item.expiry||'') : '';
    document.getElementById('item-price').value  = item ? (item.price||'')  : '';
    document.getElementById('item-stock').value  = item ? (item.stock||'')  : '';
    document.getElementById('item-status').value = item ? (item.status||'active') : 'active';
    UI.openModal('modal-item');
  }

  function saveItem() {
    if (!_guard()) return;
    var name   = document.getElementById('item-name').value.trim();
    var price  = parseInt(document.getElementById('item-price').value);
    var stock  = parseInt(document.getElementById('item-stock').value);
    var image  = document.getElementById('item-img').value.trim();
    var desc   = document.getElementById('item-desc').value.trim();
    var expiry = document.getElementById('item-expiry').value;
    var status = document.getElementById('item-status').value;
    var editId = document.getElementById('item-edit-id').value;
    if (!name)           { UI.toast('Name required','err'); return; }
    if (isNaN(price)||price<1){ UI.toast('Valid price required','err'); return; }
    if (isNaN(stock)||stock<0){ UI.toast('Valid stock required','err'); return; }
    if (!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    var data = { name:name, price:price, stock:stock, image:image, desc:desc, expiry:expiry, status:status };
    if (editId) {
      window.DB.collection('shopItems').doc(editId).update(data)
        .then(function(){
          var idx=S.shopItems.findIndex(function(x){return x.id===editId;});
          if(idx>=0) S.shopItems[idx]=Object.assign({id:editId},data);
          UI.closeModal('modal-item'); UI.toast('Item updated ✓');
          var el=document.getElementById('adm-shop-list'); if(el)el.innerHTML=_buildShopList();
        }).catch(function(e){UI.toast(e.message,'err');});
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      window.DB.collection('shopItems').add(data)
        .then(function(ref){
          S.shopItems.unshift(Object.assign({id:ref.id},data));
          UI.closeModal('modal-item'); UI.toast('Item added ✓');
          var el=document.getElementById('adm-shop-list'); if(el)el.innerHTML=_buildShopList();
        }).catch(function(e){UI.toast(e.message,'err');});
    }
  }

  function _delItem(id) {
    if (!_guard()) return;
    if (!confirm('Delete this item?')) return;
    window.DB.collection('shopItems').doc(id).delete()
      .then(function(){
        S.shopItems=S.shopItems.filter(function(x){return x.id!==id;});
        UI.toast('Item deleted');
        var el=document.getElementById('adm-shop-list'); if(el)el.innerHTML=_buildShopList();
      }).catch(function(e){UI.toast(e.message,'err');});
  }

  /* ── GLOBAL SETTINGS MODAL ── */
  function openSettings() {
    if (!_guard()) return;
    var gs = S.settings || Settings.DEFAULTS;
    // Ads
    document.getElementById('gs-ads-enabled').checked = !!gs.adsEnabled;
    document.getElementById('gs-ad-short').value = (gs.adRewards||{}).short || 25;
    document.getElementById('gs-ad-long').value  = (gs.adRewards||{}).long  || 50;
    document.getElementById('gs-ad-full').value  = (gs.adRewards||{}).full  || 100;
    // Games
    var gEl = document.getElementById('gs-games-list');
    var gameIds = ['wheel','scratch','math','dice','slots','cardflip','numguess','rps','wordscram','cointoss'];
    var gameNames = { wheel:'Wheel Spin',scratch:'Scratch Card',math:'Math Quiz',dice:'Dice Roll',slots:'Slots',cardflip:'Card Flip',numguess:'Number Guess',rps:'Rock Paper Scissors',wordscram:'Word Scramble',cointoss:'Coin Toss' };
    var gameIcons = { wheel:'🎡',scratch:'🎫',math:'🧮',dice:'🎲',slots:'🎰',cardflip:'🃏',numguess:'🔢',rps:'✊',wordscram:'🔤',cointoss:'🪙' };
    if (gEl) {
      gEl.innerHTML = gameIds.map(function (id) {
        var cfg = (gs.games||{})[id] || {};
        return '<div class="ss-game-row">' +
          '<span class="ss-game-icon">'+gameIcons[id]+'</span>' +
          '<span class="ss-game-name">'+gameNames[id]+'</span>' +
          '<input class="finput fs" type="number" id="gsr-'+id+'" value="'+(cfg.reward||25)+'" style="width:70px" />' +
          '<label class="toggle"><input type="checkbox" id="gse-'+id+'" '+(cfg.enabled!==false?'checked':'')+'><span class="tslider"></span></label>' +
        '</div>';
      }).join('');
    }
    // LB prizes
    var lbp = gs.leaderboardPrizes || {};
    document.getElementById('gs-lb1').value = lbp.first  || 500;
    document.getElementById('gs-lb2').value = lbp.second || 300;
    document.getElementById('gs-lb3').value = lbp.third  || 150;
    // Buy limit
    document.getElementById('gs-buy-limit').value = gs.dailyBuyLimit || 5;
    UI.openModal('modal-settings');
  }

  function saveSettings() {
    if (!_guard()) return;
    if (!window.FB||!window.DB) { UI.toast('Firebase unavailable','err'); return; }
    var gameIds = ['wheel','scratch','math','dice','slots','cardflip','numguess','rps','wordscram','cointoss'];
    var gamesData = {};
    gameIds.forEach(function (id) {
      var rEl = document.getElementById('gsr-'+id), eEl = document.getElementById('gse-'+id);
      gamesData[id] = { reward: parseInt((rEl&&rEl.value)||25), enabled: eEl ? eEl.checked : true };
    });
    var newSettings = {
      adsEnabled: document.getElementById('gs-ads-enabled').checked,
      adRewards: {
        short: parseInt(document.getElementById('gs-ad-short').value)||25,
        long:  parseInt(document.getElementById('gs-ad-long').value)||50,
        full:  parseInt(document.getElementById('gs-ad-full').value)||100,
      },
      games: gamesData,
      leaderboardPrizes: {
        first:  parseInt(document.getElementById('gs-lb1').value)||500,
        second: parseInt(document.getElementById('gs-lb2').value)||300,
        third:  parseInt(document.getElementById('gs-lb3').value)||150,
      },
      dailyBuyLimit: parseInt(document.getElementById('gs-buy-limit').value)||5,
    };
    window.DB.collection('meta').doc('globalSettings').set(newSettings)
      .then(function () { UI.closeModal('modal-settings'); UI.toast('Settings saved & synced ✓'); })
      .catch(function (e) { UI.toast(e.message,'err'); });
  }

  return {
    render, _tab, loadUsers, _filter, _openEdit, saveBalance, _toggleRole,
    _openItem, saveItem, _delItem, openSettings, saveSettings,
  };
}());

/* ══════════════════════════════════════════════════════════════
   §13  GAMES — all 10
══════════════════════════════════════════════════════════════ */
var Games = (function () {

  function open(id) {
    if (!Settings.gameEnabled(id)) { UI.toast('This game is currently disabled','warn'); return; }
    var gc = document.getElementById('game-slot'); if (!gc) return;
    var MAP = { wheel:_wheel, scratch:_scratch, math:_math, dice:_dice, slots:_slots, cardflip:_cardflip, numguess:_numguess, rps:_rps, wordscram:_wordscram, cointoss:_cointoss };
    var fn = MAP[id]; if (!fn) { UI.toast('Game not found','err'); return; }
    fn(gc); UI.openModal('modal-game');
  }

  function close()         { UI.closeModal('modal-game'); clearInterval(window._gIv); }
  function overlayClose(e) { if (e.target===e.currentTarget) close(); }
  function win(amt, desc)  { Data.addCoins(amt, desc||'Game Win'); UI.toast('🎉 +'+amt+' 🪙'); }

  /* ── WHEEL ── */
  var _wSpin=false, _wR=0;
  var WP=[{l:'10',c:10,bg:'#1A2540'},{l:'50',c:50,bg:'#2D1F6E'},{l:'25',c:25,bg:'#111A30'},{l:'Max!',c:0,bg:'#5C1A2E'},{l:'20',c:20,bg:'#142033'},{l:'150',c:150,bg:'#3D1508'},{l:'15',c:15,bg:'#0C1420'},{l:'75',c:75,bg:'#0A3328'}];

  function _wheel(el) {
    var maxR = Settings.gameReward('wheel');
    WP[3].c = maxR; WP[3].l = maxR + '!';
    el.innerHTML='<h3 class="mo-title">🎡 Wheel Spin</h3><p class="mo-sub">Win up to '+maxR+' coins!</p>' +
      '<div class="wheel-wrap mb14"><div class="wheel-ptr"></div><canvas id="wheel-cv" width="264" height="264"></canvas><div class="wheel-hub"></div></div>' +
      '<div id="w-res" style="text-align:center;min-height:26px;font-size:15px;font-weight:700;color:var(--amber);font-family:var(--fm);margin-bottom:14px"></div>' +
      '<button class="btn btn-violet bfull" id="w-btn" onclick="Games._spin()" style="padding:15px;font-size:15px">🎡 SPIN NOW</button>';
    _drawW(_wR);
  }

  function _drawW(r) {
    var cv=document.getElementById('wheel-cv'); if(!cv)return;
    var ctx=cv.getContext('2d'),n=WP.length,arc=Math.PI*2/n,cx=132,cy=132,rad=126;
    ctx.clearRect(0,0,264,264);
    WP.forEach(function(p,i){
      var a=r+i*arc;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,rad,a,a+arc);ctx.closePath();
      ctx.fillStyle=p.bg;ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.save();ctx.translate(cx,cy);ctx.rotate(a+arc/2);
      ctx.textAlign='right';ctx.fillStyle='#F0F4FF';ctx.font='bold 13px DM Mono,monospace';
      ctx.fillText(p.l,rad-10,5);ctx.restore();
    });
    ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=2;ctx.stroke();
  }

  function _spin() {
    if(_wSpin)return;_wSpin=true;
    var btn=document.getElementById('w-btn'),res=document.getElementById('w-res');
    if(btn){btn.disabled=true;btn.textContent='Spinning...';}
    if(res)res.textContent='';
    var idx=Math.floor(Math.random()*WP.length),arc=Math.PI*2/WP.length;
    var tgt=Math.PI*2*6-(idx*arc+arc/2)-Math.PI/2,st=null,dur=4400;
    function fr(ts){
      if(!st)st=ts;var p=Math.min((ts-st)/dur,1),e=1-Math.pow(1-p,3);
      _wR=tgt*e;_drawW(_wR);
      if(p<1){requestAnimationFrame(fr);}
      else{
        _wSpin=false;var prize=WP[idx];
        if(res)res.textContent='🎉 You won '+prize.c+' coins!';
        if(btn){btn.disabled=false;btn.textContent='🎡 Spin Again';}
        win(prize.c,'Wheel Spin');
      }
    }
    requestAnimationFrame(fr);
  }

  /* ── SCRATCH ── */
  var _sDone=false,_sPrize=0,_sDown=false;
  function _scratch(el) {
    _sDone=false;_sDown=false;
    _sPrize=Math.floor(Math.random()*(Settings.gameReward('scratch')))+5;
    el.innerHTML='<h3 class="mo-title">🎫 Lucky Scratch</h3><p class="mo-sub">Scratch 60% to reveal your prize!</p>' +
      '<div class="sc-wrap mb12"><div class="sc-reveal"><div id="sc-val" style="font-family:var(--fm);font-size:34px;font-weight:700;color:var(--amber)">'+_sPrize+'</div><div class="tmut" style="font-size:12px">LABB Coins</div></div><canvas id="sc-cv" width="264" height="148"></canvas></div>' +
      '<div id="sc-msg" style="text-align:center;min-height:22px;font-size:14px;font-weight:700;color:var(--cyan);margin-bottom:12px"></div>' +
      '<button class="btn btn-amber bfull" style="padding:13px" onclick="Games._newSc()">🔄 New Card</button>';
    _initSc();
  }

  function _initSc() {
    var cv=document.getElementById('sc-cv');if(!cv)return;
    var ctx=cv.getContext('2d');ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,264,148);
    var g=ctx.createLinearGradient(0,0,264,148);g.addColorStop(0,'#1A3060');g.addColorStop(.5,'#20304A');g.addColorStop(1,'#1A3060');
    ctx.fillStyle=g;try{ctx.roundRect(0,0,264,148,16);}catch(e){ctx.rect(0,0,264,148);}ctx.fill();
    ctx.fillStyle='rgba(160,170,191,.6)';ctx.font='bold 14px Sora,sans-serif';ctx.textAlign='center';ctx.fillText('✦  SCRATCH HERE  ✦',132,64);
    ctx.font='11px Sora,sans-serif';ctx.fillStyle='rgba(160,170,191,.35)';ctx.fillText('Reveal 60% to claim',132,86);
    function at(e){
      if(_sDone)return;e.preventDefault();
      var ctx2=cv.getContext('2d'),rect=cv.getBoundingClientRect(),sx=264/rect.width,sy=148/rect.height;
      var cx=e.touches?e.touches[0].clientX:e.clientX,cy=e.touches?e.touches[0].clientY:e.clientY;
      ctx2.globalCompositeOperation='destination-out';
      ctx2.beginPath();ctx2.arc((cx-rect.left)*sx,(cy-rect.top)*sy,24,0,Math.PI*2);ctx2.fill();
      var data=ctx2.getImageData(0,0,264,148).data,cl=0;
      for(var i=3;i<data.length;i+=4)if(data[i]<64)cl++;
      if(cl/(264*148)>0.60&&!_sDone){
        _sDone=true;var m=document.getElementById('sc-msg');if(m)m.textContent='🎊 You won '+_sPrize+' coins!';
        win(_sPrize,'Lucky Scratch');
      }
    }
    cv.onmousedown=function(e){_sDown=true;at(e);};cv.ontouchstart=function(e){_sDown=true;at(e);};
    cv.onmousemove=function(e){if(_sDown)at(e);};cv.ontouchmove=function(e){if(_sDown)at(e);};
    cv.onmouseup=cv.onmouseleave=cv.ontouchend=function(){_sDown=false;};
  }

  function _newSc(){
    _sDone=false;_sDown=false;_sPrize=Math.floor(Math.random()*Settings.gameReward('scratch'))+5;
    var pv=document.getElementById('sc-val');if(pv)pv.textContent=_sPrize;
    var m=document.getElementById('sc-msg');if(m)m.textContent='';_initSc();
  }

  /* ── MATH ── */
  var _mScore=0,_mQ=null;
  var MTIERS=[{ops:['+','-'],r:[1,15],rw:20},{ops:['+','-'],r:[10,50],rw:30},{ops:['×'],r:[1,10],rw:45},{ops:['÷'],r:[1,10],rw:Settings.gameReward('math')}];

  function _math(el){
    _mScore=0;clearInterval(window._gIv);
    el.innerHTML='<h3 class="mo-title">🧮 Math Quiz</h3><p class="mo-sub">Answer quickly to earn coins!</p><div id="m-body"></div>';
    _nextM();
  }

  function _nextM(){
    clearInterval(window._gIv);var el=document.getElementById('m-body');if(!el)return;
    MTIERS[3].rw=Settings.gameReward('math');
    var tier=MTIERS[Math.min(Math.floor(_mScore/3),3)];
    var op=tier.ops[Math.floor(Math.random()*tier.ops.length)];
    var mn=tier.r[0],mx=tier.r[1];
    var a=Math.floor(Math.random()*(mx-mn+1))+mn,b=Math.floor(Math.random()*(mx-mn+1))+mn;
    if(op==='-'&&b>a){var t=a;a=b;b=t;}
    if(op==='÷'){b=Math.max(1,b);a=b*(Math.floor(Math.random()*8)+1);}
    var ans=op==='+'?a+b:op==='-'?a-b:op==='×'?a*b:a/b;
    _mQ={a:a,b:b,op:op,ans:ans,rw:tier.rw};
    var opts=new Set([ans]);while(opts.size<4){var off=Math.floor(Math.random()*12)-6;if(off!==0)opts.add(ans+off);}
    var sh=Array.from(opts).sort(function(){return Math.random()-.5;});
    var t=10;
    el.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:18px;text-align:center;margin-bottom:13px"><div class="tmut" style="font-size:12px;margin-bottom:6px">Score: '+_mScore+' · Reward: +'+tier.rw+' 🪙</div><div class="mono" style="font-size:40px;font-weight:700">'+a+' '+op+' '+b+' = ?</div></div>' +
      '<div style="text-align:right;font-size:12px;color:var(--rose);font-family:var(--fm);margin-bottom:10px" id="m-tm">⏱ '+t+'s</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+sh.map(function(o){return '<button class="btn btn-ghost" style="padding:16px;font-size:20px;font-family:var(--fm);font-weight:700;border-radius:var(--r16)" onclick="Games._checkM('+o+')">'+o+'</button>';}).join('')+'</div>';
    window._gIv=setInterval(function(){t--;var te=document.getElementById('m-tm');if(te)te.textContent='⏱ '+t+'s';if(t<=0){clearInterval(window._gIv);UI.toast('⏰ Time up!','err');setTimeout(_nextM,800);}},1000);
  }

  function _checkM(v){
    clearInterval(window._gIv);
    if(v===_mQ.ans){_mScore++;UI.toast('✓ Correct! +'+_mQ.rw+' 🪙');win(_mQ.rw,'Math Quiz');_nextM();}
    else{UI.toast('✗ Wrong!','err');var el=document.getElementById('m-body');if(el)el.querySelectorAll('button').forEach(function(b){if(Number(b.textContent)===_mQ.ans)b.style.background='rgba(0,212,200,.2)';});setTimeout(_nextM,1100);}
  }

  /* ── DICE ── */
  var DF=['⚀','⚁','⚂','⚃','⚄','⚅'];
  function _dice(el){
    el.innerHTML='<h3 class="mo-title">🎲 Dice Roll</h3><p class="mo-sub">Roll higher than the house!</p>' +
      '<div style="display:flex;justify-content:center;gap:16px;margin-bottom:18px"><div style="text-align:center"><div id="d-y" style="width:84px;height:84px;background:var(--cyan-d);border:2px solid rgba(0,212,200,.35);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px">🎲</div><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">YOU</div></div>' +
      '<div style="display:flex;align-items:center;font-size:17px;font-weight:700;color:var(--t2)">VS</div>' +
      '<div style="text-align:center"><div id="d-h" style="width:84px;height:84px;background:var(--rose-d);border:2px solid rgba(240,64,96,.35);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px">🎲</div><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">HOUSE</div></div></div>' +
      '<div id="d-res" style="text-align:center;min-height:28px;font-size:14px;font-weight:700;margin-bottom:14px"></div>' +
      '<button class="btn btn-teal bfull" id="d-btn" onclick="Games._rollD()" style="padding:15px;font-size:14px">🎲 ROLL DICE</button>';
  }

  function _rollD(){
    var btn=document.getElementById('d-btn');if(btn){btn.disabled=true;btn.textContent='Rolling...';}
    document.getElementById('d-res').textContent='';var t=0;
    var iv=setInterval(function(){document.getElementById('d-y').textContent=DF[Math.floor(Math.random()*6)];document.getElementById('d-h').textContent=DF[Math.floor(Math.random()*6)];if(++t>14){clearInterval(iv);_finD(btn);}},75);
  }

  function _finD(btn){
    var y=Math.floor(Math.random()*6)+1,h=Math.floor(Math.random()*6)+1;
    document.getElementById('d-y').textContent=DF[y-1];document.getElementById('d-h').textContent=DF[h-1];
    var res=document.getElementById('d-res'),maxR=Settings.gameReward('dice');
    var rws=[0,Math.round(maxR*.1),Math.round(maxR*.2),Math.round(maxR*.35),Math.round(maxR*.5),Math.round(maxR*.75),maxR];
    if(y>h){res.textContent='🎉 Win! +'+rws[y]+' 🪙';res.style.color='var(--cyan)';win(rws[y],'Dice Roll');}
    else if(y===h){res.textContent='🤝 Tie! Roll again';res.style.color='var(--amber)';if(btn){btn.disabled=false;btn.textContent='🎲 Roll Again';}return;}
    else{res.textContent='😞 House wins. Try again!';res.style.color='var(--rose)';}
    if(btn){btn.disabled=false;btn.textContent='🎲 Roll Again';}
  }

  /* ── SLOTS ── */
  var SS=['🍒','🍋','🍊','⭐','💎','7️⃣','🎰','🍀'];
  var _slRun=false;
  function _slots(el){
    _slRun=false;var maxR=Settings.gameReward('slots');
    var SPAY={'🍒🍒🍒':Math.round(maxR*.12),'🍋🍋🍋':Math.round(maxR*.16),'🍊🍊🍊':Math.round(maxR*.2),'⭐⭐⭐':Math.round(maxR*.3),'💎💎💎':Math.round(maxR*.6),'7️⃣7️⃣7️⃣':maxR,'🎰🎰🎰':Math.round(maxR*.4),'🍀🍀🍀':Math.round(maxR*.24)};
    window._SPAY=SPAY;
    el.innerHTML='<h3 class="mo-title">🎰 Slot Machine</h3><p class="mo-sub">Match 3 to win up to '+maxR+' coins!</p>' +
      '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px">'+[0,1,2].map(function(i){return '<div class="reel" id="r'+i+'">'+SS[Math.floor(Math.random()*SS.length)]+'</div>';}).join('')+'</div>' +
      '<div id="sl-res" style="text-align:center;min-height:26px;font-size:14px;font-weight:700;color:var(--amber);margin-bottom:12px"></div>' +
      '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r12);padding:10px;margin-bottom:13px"><div style="font-size:9px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px">Pay Table</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">'+Object.keys(SPAY).map(function(k){return '<div style="font-size:11px;color:var(--t1)">'+k+'<span class="mono" style="color:var(--amber);margin-left:4px">=+'+SPAY[k]+'</span></div>';}).join('')+'</div></div>' +
      '<button class="btn btn-rose bfull" id="sl-btn" onclick="Games._spinSl()" style="padding:15px;font-size:14px">🎰 SPIN</button>';
  }

  function _spinSl(){
    if(_slRun)return;_slRun=true;var btn=document.getElementById('sl-btn');if(btn){btn.disabled=true;btn.textContent='Spinning...';}
    document.getElementById('sl-res').textContent='';var finals=[],delays=[350,650,950];
    [0,1,2].forEach(function(i){
      var reel=document.getElementById('r'+i),t=0;reel.classList.add('spin');
      var iv=setInterval(function(){reel.textContent=SS[Math.floor(Math.random()*SS.length)];if(++t*50>=delays[i]){clearInterval(iv);reel.classList.remove('spin');var sym=SS[Math.floor(Math.random()*SS.length)];finals[i]=sym;reel.textContent=sym;if(finals.filter(Boolean).length===3)_resSl(finals,btn);}},50);
    });
  }

  function _resSl(f,btn){
    _slRun=false;var combo=f.join(''),pay=(window._SPAY||{})[combo]||0,res=document.getElementById('sl-res');
    if(pay>0){res.textContent='🎰 '+(pay>=Settings.gameReward('slots')*.9?'JACKPOT':'WIN')+'! +'+pay+' 🪙';res.style.color='var(--amber)';win(pay,'Slot Machine');}
    else if(f[0]===f[1]||f[1]===f[2]){res.textContent='🍀 Partial! +10 🪙';res.style.color='var(--cyan)';win(10,'Slot Partial');}
    else{res.textContent='No match. Try again!';res.style.color='var(--rose)';}
    if(btn){btn.disabled=false;btn.textContent='🎰 Spin Again';}
  }

  /* ── CARD FLIP ── */
  var CSYMS=['🌟','🔮','💎','🎭','🦋','🌙','☀️','🎯'];
  var _cf=[],_cfF=[],_cfM=0,_cfL=false;
  function _cardflip(el){
    _cfM=0;_cfF=[];_cfL=false;var syms=CSYMS.concat(CSYMS).sort(function(){return Math.random()-.5;});
    _cf=syms.map(function(s,i){return{id:i,sym:s,matched:false,revealed:false};});
    el.innerHTML='<h3 class="mo-title">🃏 Card Flip</h3><p class="mo-sub">Match all 8 pairs — +'+Math.round(Settings.gameReward('cardflip')/8)+' 🪙 per match!</p>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:13px" id="cf-grid">'+
      syms.map(function(sym,i){return '<div class="fcard" style="width:56px;height:74px;margin:0 auto" id="cf'+i+'" onclick="Games._flipC('+i+')"><div class="finner"><div class="fface ffront">?</div><div class="fface fback">'+syms[i]+'</div></div></div>';}).join('')+
      '</div><div id="cf-res" class="tmut tc" style="font-size:12px">Tap cards to flip!</div>';
  }

  function _flipC(i){
    if(_cfL||_cf[i].matched||_cf[i].revealed)return;
    _cf[i].revealed=true;var el=document.getElementById('cf'+i);if(el)el.classList.add('flipped');
    _cfF.push(i);
    if(_cfF.length===2){
      _cfL=true;var a=_cfF[0],b=_cfF[1];
      if(_cf[a].sym===_cf[b].sym){
        _cfM++;_cf[a].matched=_cf[b].matched=true;_cfF=[];_cfL=false;
        var perMatch=Math.round(Settings.gameReward('cardflip')/8);
        win(perMatch,'Card Flip Match');var res=document.getElementById('cf-res');
        if(_cfM===CSYMS.length){if(res)res.textContent='🏆 All pairs! Bonus +50!';win(50,'Card Flip Bonus');}
        else{if(res)res.textContent='✓ Match! '+_cfM+'/8 found!';}
      } else {
        setTimeout(function(){var ea=document.getElementById('cf'+a),eb=document.getElementById('cf'+b);if(ea)ea.classList.remove('flipped');if(eb)eb.classList.remove('flipped');_cf[a].revealed=_cf[b].revealed=false;_cfF=[];_cfL=false;},850);
      }
    }
  }

  /* ── NUMBER GUESS ── */
  var _ngS=0,_ngA=0;
  function _numguess(el){
    _ngS=Math.floor(Math.random()*100)+1;_ngA=0;
    el.innerHTML='<h3 class="mo-title">🔢 Number Guess</h3><p class="mo-sub">Guess 1–100 in 6 tries!</p>' +
      '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:18px;text-align:center;margin-bottom:15px"><div style="font-size:46px;margin-bottom:7px">🤔</div><div id="ng-h" class="tmut" style="font-size:13px">Think of a number 1–100...</div><div id="ng-l" class="mono" style="font-size:11px;color:var(--t2);margin-top:6px">6 attempts left</div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px"><input class="finput" id="ng-inp" type="number" min="1" max="100" placeholder="1–100" style="flex:1" onkeydown="if(event.key===\'Enter\')Games._checkNG()" /><button class="btn btn-teal" style="padding:0 22px;border-radius:var(--r16)" onclick="Games._checkNG()">→</button></div>' +
      '<div id="ng-hist" style="display:flex;flex-wrap:wrap;gap:5px"></div>';
  }

  function _checkNG(){
    var inp=document.getElementById('ng-inp');if(!inp)return;
    var v=parseInt(inp.value);if(isNaN(v)||v<1||v>100){UI.toast('Enter 1–100','err');return;}
    inp.value='';_ngA++;var left=6-_ngA;
    var hist=document.getElementById('ng-hist');var pill=document.createElement('div');
    pill.style.cssText='padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700;font-family:var(--fm)';
    if(v===_ngS){
      pill.style.cssText+='background:rgba(0,212,200,.18);color:var(--cyan)';pill.textContent=v+'✓';if(hist)hist.appendChild(pill);
      var maxR=Settings.gameReward('numguess'),rws=[maxR,Math.round(maxR*.8),Math.round(maxR*.6),Math.round(maxR*.5),Math.round(maxR*.4),Math.round(maxR*.25)];
      var rw=rws[Math.min(_ngA-1,5)];
      document.getElementById('ng-h').textContent='🎉 Correct! It was '+_ngS;
      document.getElementById('ng-l').textContent='Won in '+_ngA+' try! +'+rw+' 🪙';win(rw,'Number Guess');
      var gc=document.getElementById('game-slot');setTimeout(function(){var b=document.createElement('button');b.className='btn btn-violet bfull';b.style.cssText='padding:13px;font-size:14px;margin-top:14px';b.textContent='🔄 Play Again';b.onclick=function(){_numguess(gc);};if(gc)gc.appendChild(b);},200);
    } else {
      pill.style.cssText+='background:rgba(240,64,96,.15);color:var(--rose)';pill.textContent=v;if(hist)hist.appendChild(pill);
      document.getElementById('ng-h').textContent=v<_ngS?'📈 Too low!':'📉 Too high!';
      if(left<=0){document.getElementById('ng-h').textContent='😞 Game over! It was '+_ngS;document.getElementById('ng-l').textContent='No attempts left';var gc2=document.getElementById('game-slot');setTimeout(function(){var b=document.createElement('button');b.className='btn btn-amber bfull';b.style.cssText='padding:13px;font-size:14px;margin-top:14px';b.textContent='🔄 Try Again';b.onclick=function(){_numguess(gc2);};if(gc2)gc2.appendChild(b);},200);}
      else{document.getElementById('ng-l').textContent=left+' attempt'+(left===1?'':'s')+' left';}
    }
  }

  /* ── RPS ── */
  var RPC=['✊','✋','✌️'],RPN=['Rock','Paper','Scissors'],RPW={0:2,1:0,2:1};
  function _rps(el){
    el.innerHTML='<h3 class="mo-title">✊ Rock Paper Scissors</h3><p class="mo-sub">Beat the CPU — win +'+Settings.gameReward('rps')+' 🪙!</p>' +
      '<div style="display:flex;justify-content:center;gap:18px;margin-bottom:18px"><div style="text-align:center"><div id="rps-y" style="width:80px;height:80px;background:var(--cyan-d);border:2px solid rgba(0,212,200,.3);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:42px">?</div><div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">YOU</div></div>' +
      '<div style="display:flex;align-items:center;font-size:16px;font-weight:700;color:var(--t2)">VS</div>' +
      '<div style="text-align:center"><div id="rps-c" style="width:80px;height:80px;background:var(--rose-d);border:2px solid rgba(240,64,96,.3);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:42px">?</div><div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">CPU</div></div></div>' +
      '<div id="rps-r" style="text-align:center;min-height:26px;font-size:14px;font-weight:700;margin-bottom:16px"></div>' +
      '<div style="display:flex;justify-content:center;gap:10px">'+RPC.map(function(c,i){return '<div style="text-align:center"><button onclick="Games._playRPS('+i+')" style="width:70px;height:70px;background:var(--s2);border:1px solid var(--bd2);border-radius:16px;font-size:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto">'+c+'</button><div style="font-size:9px;color:var(--t2);font-weight:700;margin-top:4px">'+RPN[i]+'</div></div>';}).join('')+'</div>';
  }

  function _playRPS(ch){
    var cpu=Math.floor(Math.random()*3),t=0;document.getElementById('rps-y').textContent=RPC[ch];
    var iv=setInterval(function(){document.getElementById('rps-c').textContent=RPC[Math.floor(Math.random()*3)];if(++t>12){clearInterval(iv);_resRPS(ch,cpu);}},70);
  }

  function _resRPS(y,cpu){
    document.getElementById('rps-c').textContent=RPC[cpu];var res=document.getElementById('rps-r');
    var rw=Settings.gameReward('rps');
    if(y===cpu){res.textContent='🤝 Tie! Try again.';res.style.color='var(--amber)';}
    else if(RPW[y]===cpu){res.textContent='🎉 WIN! +'+rw+' 🪙';res.style.color='var(--cyan)';win(rw,'Rock Paper Scissors');}
    else{res.textContent='😞 CPU wins. Try again!';res.style.color='var(--rose)';}
  }

  /* ── WORD SCRAMBLE ── */
  var WW=[{w:'COINS',h:'Currency'},{w:'LUCKY',h:'Good fortune'},{w:'BONUS',h:'Extra reward'},{w:'PRIZE',h:'What you win'},{w:'GAMES',h:'What you play'},{w:'SCORE',h:'Points tally'},{w:'LEVEL',h:'Your rank'},{w:'DAILY',h:'Every 24 hrs'},{w:'WHEEL',h:'Spin around'},{w:'CARDS',h:'Flip to match'},{w:'QUEST',h:'A mission'},{w:'LABB',h:'This app'}];
  var _wsW='',_wsA=0;
  function _scr(w){var a=w.split('');for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}var r=a.join('');return r===w?_scr(w):r;}

  function _wordscram(el){
    var q=WW[Math.floor(Math.random()*WW.length)];_wsW=q.w;_wsA=0;var sc=_scr(q.w);
    el.innerHTML='<h3 class="mo-title">🔤 Word Scramble</h3><p class="mo-sub">Unscramble for up to +'+Settings.gameReward('wordscram')+' 🪙!</p>' +
      '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:20px;text-align:center;margin-bottom:15px"><div class="mono" style="font-size:36px;font-weight:700;color:var(--violet);letter-spacing:8px;margin-bottom:8px">'+sc+'</div><div class="tmut" style="font-size:12px">💡 '+q.h+'</div><div id="ws-l" class="mono" style="font-size:11px;color:var(--t2);margin-top:6px">3 attempts left</div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px"><input class="finput" id="ws-i" placeholder="Your answer..." style="flex:1;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')Games._checkWS()" /><button class="btn btn-violet" style="padding:0 20px;border-radius:var(--r16)" onclick="Games._checkWS()">→</button></div>' +
      '<div id="ws-r" style="text-align:center;min-height:22px;font-size:14px;font-weight:700"></div>';
  }

  function _checkWS(){
    var inp=document.getElementById('ws-i');if(!inp)return;var ans=inp.value.trim().toUpperCase();inp.value='';
    _wsA++;var left=3-_wsA;var res=document.getElementById('ws-r');var maxR=Settings.gameReward('wordscram');
    if(ans===_wsW){
      var rws=[maxR,Math.round(maxR*.7),Math.round(maxR*.4)];var rw=rws[Math.min(_wsA-1,2)];
      res.textContent='✓ Correct! +'+rw+' 🪙';res.style.color='var(--cyan)';document.getElementById('ws-l').textContent='Won in '+_wsA+' try!';win(rw,'Word Scramble');
      setTimeout(function(){var gc=document.getElementById('game-slot');if(gc)_wordscram(gc);},1600);
    } else {
      if(left<=0){res.textContent='Game over! Word: '+_wsW;res.style.color='var(--rose)';setTimeout(function(){var gc=document.getElementById('game-slot');if(gc)_wordscram(gc);},1600);}
      else{res.textContent='✗ Wrong! '+left+' chance'+(left===1?'':'s')+' left';res.style.color='var(--rose)';document.getElementById('ws-l').textContent=left+' attempt'+(left===1?'':'s')+' left';}
    }
  }

  /* ── COIN TOSS ── */
  function _cointoss(el){
    el.innerHTML='<h3 class="mo-title">🪙 Coin Toss</h3><p class="mo-sub">Heads or Tails? Win +'+Settings.gameReward('cointoss')+' 🪙!</p>' +
      '<div id="ct-c" style="width:130px;height:130px;border-radius:50%;margin:0 auto 18px;background:linear-gradient(135deg,var(--amber),var(--amber2));border:4px solid rgba(240,165,0,.4);display:flex;align-items:center;justify-content:center;font-size:54px;box-shadow:0 0 44px rgba(240,165,0,.3)">🪙</div>' +
      '<div id="ct-r" style="text-align:center;min-height:26px;font-size:15px;font-weight:700;color:var(--amber);margin-bottom:18px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn btn-amber bfull" id="ct-h" onclick="Games._toss(\'heads\')" style="font-size:15px;padding:16px">👑 HEADS</button><button class="btn btn-teal bfull" id="ct-t" onclick="Games._toss(\'tails\')" style="font-size:15px;padding:16px">⭕ TAILS</button></div>';
  }

  function _toss(ch){
    var bh=document.getElementById('ct-h'),bt=document.getElementById('ct-t');if(bh)bh.disabled=true;if(bt)bt.disabled=true;
    var coin=document.getElementById('ct-c'),res=document.getElementById('ct-r'),t=0;
    var iv=setInterval(function(){coin.textContent=t%2===0?'👑':'⭕';if(++t>18){clearInterval(iv);var out=Math.random()<.5?'heads':'tails';coin.textContent=out==='heads'?'👑':'⭕';coin.style.background=out==='heads'?'linear-gradient(135deg,var(--amber),var(--amber2))':'linear-gradient(135deg,var(--cyan),var(--cyan2))';var rw=Settings.gameReward('cointoss');if(ch===out){res.textContent='🎉 Correct! +'+rw+' 🪙';res.style.color='var(--cyan)';win(rw,'Coin Toss');}else{res.textContent='Wrong! It was '+out+'. Try again!';res.style.color='var(--rose)';}if(bh)bh.disabled=false;if(bt)bt.disabled=false;}},80);
  }

  return {
    open, close, overlayClose,
    _spin, _newSc, _checkM, _rollD, _spinSl, _flipC, _checkNG, _playRPS, _checkWS, _toss,
  };
}());

/* ══════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════ */
function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _dl()   { return new Date().toLocaleDateString(); }
function _img(src, fs) {
  if (!src) return '<span style="font-size:'+fs+'px">🎁</span>';
  if (src.startsWith('http')) return '<img src="'+_esc(src)+'" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML=\'<span style=font-size:'+fs+'px>🎁</span>\'" />';
  return '<span style="font-size:'+fs+'px">'+src+'</span>';
}

/* ── i18n stub ── */
var _I18N = {
  en: { welcome:'Welcome back,', guest:'Guest' },
  my: { welcome:'ကြိုဆိုပါ,',   guest:'ဧည့်သည်' },
  zh: { welcome:'欢迎回来，',     guest:'访客' },
};
function _t(k) { return (_I18N[S.lang]||_I18N.en)[k] || k; }

/* ══════════════════════════════════════════════════════════════
   §14  BOOT MODULE
   Entry point. Orchestrates the loading sequence:
   1. 300ms — start loading settings + shop (parallel)
   2. 400ms — start auth listener (400ms SDK warmup window)
   3. tryLaunch() called whenever a load gate closes;
      app launches when all 3 are true (auth + settings + shop)
══════════════════════════════════════════════════════════════ */
var Boot = (function () {

  function tryLaunch() {
    if (S.loaded.auth && S.loaded.settings && S.loaded.shop) {
      launch();
    }
  }

  function launch() {
    UI.hide('screen-loading');
    UI.hide('screen-auth');
    UI.show('screen-app');
    UI.initParticles();
    UI.refreshCoins();

    // Show admin nav only for the hardcoded admin email
    if (S.isAdmin) {
      var na = document.getElementById('bn-admin'); if (na) na.classList.remove('hidden');
    }

    UI.nav('home');
  }

  function init() {
    UI.setLoad('Initializing Firebase...', 15);

    // Settings + shop load in parallel, do NOT block each other
    setTimeout(function () {
      UI.setLoad('Loading settings...', 30);
      Settings.load();      // real-time listener — marks loaded.settings
      Shop.loadShop();      // one-time fetch — marks loaded.shop
    }, 300);

    // Auth listener after 400ms so compat SDK scripts are fully parsed
    setTimeout(function () {
      UI.setLoad('Checking auth...', 50);
      Auth.initListener();  // marks loaded.auth
    }, 400);
  }

  return { tryLaunch, launch, init };
}());

// ── Start the app ──
Boot.init();
