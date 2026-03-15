/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  LABB v6 — app.js                                           ║
 * ║  Firebase Compat SDK v9.23.0                                ║
 * ║                                                             ║
 * ║  SECTION MAP                                                ║
 * ║  §0   FIREBASE CONFIG  ← paste NEW keys here               ║
 * ║  §1   FIREBASE INIT    ← synchronous, window.AUTH/DB/FSV   ║
 * ║  §2   STATE            ← single source of truth            ║
 * ║  §3   I18N             ← EN + Burmese string table         ║
 * ║  §4   APP CONTROLLER   ← language, screen routing          ║
 * ║  §5   UI UTILS         ← toast, modal, nav, particles      ║
 * ║  §6   SETTINGS         ← Firestore real-time sync          ║
 * ║  §7   AUTH             ← email/password only, no guest     ║
 * ║  §8   DATA             ← Firestore CRUD, addCoins, deduct  ║
 * ║  §9   SPONSORS         ← 5-slot ad manager + zone logic    ║
 * ║  §10  ADS              ← showVideoAd, double-reward system ║
 * ║  §11  STREAK           ← sequential 7-day, ad-gate        ║
 * ║  §12  PAGES            ← Home, Games, Shop, Earn, Profile  ║
 * ║  §13  SHOP             ← user buy flow                     ║
 * ║  §14  EARN             ← video ads, tasks, referral        ║
 * ║  §15  ADMIN            ← hardcoded email guard             ║
 * ║  §16  GAMES (10 total) ← all game logic — UNTOUCHED        ║
 * ║  §17  BOOT             ← entry point                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

/* ══════════════════════════════════════════════════════════════
   §0  FIREBASE CONFIG
   ▶ Replace these values with your new Firebase project keys.
   ▶ Find them: Firebase Console → Project Settings → Your Apps
══════════════════════════════════════════════════════════════ */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi_S-XjK7u8D8T7i4z9p5k4m2n1o0p9q8",
  authDomain: "labb-v6.firebaseapp.com",
  projectId: "labb-v6",
  storageBucket: "labb-v6.appspot.com",
  messagingSenderId: "1071286958444",
  appId: "1:1071286958444:web:0d359c1c6186940082f718",
  measurementId: "G-D1H5S0J1H8"
};

// 

/* ══════════════════════════════════════════════════════════════
   §0b  ADMIN EMAIL — hardcoded, never changes
   Only this exact email gets Admin tab + all admin functions.
══════════════════════════════════════════════════════════════ */
var ADMIN_EMAIL = "yannaing.yannaingynt@gmail.com";

/* ══════════════════════════════════════════════════════════════
   §1  FIREBASE INIT
   Runs synchronously the instant app.js is parsed.
   window.AUTH, window.DB, window.FSV are set BEFORE any
   async code runs — this prevents "firebase is not defined".
══════════════════════════════════════════════════════════════ */
(function FIREBASE_INIT() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    window.AUTH = firebase.auth();
    window.DB   = firebase.firestore();
    window.FSV  = firebase.firestore.FieldValue;
    window.FB   = true;
    console.log('[LABB v6] Firebase 9.23.0 compat — OK');
  } catch(e) {
    window.FB = false;
    console.error('[LABB v6] Firebase init FAILED:', e.message);
  }
}());

/* ══════════════════════════════════════════════════════════════
   §2  GLOBAL STATE
   One single S object. Never duplicate state elsewhere.
══════════════════════════════════════════════════════════════ */
var S = {
  uid:      null,
  email:    null,
  user:     null,        // live Firestore user doc (local copy)
  isAdmin:  false,
  lang:     'en',        // 'en' | 'my'
  tab:      'home',
  authDone: false,       // guard against onAuthStateChanged double-fire

  shopItems:   [],
  settings:    null,     // globalSettings from Firestore
  sponsors:    [],       // up to 5 sponsor objects from Firestore
  settingsUnsub: null,

  // scratch-pad
  editUID:   '',
  editName:  '',
  buyItemId: null,
  pendingDoubleReward: 0,   // coins to double after ad
  pendingDoubleDesc:   '',
  popupShownThisSession: false,

  // 3-gate loader
  loaded: { auth: false, settings: false, shop: false }
};

/* ══════════════════════════════════════════════════════════════
   §3  I18N  — English + Burmese string table
══════════════════════════════════════════════════════════════ */
var I18N = {
  en: {
    // Auth
    signin:'Sign In', register:'Register',
    lbl_email:'Email', lbl_pass:'Password', lbl_name:'Display Name',
    btn_signin:'Sign In →', btn_register:'Create Account →',
    auth_sub:'Your Daily Coin Earning Hub',
    switch_lang:'မြန်မာ',
    // Nav
    nav_home:'Home', nav_games:'Games', nav_shop:'Shop',
    nav_earn:'Earn', nav_me:'Me',
    // Streak
    checkin_btn:'🔥 Check In',
    checkin_done:'✓ Claimed today',
    daily_title:'Unlock Daily Reward',
    daily_sub:'Watch a short ad to claim your reward.',
    daily_claim:'Claim Reward',
    daily_cancel:'Cancel',
    // Double reward
    dbl_title:'Double Your Reward!',
    dbl_sub:'Watch a short ad to 2× your coins.',
    dbl_claim:'Claim 2× Reward',
    dbl_skip:'No thanks, keep original',
    // Shop
    buy_cost:'Cost', buy_bal:'Your Balance',
    // Profile
    hist_title:'🪙 Coin History',
    // Popup
    popup_skip:'Skip',
    // Misc
    welcome:'Welcome back,',
    coins:'COINS', earned:'EARNED', streak:'STREAK',
    day:'Day'
  },
  my: {
    // Auth
    signin:'အကောင့်ဝင်ရန်', register:'စာရင်းသွင်းရန်',
    lbl_email:'အီးမေးလ်', lbl_pass:'စကားဝှက်', lbl_name:'အမည်',
    btn_signin:'အကောင့်ဝင်ရန် →', btn_register:'အကောင့်ဖွင့်ရန် →',
    auth_sub:'နေ့စဉ် Coin ရှာဖွေသောနေရာ',
    switch_lang:'English',
    // Nav
    nav_home:'ပင်မ', nav_games:'ဂိမ်းများ', nav_shop:'ဆိုင်',
    nav_earn:'ငွေရှာ', nav_me:'ကျွန်တော်',
    // Streak
    checkin_btn:'🔥 Check In လုပ်ရန်',
    checkin_done:'✓ ယနေ့ ရယူပြီးပြီ',
    daily_title:'နေ့စဉ်ဆုကြေး ဖွင့်ရန်',
    daily_sub:'ကြော်ငြာတစ်ပုဒ်ကြည့်ပြီး ဆုကြေးရယူပါ။',
    daily_claim:'ဆုကြေးရယူရန်',
    daily_cancel:'မလုပ်တော့ပါ',
    // Double reward
    dbl_title:'ဆုကြေး နှစ်ဆ!',
    dbl_sub:'ကြော်ငြာကြည့်ပြီး Coin နှစ်ဆ ရယူပါ။',
    dbl_claim:'နှစ်ဆ ရယူရန်',
    dbl_skip:'မလိုပါ၊ မူလပမာဏဆက်ထားရန်',
    // Shop
    buy_cost:'စျေးနှုန်း', buy_bal:'သင့်လက်ကျန်',
    // Profile
    hist_title:'🪙 Coin မှတ်တမ်း',
    // Popup
    popup_skip:'ကျော်ရန်',
    // Misc
    welcome:'ကြိုဆိုပါသည်,',
    coins:'COINS', earned:'ရရှိပြီး', streak:'ဆက်တိုက်',
    day:'ရက်'
  }
};

function _t(k) {
  return (I18N[S.lang] || I18N.en)[k] || (I18N.en[k] || k);
}

/* ══════════════════════════════════════════════════════════════
   §4  APP CONTROLLER — language selection + screen routing
══════════════════════════════════════════════════════════════ */
var App = (function() {

  // Called from language select screen buttons
  function setLang(lang) {
    S.lang = lang;
    localStorage.setItem('labb_lang', lang);
    _applyLang();
    // Hide lang screen, show loading, start boot
    UI.hide('screen-lang');
    UI.show('screen-loading');
    Boot.init();
  }

  // Toggle between en/my (available on auth screen and in-app)
  function toggleLang() {
    S.lang = S.lang === 'en' ? 'my' : 'en';
    localStorage.setItem('labb_lang', S.lang);
    _applyLang();
    // Re-render current page if app is running
    if (!document.getElementById('screen-app').classList.contains('hidden')) {
      Pages.render(S.tab);
      UI.refreshCoins();
    }
  }

  function _applyLang() {
    var ismy = S.lang === 'my';
    // Body class for Burmese font
    document.body.classList.toggle('lang-my', ismy);

    // Update lang button labels
    var lb = document.getElementById('lang-btn');
    if (lb) lb.textContent = S.lang.toUpperCase();
    var alb = document.getElementById('auth-lang-lbl');
    if (alb) alb.textContent = _t('switch_lang');

    // Apply all data-i translations visible in DOM
    document.querySelectorAll('[data-i]').forEach(function(el) {
      var key = el.getAttribute('data-i');
      if (_t(key) !== key) el.textContent = _t(key);
    });

    // Auth screen strings
    _setText('auth-sub-txt',    _t('auth_sub'));
    _setText('lbl-signin',      _t('signin'));
    _setText('lbl-register',    _t('register'));
    _setText('lbl-email',       _t('lbl_email'));
    _setText('lbl-pass',        _t('lbl_pass'));
    _setText('lbl-name',        _t('lbl_name'));
    _setText('btn-go-signin',   _t('btn_signin'));
    _setText('btn-go-register', _t('btn_register'));

    // Modal strings
    _setText('dbl-title',       _t('dbl_title'));
    _setText('dbl-sub',         _t('dbl_sub'));
    _setText('dbl-claim-lbl',   _t('dbl_claim'));
    _setText('dbl-skip-lbl',    _t('dbl_skip'));
    _setText('daily-ad-title',  _t('daily_title'));
    _setText('daily-ad-sub',    _t('daily_sub'));
    _setText('daily-claim-lbl', _t('daily_claim'));
    _setText('daily-cancel-lbl',_t('daily_cancel'));
    _setText('hist-title',      _t('hist_title'));
    _setText('popup-skip-lbl',  _t('popup_skip'));
    _setText('buy-cost-lbl',    _t('buy_cost'));
    _setText('buy-bal-lbl',     _t('buy_bal'));
  }

  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Called on page load — check saved lang or show selector
  function initLang() {
    var saved = localStorage.getItem('labb_lang');
    if (saved === 'en' || saved === 'my') {
      S.lang = saved;
      _applyLang();
      // Skip language screen, go straight to loading
      UI.hide('screen-lang');
      UI.show('screen-loading');
      Boot.init();
    }
    // else: screen-lang is already visible (default in HTML)
  }

  return { setLang, toggleLang, initLang };
}());

/* ══════════════════════════════════════════════════════════════
   §5  UI UTILITIES
══════════════════════════════════════════════════════════════ */
var UI = (function() {

  function show(id) { var e=document.getElementById(id); if(e) e.classList.remove('hidden'); }
  function hide(id) { var e=document.getElementById(id); if(e) e.classList.add('hidden'); }
  function openModal(id)  { show(id); }
  function closeModal(id) { hide(id); }
  function oclose(e, id)  { if(e.target===e.currentTarget) closeModal(id); }

  function setLoad(msg, pct) {
    var s=document.getElementById('ld-status'), b=document.getElementById('ld-bar');
    if(s) s.textContent = msg||'';
    if(b && pct!==undefined) b.style.width = pct+'%';
  }

  var _tt = null;
  function toast(msg, type) {
    var el=document.getElementById('toast'); if(!el) return;
    el.textContent = msg;
    el.className = 'show '+(type||'ok');
    clearTimeout(_tt);
    _tt = setTimeout(function(){ el.className=''; }, 2900);
  }

  function coinPop(n) {
    var el=document.createElement('div');
    el.className='coin-pop';
    el.textContent='+'+n+' 🪙';
    el.style.cssText='left:'+(window.innerWidth/2-32)+'px;top:'+(window.innerHeight/2-20)+'px';
    document.body.appendChild(el);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 1200);
  }

  function nav(tab) {
    ['home','games','shop','earn','profile','admin'].forEach(function(t){
      hide('pg-'+t);
      var b=document.getElementById('bn-'+t); if(b) b.classList.remove('active');
    });
    show('pg-'+tab);
    var btn=document.getElementById('bn-'+tab); if(btn) btn.classList.add('active');
    S.tab = tab;
    Pages.render(tab);
  }

  function refreshCoins() {
    var e=document.getElementById('hdr-coins');
    if(e && S.user) e.textContent=(S.user.coins||0).toLocaleString();
  }

  // Open coin history modal and populate it
  function openHistModal() {
    var u=S.user; if(!u) return;
    var h=(u.coinHistory||[]).slice(0,40);
    var el=document.getElementById('hist-list'); if(!el) return;
    el.innerHTML = h.length ? h.map(function(x){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bd)">' +
        '<div><div style="font-size:13px;font-weight:600">'+_esc(x.desc)+'</div>' +
        '<div style="font-size:11px;color:var(--t2);margin-top:1px">'+x.date+'</div></div>' +
        '<div class="mono" style="font-size:13px;color:'+(x.amt<0?'var(--rose)':'var(--amber)')+';font-weight:700">'+(x.amt>0?'+':'')+x.amt+'</div>' +
      '</div>';
    }).join('') : '<div class="tmut tc" style="padding:20px">No history yet</div>';
    openModal('modal-history');
  }

  function initParticles() {
    var cv=document.getElementById('pcv'); if(!cv) return;
    cv.width=window.innerWidth; cv.height=window.innerHeight;
    var ctx=cv.getContext('2d');
    var cols=['#F0A500','#00D4C8','#7C5CFC','#40C8F0','#fff'];
    var pts=[];
    for(var i=0;i<28;i++){
      pts.push({
        x:Math.random()*cv.width, y:Math.random()*cv.height,
        r:Math.random()*1.4+0.3,
        vx:(Math.random()-.5)*.22, vy:(Math.random()-.5)*.22,
        c:cols[i%cols.length], a:Math.random()*.6+.1,
        da:(Math.random()*.008+.003)*(Math.random()<.5?1:-1)
      });
    }
    function frame(){
      ctx.clearRect(0,0,cv.width,cv.height);
      pts.forEach(function(p){
        p.x+=p.vx; p.y+=p.vy; p.a+=p.da;
        if(p.a>.7||p.a<.08) p.da*=-1;
        if(p.x<0) p.x=cv.width; if(p.x>cv.width) p.x=0;
        if(p.y<0) p.y=cv.height; if(p.y>cv.height) p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=p.c; ctx.globalAlpha=p.a; ctx.fill(); ctx.globalAlpha=1;
      });
      requestAnimationFrame(frame);
    }
    frame();
    window.addEventListener('resize',function(){ cv.width=window.innerWidth; cv.height=window.innerHeight; });
  }

  return { show, hide, openModal, closeModal, oclose, setLoad, toast, coinPop, nav, refreshCoins, openHistModal, initParticles };
}());

/* ══════════════════════════════════════════════════════════════
   §6  SETTINGS MODULE — real-time Firestore sync
══════════════════════════════════════════════════════════════ */
var Settings = (function() {

  var DEFAULTS = {
    adsEnabled: true,
    adRewards: { short:25, long:50, full:100 },
    doubleRewardDuration: 15,
    games: {
      wheel:    { enabled:true, reward:100 },
      scratch:  { enabled:true, reward:75  },
      math:     { enabled:true, reward:40  },
      dice:     { enabled:true, reward:50  },
      slots:    { enabled:true, reward:120 },
      cardflip: { enabled:true, reward:60  },
      numguess: { enabled:true, reward:80  },
      rps:      { enabled:true, reward:30  },
      wordscram:{ enabled:true, reward:45  },
      cointoss: { enabled:true, reward:25  }
    },
    leaderboardPrizes: { first:500, second:300, third:150 },
    dailyBuyLimit: 5
  };

  function get(path) {
    var parts=path.split('.');
    var src=(S.settings)||DEFAULTS;
    var val=src;
    for(var i=0;i<parts.length;i++) val=val?val[parts[i]]:undefined;
    if(val===undefined){
      val=DEFAULTS;
      for(var j=0;j<parts.length;j++) val=val?val[parts[j]]:undefined;
    }
    return val;
  }

  function load() {
    if(!window.FB||!window.DB){ S.settings=DEFAULTS; _mark(); return; }
    UI.setLoad('Loading settings...', 50);
    S.settingsUnsub = window.DB.collection('meta').doc('globalSettings')
      .onSnapshot(function(snap){
        S.settings = snap.exists ? snap.data() : JSON.parse(JSON.stringify(DEFAULTS));
        if(!snap.exists && S.isAdmin){
          window.DB.collection('meta').doc('globalSettings').set(S.settings).catch(function(){});
        }
        _mark();
        // live-refresh current page when settings change
        if(S.loaded.auth && S.loaded.shop) Pages.render(S.tab);
      }, function(){ S.settings=DEFAULTS; _mark(); });
  }

  function _mark(){
    if(!S.loaded.settings){ S.loaded.settings=true; Boot.tryLaunch(); }
  }

  function gameEnabled(id){ return get('games.'+id+'.enabled')!==false; }
  function gameReward(id) { return get('games.'+id+'.reward')||25; }

  return { get, load, gameEnabled, gameReward, DEFAULTS };
}());

/* ══════════════════════════════════════════════════════════════
   §7  AUTH MODULE — email/password ONLY
   No guest mode. onAuthStateChanged with double-fire guard.
   Hard 9s failsafe prevents infinite loading screen.
══════════════════════════════════════════════════════════════ */
var Auth = (function() {

  function tab(which) {
    ['in','up'].forEach(function(x){
      document.getElementById('tsw-'+x).classList.remove('active');
      UI.hide('panel-'+x);
    });
    document.getElementById('tsw-'+which).classList.add('active');
    UI.show('panel-'+which);
    _err('');
  }

  function _err(msg) { var e=document.getElementById('auth-err'); if(e) e.textContent=msg; }

  function _clean(msg) {
    if(!msg) return 'An error occurred';
    msg=msg.replace('Firebase: ','').replace(/\(auth\/[^)]+\)/g,'').trim();
    if(/user-not-found|wrong-password|invalid-credential/.test(msg)) return S.lang==='my'?'အီးမေးလ် သို့ စကားဝှက် မှားသည်':'Wrong email or password';
    if(/email-already/.test(msg)) return S.lang==='my'?'ဤအီးမေးလ် မှတ်ပုံတင်ပြီးသည်':'Email already registered';
    if(/weak-password/.test(msg))  return S.lang==='my'?'စကားဝှက် ၆ လုံးနှင့် အထက်ဖြစ်ရမည်':'Password must be 6+ chars';
    if(/network/.test(msg))        return S.lang==='my'?'ကွန်ရက်ချိတ်ဆက်မှု မအောင်မြင်':'Network error';
    return msg;
  }

  function signIn() {
    var em=(document.getElementById('si-email')||{}).value||'';
    var pw=(document.getElementById('si-pass')||{}).value||'';
    em=em.trim();
    if(!em||!pw){ _err(S.lang==='my'?'အချက်အလက်အားလုံး ဖြည့်ပါ':'Please fill all fields'); return; }
    if(!window.FB||!window.AUTH){ _err('Firebase unavailable'); return; }
    _err('');
    window.AUTH.signInWithEmailAndPassword(em,pw)
      .catch(function(e){ _err(_clean(e.message)); });
  }

  function signUp() {
    var nm=(document.getElementById('su-name')||{}).value||'';
    var em=(document.getElementById('su-email')||{}).value||'';
    var pw=(document.getElementById('su-pass')||{}).value||'';
    nm=nm.trim(); em=em.trim();
    if(!nm||!em||!pw){ _err(S.lang==='my'?'အချက်အလက်အားလုံး ဖြည့်ပါ':'Please fill all fields'); return; }
    if(pw.length<6){ _err(S.lang==='my'?'စကားဝှက် ၆ လုံးနှင့် အထက်ဖြစ်ရမည်':'Password must be 6+ chars'); return; }
    if(!window.FB||!window.AUTH){ _err('Firebase unavailable'); return; }
    _err('');
    window.AUTH.createUserWithEmailAndPassword(em,pw)
      .then(function(cred){
        cred.user.updateProfile({ displayName:nm }).catch(function(){});
        Data.createUser(cred.user.uid, nm, em);
      })
      .catch(function(e){ _err(_clean(e.message)); });
  }

  function initListener() {
    if(!window.FB||!window.AUTH){
      UI.setLoad('Offline — please check connection', 80);
      setTimeout(function(){
        S.loaded.auth=true;
        UI.hide('screen-loading');
        UI.show('screen-auth');
      }, 800);
      return;
    }

    // Hard failsafe: never hang > 9s
    var failsafe=setTimeout(function(){
      if(!S.authDone){
        S.authDone=true; S.loaded.auth=true;
        UI.hide('screen-loading');
        UI.show('screen-auth');
      }
    }, 9000);

    window.AUTH.onAuthStateChanged(function(fu){
      if(S.authDone) return;       // guard double-fire
      S.authDone=true;
      clearTimeout(failsafe);

      if(fu){
        S.uid   = fu.uid;
        S.email = fu.email||'';
        S.isAdmin = (S.email===ADMIN_EMAIL);
        UI.setLoad('Loading profile...', 70);

        // Load sponsors in parallel with user data
        Sponsors.load();

        Data.getUser(fu.uid, function(doc){
          if(!doc) doc=Data.createUser(fu.uid, fu.displayName||'Player', fu.email||'');
          S.user=doc; S.user.uid=fu.uid;
          S.loaded.auth=true;
          Boot.tryLaunch();
        });
      } else {
        // Not signed in — show auth screen (NO guest bypass)
        S.loaded.auth=true;
        UI.hide('screen-loading');
        UI.show('screen-auth');
      }
    });
  }

  function signOut() {
    if(S.settingsUnsub){ S.settingsUnsub(); S.settingsUnsub=null; }
    if(window.AUTH) window.AUTH.signOut().catch(function(){});
    // Reset all state
    S.user=null; S.uid=null; S.email=null;
    S.isAdmin=false; S.authDone=false; S.popupShownThisSession=false;
    S.loaded={ auth:false, settings:false, shop:false };
    UI.hide('screen-app');
    UI.show('screen-auth');
  }

  return { tab, signIn, signUp, initListener, signOut };
}());

/* ══════════════════════════════════════════════════════════════
   §8  DATA MODULE — Firestore CRUD
══════════════════════════════════════════════════════════════ */
var Data = (function() {

  function createUser(uid, name, email) {
    var doc={
      uid:uid, name:name||'Player', email:email||'',
      coins:100, level:1, xp:0,
      // Sequential streak: nextDay=1 means they need to claim Day 1 next
      // lastClaimTs=0 means never claimed
      nextDay:1, lastClaimTs:0,
      gamesPlayed:0, totalEarned:100,
      role: email===ADMIN_EMAIL?'admin':'user',
      dailyPurchases:{},
      coinHistory:[{desc:'Welcome Bonus', amt:100, date:_dl()}]
    };
    if(window.FB&&window.DB)
      window.DB.collection('users').doc(uid).set(doc).catch(function(){});
    return doc;
  }

  function getUser(uid, cb) {
    if(!window.FB||!window.DB){ cb(null); return; }
    window.DB.collection('users').doc(uid).get()
      .then(function(snap){
        cb(snap.exists ? Object.assign({uid:uid}, snap.data()) : null);
      })
      .catch(function(){ cb(null); });
  }

  function save(fields) {
    if(!window.FB||!window.DB||!S.uid) return;
    window.DB.collection('users').doc(S.uid).update(fields).catch(function(){});
  }

  function addCoins(amount, desc) {
    var u=S.user; if(!u||amount<=0) return;
    u.coins=(u.coins||0)+amount;
    u.totalEarned=(u.totalEarned||0)+amount;
    u.gamesPlayed=(u.gamesPlayed||0)+1;
    var xp=Math.floor(amount*1.5);
    u.xp=(u.xp||0)+xp;
    var newLv=Math.floor(u.xp/500)+1;
    if(newLv>(u.level||1)){
      u.level=newLv;
      UI.toast('🎉 Level Up! LV '+newLv, 'warn');
    }
    u.coinHistory=[{desc:desc, amt:amount, date:_dl()}]
      .concat(u.coinHistory||[]).slice(0,60);
    UI.refreshCoins();
    UI.coinPop(amount);
    if(window.FB&&window.DB&&S.uid){
      window.DB.collection('users').doc(S.uid).update({
        coins:    window.FSV.increment(amount),
        totalEarned: window.FSV.increment(amount),
        gamesPlayed: window.FSV.increment(1),
        xp:       window.FSV.increment(xp),
        level:    u.level,
        coinHistory: u.coinHistory
      }).catch(function(){});
    }
  }

  function deductCoins(amount, desc) {
    var u=S.user; if(!u||(u.coins||0)<amount) return false;
    u.coins-=amount;
    u.coinHistory=[{desc:'−'+desc, amt:-amount, date:_dl()}]
      .concat(u.coinHistory||[]).slice(0,60);
    UI.refreshCoins();
    if(window.FB&&window.DB&&S.uid){
      window.DB.collection('users').doc(S.uid).update({
        coins:    window.FSV.increment(-amount),
        coinHistory: u.coinHistory
      }).catch(function(){});
    }
    return true;
  }

  return { createUser, getUser, save, addCoins, deductCoins };
}());

/* ══════════════════════════════════════════════════════════════
   §9  SPONSORS MODULE
   ─────────────────────────────────────────────────────────────
   Up to 5 sponsor slots. Each slot:
     { id, name, mediaUrl, mediaType, zone, active }
   mediaType: 'image' | 'gif' | 'video' | 'url'
   zone: 'Startup_Popup' | 'Home_Banner' | 'Game_Reward_Double' | 'Daily_Reward'

   GOOGLE AD SAFETY RULE:
   When a sponsor is active in a zone, the corresponding Google
   Ad element for that zone is HIDDEN. When no active sponsor,
   the Google Ad is shown instead.
══════════════════════════════════════════════════════════════ */
var Sponsors = (function() {

  // Zone → { sponsorSlot, googleSlot }
  var ZONE_MAP = {
    'Startup_Popup':       { sponsor:'popup-content',       google:null },
    'Home_Banner':         { sponsor:'home-banner-content', google:'google-home-banner', wrap:'home-banner-wrap' },
    'Game_Reward_Double':  { sponsor:'dbl-sponsor-content', google:'dbl-google-slot',    sponsorWrap:'dbl-sponsor-slot' },
    'Daily_Reward':        { sponsor:'daily-sponsor-content',google:'daily-google-slot', sponsorWrap:'daily-sponsor-slot' }
  };

  function load() {
    if(!window.FB||!window.DB){ return; }
    window.DB.collection('meta').doc('sponsors').get()
      .then(function(snap){
        S.sponsors = snap.exists ? (snap.data().slots||[]) : [];
        _applyAll();
      })
      .catch(function(){ S.sponsors=[]; });
  }

  function _applyAll() {
    // Reset all zones first
    Object.keys(ZONE_MAP).forEach(function(zone){ _applyZone(zone); });
    // Show startup popup if applicable
    _triggerStartupPopup();
  }

  function _applyZone(zone) {
    var zm=ZONE_MAP[zone]; if(!zm) return;
    // Find active sponsor for this zone
    var sp=S.sponsors.find(function(s){ return s.zone===zone && s.active; });

    if(zone==='Startup_Popup') return; // handled separately
    if(zone==='Home_Banner'){
      if(sp){
        // Show sponsor banner, hide Google Ad
        var wEl=document.getElementById('home-banner-wrap');
        var cEl=document.getElementById('home-banner-content');
        var gEl=document.getElementById('google-home-banner');
        if(cEl) cEl.innerHTML=_mediaHtml(sp, 'home-banner');
        if(wEl) wEl.classList.remove('hidden');
        if(gEl) gEl.classList.add('hidden');
      } else {
        // No sponsor: hide sponsor banner, show Google Ad placeholder
        var wEl2=document.getElementById('home-banner-wrap');
        var gEl2=document.getElementById('google-home-banner');
        if(wEl2) wEl2.classList.add('hidden');
        if(gEl2) gEl2.classList.remove('hidden');
      }
      return;
    }
    // For modal-embedded zones (Game_Reward_Double, Daily_Reward)
    var sSl=zm.sponsorWrap ? document.getElementById(zm.sponsorWrap) : null;
    var gSl=zm.google ? document.getElementById(zm.google) : null;
    var sCt=zm.sponsor ? document.getElementById(zm.sponsor) : null;
    if(sp){
      if(sCt) sCt.innerHTML=_mediaHtml(sp, 'modal-sponsor');
      if(sSl) sSl.classList.remove('hidden');
      if(gSl) gSl.classList.add('hidden');
    } else {
      if(sSl) sSl.classList.add('hidden');
      if(gSl) gSl.classList.remove('hidden');
    }
  }

  function _triggerStartupPopup() {
    if(S.popupShownThisSession) return;
    var sp=S.sponsors.find(function(s){ return s.zone==='Startup_Popup' && s.active; });
    if(!sp) return;
    var el=document.getElementById('popup-content'); if(!el) return;
    el.innerHTML='<div class="sponsor-media-box" style="margin-bottom:12px">'+_mediaHtml(sp,'popup')+'</div>' +
      (sp.name?'<div style="font-size:13px;color:var(--t1);text-align:center">'+_esc(sp.name)+'</div>':'');
    S.popupShownThisSession=true;
    UI.show('screen-popup');
  }

  function closePopup() {
    UI.hide('screen-popup');
  }

  // Re-apply a single zone (called after admin saves sponsors)
  function applyZone(zone) { _applyZone(zone); }

  // Returns true if an active sponsor exists for the given zone
  function hasActiveSponsor(zone) {
    return S.sponsors.some(function(s){ return s.zone===zone && s.active; });
  }

  function _mediaHtml(sp, ctx) {
    var url=sp.mediaUrl||'';
    var type=sp.mediaType||'image';
    var style=ctx==='home-banner'?'style="width:100%;max-height:80px;object-fit:cover"'
              :ctx==='popup'?'style="width:100%;max-height:200px;object-fit:contain"'
              :'style="width:100%;max-height:160px;object-fit:contain"';
    if(!url) return '<div style="padding:20px;text-align:center;color:var(--t2);font-size:12px">No media URL</div>';
    if(type==='video') return '<video '+style+' autoplay muted loop playsinline src="'+_esc(url)+'"></video>';
    if(type==='url')   return '<iframe src="'+_esc(url)+'" '+style+' frameborder="0" allowfullscreen></iframe>';
    return '<img '+style+' src="'+_esc(url)+'" alt="'+_esc(sp.name||'Sponsor')+'" />';
  }

  return { load, closePopup, applyZone, hasActiveSponsor, _triggerStartupPopup };
}());

/* ══════════════════════════════════════════════════════════════
   §10  ADS MODULE
   ─────────────────────────────────────────────────────────────
   showVideoAd(options, cb) — simulates ad with progress bar.
   Replace _simulate() with real AdMob/Unity SDK call.

   Double-Reward system:
   After every game win, Games.win() calls Ads.offerDouble(coins).
   This shows modal-double with a countdown.
   On completion → original coins already credited + same again.
   On skip → original coins only (already given by Games.win).
══════════════════════════════════════════════════════════════ */
var Ads = (function() {

  var _pendingCb=null, _pendingReward=0, _iv=null;

  function showVideoAd(options, cb) {
    if(!Settings.get('adsEnabled')){ UI.toast('Ads are disabled','warn'); cb({completed:false,reward:0}); return; }
    _simulate(options, cb);
    /*
     * ── TO INTEGRATE REAL AD NETWORK ──────────────────────────
     * Replace _simulate(options, cb) with your SDK call, e.g.:
     *
     * AdMob (Capacitor):
     *   AdMob.prepareRewardVideoAd({ adId:'ca-app-pub-xxx/yyy' })
     *     .then(()=> AdMob.showRewardVideoAd())
     *     .then(()=> cb({ completed:true, reward:options.reward }))
     *     .catch(()=> cb({ completed:false, reward:0 }));
     *
     * Unity Ads:
     *   UnityAds.show('rewardedVideo', result =>
     *     cb({ completed: result==='completed', reward: options.reward }));
     * ──────────────────────────────────────────────────────────
     */
  }

  function _simulate(options, cb) {
    var dur=options.duration||15, reward=options.reward||25;
    var progEl=options.progId ? document.getElementById(options.progId) : null;
    var timerEl=options.timerId ? document.getElementById(options.timerId) : null;
    var claimBtn=options.claimId ? document.getElementById(options.claimId) : null;
    if(progEl) progEl.style.width='0%';
    if(timerEl) timerEl.textContent=dur+'s remaining';
    if(claimBtn){ claimBtn.disabled=true; claimBtn.style.opacity='.42'; }
    _pendingCb=cb; _pendingReward=reward;
    var elapsed=0;
    clearInterval(_iv);
    _iv=setInterval(function(){
      elapsed++;
      if(progEl) progEl.style.width=Math.min(elapsed/dur*100,100)+'%';
      if(timerEl) timerEl.textContent=Math.max(dur-elapsed,0)+'s remaining';
      if(elapsed>=dur){
        clearInterval(_iv);
        if(timerEl) timerEl.textContent='✓ Complete! Claim your reward.';
        if(claimBtn){ claimBtn.disabled=false; claimBtn.style.opacity='1'; }
      }
    },1000);
  }

  /* ── Double-reward flow (triggered after game win) ── */
  function offerDouble(coins, desc) {
    if(!Settings.get('adsEnabled')){ return; } // no ad system = no double offer
    S.pendingDoubleReward=coins;
    S.pendingDoubleDesc=desc;
    var dur=Settings.get('doubleRewardDuration')||15;
    // Apply sponsor/Google safety for this zone
    Sponsors.applyZone('Game_Reward_Double');
    UI.openModal('modal-double');
    // Run the ad simulation using the double modal's elements
    _simulate({
      duration:dur, reward:coins,
      progId:'dbl-prog', timerId:'dbl-timer', claimId:'dbl-claim-btn'
    }, function(){}); // cb is unused; claim/skip handle it
  }

  function claimDouble() {
    clearInterval(_iv);
    UI.closeModal('modal-double');
    var extra=S.pendingDoubleReward;
    var desc=S.pendingDoubleDesc;
    S.pendingDoubleReward=0; S.pendingDoubleDesc='';
    if(extra>0){ Data.addCoins(extra, desc+' (2×)'); UI.toast('🎉 2× — +'+extra+' 🪙 bonus!'); }
  }

  function skipDouble() {
    clearInterval(_iv);
    UI.closeModal('modal-double');
    S.pendingDoubleReward=0; S.pendingDoubleDesc='';
    UI.toast('Reward kept as original 🪙','warn');
  }

  /* ── Generic Earn page ad ── */
  function runEarnAd(type, progId, timerId, claimId) {
    var dur={short:10,long:30,full:60}[type]||10;
    var rw=Settings.get('adRewards.'+type)||25;
    _simulate({ duration:dur, reward:rw, progId:progId, timerId:timerId, claimId:claimId },
      function(res){ if(res.completed){ Data.addCoins(res.reward,'Video Ad'); UI.toast('+'+res.reward+' 🪙'); }});
  }

  return { showVideoAd, offerDouble, claimDouble, skipDouble, runEarnAd };
}());

/* ══════════════════════════════════════════════════════════════
   §11  STREAK MODULE — Sequential 7-day system
   ─────────────────────────────────────────────────────────────
   RULES:
   • Days are Day 1–7 (not Mon–Sun calendar days).
   • User claims Day 1, then Day 2, etc., always in sequence.
   • Skip days? You still only get the NEXT day in sequence.
   • Each claim requires watching an ad (ad-gate via modal-daily-ad).
   • One claim per 24 hours enforced via lastClaimTs timestamp.
   • After Day 7 → resets to Day 1 automatically.
   • Rewards escalate: Day1=50, Day2=75, Day3=100, Day4=125,
     Day5=150, Day6=200, Day7=300
══════════════════════════════════════════════════════════════ */
var Streak = (function() {

  var REWARDS=[0, 50, 75, 100, 125, 150, 200, 300]; // index 1–7

  function canClaim() {
    var u=S.user; if(!u) return false;
    var ts=u.lastClaimTs||0;
    var elapsed=Date.now()-ts;
    return elapsed >= 86400000; // 24 hours in ms
  }

  function hoursUntilNext() {
    var u=S.user; if(!u) return 0;
    var ts=u.lastClaimTs||0;
    var ms=86400000-(Date.now()-ts);
    return Math.max(0, Math.ceil(ms/3600000));
  }

  function getNextDay() {
    var u=S.user; if(!u) return 1;
    return u.nextDay||1;
  }

  // Called when user taps Check In — opens ad-gate modal
  function startClaim() {
    if(!canClaim()){
      UI.toast('⏰ '+hoursUntilNext()+'h until next claim','warn');
      return;
    }
    var dur=10; // short ad for daily reward
    Sponsors.applyZone('Daily_Reward');
    UI.openModal('modal-daily-ad');
    var progEl=document.getElementById('daily-prog');
    var timerEl=document.getElementById('daily-timer');
    var claimBtn=document.getElementById('daily-claim-btn');
    if(progEl) progEl.style.width='0%';
    if(timerEl) timerEl.textContent=dur+'s remaining';
    if(claimBtn){ claimBtn.disabled=true; claimBtn.style.opacity='.42'; }
    var elapsed=0;
    clearInterval(window._dailyAdIv);
    window._dailyAdIv=setInterval(function(){
      elapsed++;
      if(progEl) progEl.style.width=Math.min(elapsed/dur*100,100)+'%';
      if(timerEl) timerEl.textContent=Math.max(dur-elapsed,0)+'s remaining';
      if(elapsed>=dur){
        clearInterval(window._dailyAdIv);
        if(timerEl) timerEl.textContent='✓ Ad complete!';
        if(claimBtn){ claimBtn.disabled=false; claimBtn.style.opacity='1'; }
      }
    },1000);
  }

  // Called when claim button is tapped after ad completes
  function claimAfterAd() {
    clearInterval(window._dailyAdIv);
    UI.closeModal('modal-daily-ad');
    var u=S.user; if(!u) return;
    var day=u.nextDay||1;
    var reward=REWARDS[day]||50;
    var nextDay=(day%7)+1; // cycles 1→2→...→7→1
    u.nextDay=nextDay;
    u.lastClaimTs=Date.now();
    Data.addCoins(reward, _t('day')+' '+day+' Check-In');
    UI.toast('🔥 '+_t('day')+' '+day+'! +'+reward+' 🪙');
    Data.save({ nextDay:nextDay, lastClaimTs:u.lastClaimTs });
    Pages.render('home');
  }

  return { canClaim, hoursUntilNext, getNextDay, startClaim, claimAfterAd, REWARDS };
}());

/* ══════════════════════════════════════════════════════════════
   §12  PAGES MODULE
══════════════════════════════════════════════════════════════ */
var Pages = (function() {

  function render(tab) {
    try {
      ({
        home:    renderHome,
        games:   renderGames,
        shop:    Shop.render,
        earn:    Earn.render,
        profile: renderProfile,
        admin:   Admin.render
      }[tab]||renderHome)();
    } catch(e){ console.warn('Pages.render error:',tab,e); }
  }

  /* ── HOME ── */
  function renderHome() {
    var el=document.getElementById('pg-home'); if(!el||!S.user) return;
    var u=S.user;
    var xpIn=(u.xp||0)%500;
    var day=Streak.getNextDay();
    var canCI=Streak.canClaim();
    var hrs=Streak.hoursUntilNext();
    var RWDS=Streak.REWARDS;

    // Build 7-day reward dots
    var dotsHtml='';
    for(var d=1;d<=7;d++){
      var claimed=(u.nextDay||1)>d; // days before nextDay are claimed
      var isCurrent=d===(u.nextDay||1);
      var state=claimed?'done':(isCurrent?'today':'future');
      var ico=claimed?'✓':(isCurrent?'●':'○');
      dotsHtml+='<div class="sd '+state+'"><span class="sd-day">'+_t('day')+d+'</span>'+ico+'<span style="font-size:8px">+'+RWDS[d]+'</span></div>';
    }

    // Check-in button
    var ciBtn='';
    if(!canCI){
      ciBtn='<button class="btn btn-ghost bfull" disabled>'+_t('checkin_done')+' ('+hrs+'h)</button>';
    } else {
      ciBtn='<button class="btn btn-teal bfull btn-pulse" onclick="Streak.startClaim()">'
        +_t('checkin_btn')+' — Day '+day+' (+'+RWDS[day]+'🪙)</button>';
    }

    el.innerHTML=
      // Hero card
      '<div class="card card-amber mb14" style="padding:20px;background:linear-gradient(135deg,rgba(240,165,0,.07),rgba(0,212,200,.04))">'
        +'<div style="display:flex;align-items:center;gap:13px;margin-bottom:15px">'
          +'<div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,var(--violet),var(--cyan));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0">'+((u.name||'P').charAt(0).toUpperCase())+'</div>'
          +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:12px;color:var(--t2)">'+_t('welcome')+'</div>'
            +'<div style="font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_esc(u.name||'Player')+'</div>'
            +'<div style="margin-top:4px"><span class="lv-chip">LV '+(u.level||1)+'</span>'
              +(S.isAdmin?'<span class="badge bg-rose" style="margin-left:6px">ADMIN</span>':'')+'</div>'
          +'</div>'
          +'<div style="text-align:right;flex-shrink:0">'
            +'<div class="mono" style="font-size:26px;font-weight:700;color:var(--amber);line-height:1">'+(u.coins||0).toLocaleString()+'</div>'
            +'<div style="font-size:10px;color:var(--t2);letter-spacing:1px">'+_t('coins')+'</div>'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">'
          +'<span style="color:var(--t2);text-transform:uppercase;letter-spacing:.5px">XP Progress</span>'
          +'<span class="mono" style="font-size:10px;color:var(--t1)">'+xpIn+'/500</span>'
        +'</div>'
        +'<div class="prog-track"><div class="prog-fill" style="width:'+Math.round(xpIn/500*100)+'%"></div></div>'
      +'</div>'
      // Streak
      +'<div class="sec">🔥 7-Day Rewards</div>'
      +'<div class="card mb14" style="padding:16px">'
        +'<div class="streak-row">'+dotsHtml+'</div>'
        +ciBtn
      +'</div>'
      // Quick play
      +'<div class="sec">⚡ Quick Play</div>'
      +'<div class="games-grid mb14">'
        +_gtile('wheel','🎡','WHEEL SPIN','var(--violet)')
        +_gtile('slots','🎰','SLOTS','var(--rose)')
      +'</div>'
      // Stats
      +'<div class="sec">📊 Stats</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:13px">'
        +_sMini('🎮','Games',u.gamesPlayed||0)
        +_sMini('💰',_t('earned'),(u.totalEarned||0).toLocaleString())
        +_sMini('📅','Streak Day',day-1>0?day-1:0)
      +'</div>'
      // Leaderboard
      +'<div class="sec">🏆 Leaderboard</div>'
      +'<div class="card mb14" id="lb-box" style="padding:14px"><div class="tmut tc" style="padding:8px;font-size:13px">Loading...</div></div>'
      +'<div style="height:8px"></div>';

    _loadLB();
  }

  function _gtile(id,ico,nm,ta){
    var on=Settings.gameEnabled(id);
    return '<div class="gtile'+(on?'':' disabled-tile')+'" style="--ta:'+ta+'" onclick="'+(on?'Games.open(\''+id+'\')':'UI.toast(\'Disabled\',\'warn\')')+'">'
      +(on?'':'<span class="gtile-off"><span class="badge bg-rose" style="font-size:8px">OFF</span></span>')
      +'<span class="gico">'+ico+'</span>'
      +'<div class="gnm">'+nm+'</div>'
      +'<div class="grw">+'+Settings.gameReward(id)+' 🪙</div>'
    +'</div>';
  }

  function _sMini(ic,lb,v){
    return '<div class="stat-mini"><div class="sm-ico">'+ic+'</div><span class="sm-val">'+v+'</span><div class="sm-lbl">'+lb+'</div></div>';
  }

  function _loadLB(){
    var el=document.getElementById('lb-box'); if(!el) return;
    if(!window.FB||!window.DB){ el.innerHTML='<div class="tmut tc" style="padding:10px;font-size:12px">Sign in to see leaderboard</div>'; return; }
    var prizes=Settings.get('leaderboardPrizes')||{first:500,second:300,third:150};
    var prArr=[prizes.first,prizes.second,prizes.third];
    window.DB.collection('users').orderBy('coins','desc').limit(5).get()
      .then(function(snap){
        var el=document.getElementById('lb-box'); if(!el) return;
        var medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
        el.innerHTML=snap.docs.map(function(doc,i){
          var u=doc.data(),isMe=doc.id===S.uid;
          return '<div class="lb-row'+(isMe?'" style="background:rgba(0,212,200,.05);border-radius:8px;padding:10px 8px;margin:-2px -4px':'"')+'>'
            +'<span class="lb-medal">'+medals[i]+'</span>'
            +'<span class="lb-name">'+_esc(u.name||'Player')+'</span>'
            +(i<3?'<span class="lb-prize">+'+prArr[i]+'🪙/wk</span>':'')
            +'<span class="lb-coins mono">'+(u.coins||0).toLocaleString()+'</span>'
          +'</div>';
        }).join('')||'<div class="tmut tc" style="padding:10px">No players yet</div>';
      }).catch(function(){
        var el=document.getElementById('lb-box');
        if(el) el.innerHTML='<div class="tmut tc" style="padding:10px;font-size:12px">Could not load</div>';
      });
  }

  /* ── GAMES ── */
  function renderGames(){
    var el=document.getElementById('pg-games'); if(!el) return;
    var LIST=[
      {id:'wheel',    ico:'🎡',nm:'Wheel Spin',         ta:'var(--violet)'},
      {id:'scratch',  ico:'🎫',nm:'Lucky Scratch',      ta:'var(--amber)'},
      {id:'math',     ico:'🧮',nm:'Math Quiz',           ta:'var(--sky)'},
      {id:'dice',     ico:'🎲',nm:'Dice Roll',            ta:'var(--cyan)'},
      {id:'slots',    ico:'🎰',nm:'Slot Machine',        ta:'var(--rose)'},
      {id:'cardflip', ico:'🃏',nm:'Card Flip',            ta:'var(--amber)'},
      {id:'numguess', ico:'🔢',nm:'Number Guess',        ta:'var(--sky)'},
      {id:'rps',      ico:'✊',nm:'Rock Paper Scissors', ta:'#EC4899'},
      {id:'wordscram',ico:'🔤',nm:'Word Scramble',       ta:'var(--lime)'},
      {id:'cointoss', ico:'🪙',nm:'Coin Toss',            ta:'var(--amber)'}
    ];
    el.innerHTML='<div class="sec">🎮 '+_t('nav_games')+'</div>'
      +'<div class="games-grid">'
      +LIST.map(function(g){
        var on=Settings.gameEnabled(g.id);
        return '<div class="gtile'+(on?'':' disabled-tile')+'" style="--ta:'+g.ta+'" onclick="'+(on?'Games.open(\''+g.id+'\')':'UI.toast(\'Disabled\',\'warn\')')+'">'
          +(on?'':'<span class="gtile-off"><span class="badge bg-rose" style="font-size:8px">OFF</span></span>')
          +'<span class="gico">'+g.ico+'</span>'
          +'<div class="gnm">'+g.nm+'</div>'
          +'<div class="grw">+'+Settings.gameReward(g.id)+' 🪙</div>'
        +'</div>';
      }).join('')+'</div><div style="height:8px"></div>';
  }

  /* ── PROFILE ── */
  var _ps='hist';
  function renderProfile(){
    var el=document.getElementById('pg-profile'); if(!el||!S.user) return;
    var u=S.user, xpIn=(u.xp||0)%500;
    el.innerHTML=
      '<div class="card mb14" style="padding:20px;text-align:center;background:linear-gradient(135deg,rgba(124,92,252,.08),rgba(0,212,200,.05))">'
        +'<div style="width:68px;height:68px;border-radius:20px;background:linear-gradient(135deg,var(--violet),var(--cyan));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 12px;box-shadow:0 0 30px rgba(124,92,252,.3)">'+((u.name||'P').charAt(0).toUpperCase())+'</div>'
        +'<div style="font-size:19px;font-weight:700;margin-bottom:3px">'+_esc(u.name||'Player')+'</div>'
        +'<div style="font-size:12px;color:var(--t1);margin-bottom:10px">'+_esc(u.email||'')+'</div>'
        +'<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">'
          +'<span class="lv-chip">LV '+(u.level||1)+'</span>'
          +(S.isAdmin?'<span class="badge bg-rose">ADMIN</span>':'')
        +'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:13px">'
        +'<div class="card card-amber" style="padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">'+_t('coins')+'</div><div class="mono" style="font-size:24px;color:var(--amber);font-weight:700">'+(u.coins||0).toLocaleString()+'</div></div>'
        +'<div class="card card-cyan"  style="padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">'+_t('earned')+'</div><div class="mono" style="font-size:24px;color:var(--cyan);font-weight:700">'+(u.totalEarned||0).toLocaleString()+'</div></div>'
      +'</div>'
      +'<div class="card mb14" style="padding:14px">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:7px;font-size:12px"><span style="font-weight:600;color:var(--t1)">Level '+(u.level||1)+' Progress</span><span class="mono" style="font-size:11px;color:var(--t2)">'+xpIn+'/500 XP</span></div>'
        +'<div class="prog-track"><div class="prog-fill" style="width:'+Math.round(xpIn/500*100)+'%"></div></div>'
      +'</div>'
      +'<div class="sub-tabs">'
        +'<button class="stab '+(_ps==='hist'?'active':'')+'" onclick="Pages._psSub(\'hist\')">History</button>'
        +'<button class="stab '+(_ps==='stats'?'active':'')+'" onclick="Pages._psSub(\'stats\')">Stats</button>'
        +'<button class="stab '+(_ps==='set'?'active':'')+'"  onclick="Pages._psSub(\'set\')">Settings</button>'
      +'</div>'
      +'<div id="prof-body"></div><div style="height:8px"></div>';
    _renderProfSub(_ps);
  }

  function _psSub(s){ _ps=s; renderProfile(); }
  function _renderProfSub(s){
    var el=document.getElementById('prof-body'); if(!el||!S.user) return;
    var u=S.user;
    if(s==='hist'){
      var h=(u.coinHistory||[]).slice(0,30);
      el.innerHTML='<div class="card" style="padding:14px">'
        +(h.length?h.map(function(x){
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bd)">'
            +'<div><div style="font-size:13px;font-weight:600">'+_esc(x.desc)+'</div><div style="font-size:11px;color:var(--t2);margin-top:1px">'+x.date+'</div></div>'
            +'<div class="mono" style="font-size:13px;color:'+(x.amt<0?'var(--rose)':'var(--amber)')+';font-weight:700">'+(x.amt>0?'+':'')+x.amt+'</div>'
          +'</div>';
        }).join(''):'<div class="tmut tc" style="padding:20px">No history yet</div>')
      +'</div>';
    } else if(s==='stats'){
      el.innerHTML='<div class="card" style="padding:14px">'
        +[['🎮','Games',u.gamesPlayed||0],['💰','Total Earned',(u.totalEarned||0).toLocaleString()],['📅','Day',u.nextDay?u.nextDay-1:0],['⭐','XP',(u.xp||0).toLocaleString()],['🏆','Level',u.level||1]]
        .map(function(r){
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--bd)">'
            +'<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">'+r[0]+'</span><span style="font-size:13px;font-weight:600">'+r[1]+'</span></div>'
            +'<span class="mono" style="font-size:14px;color:var(--amber);font-weight:700">'+r[2]+'</span>'
          +'</div>';
        }).join('')
      +'</div>';
    } else {
      el.innerHTML='<div class="card" style="padding:14px">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--bd);cursor:pointer" onclick="App.toggleLang()">'
          +'<div><div style="font-size:13px;font-weight:700">Language</div><div style="font-size:11px;color:var(--t2)">English / မြန်မာ</div></div>'
          +'<span class="mono" style="color:var(--cyan);font-size:12px;font-weight:700">'+S.lang.toUpperCase()+'</span>'
        +'</div>'
        +'<div style="padding:11px 0;border-bottom:1px solid var(--bd)"><div style="font-size:13px;font-weight:700">App Version</div><div style="font-size:11px;color:var(--t2)">LABB v6 — Firebase 9.23.0 Compat</div></div>'
        +'<button class="btn btn-rose bfull" style="margin-top:14px" onclick="Auth.signOut()">← Sign Out</button>'
      +'</div>';
    }
  }

  return { render, renderHome, renderGames, renderProfile, _psSub };
}());

/* ══════════════════════════════════════════════════════════════
   §13  SHOP MODULE
══════════════════════════════════════════════════════════════ */
var Shop = (function() {

  function render(){
    var el=document.getElementById('pg-shop'); if(!el) return;
    var items=S.shopItems.filter(function(i){ return i.status!=='hidden'; });
    if(!items.length){
      el.innerHTML='<div class="sec">🛍️ '+_t('nav_shop')+'</div>'
        +'<div class="card" style="padding:24px;text-align:center">'
        +'<div style="font-size:48px;margin-bottom:10px">🛍️</div>'
        +'<div style="font-size:15px;font-weight:700;margin-bottom:5px">Shop is empty</div>'
        +'<div class="tmut" style="font-size:13px">Check back soon!</div></div>';
      return;
    }
    el.innerHTML='<div class="sec">🛍️ '+_t('nav_shop')+'</div>'
      +'<div class="shop-grid">'+items.map(_card).join('')+'</div>'
      +'<div style="height:8px"></div>';
  }

  function _card(item){
    var oos=item.status==='out_of_stock'||item.stock<=0;
    var exp=item.expiry&&new Date(item.expiry)<new Date();
    var na=oos||exp;
    var imgH=_imgHtml(item.image,44);
    return '<div class="scard">'
      +'<div class="scard-img">'+imgH+(na?'<div class="oos-tag">'+(exp?'EXPIRED':'OOS')+'</div>':'')+'</div>'
      +'<div class="scard-body">'
        +'<div class="scard-name">'+_esc(item.name)+'</div>'
        +(item.desc?'<div class="scard-desc">'+_esc(item.desc)+'</div>':'')
        +'<div class="scard-meta">Stock: '+(item.stock||0)+(item.expiry?' · Exp:'+item.expiry:'')+'</div>'
      +'</div>'
      +'<div class="scard-foot">'
        +'<span class="scard-price">🪙 '+(item.price||0).toLocaleString()+'</span>'
        +'<button class="btn btn-teal bsm" '+(na?'disabled':'onclick="Shop.openBuy(\''+item.id+'\')"')+'>'+(na?'OOS':'Buy')+'</button>'
      +'</div>'
    +'</div>';
  }

  function openBuy(id){
    var item=S.shopItems.find(function(x){ return x.id===id; }); if(!item) return;
    var limit=Settings.get('dailyBuyLimit')||5;
    var today=new Date().toDateString();
    var dp=(S.user&&S.user.dailyPurchases)||{};
    if((dp[today]||0)>=limit){ UI.toast('Daily limit reached ('+limit+'/day)','err'); return; }
    S.buyItemId=id;
    var imgEl=document.getElementById('buy-img');
    imgEl.innerHTML=_imgHtml(item.image,38);
    document.getElementById('buy-name').textContent=item.name;
    document.getElementById('buy-desc').textContent=item.desc||'';
    document.getElementById('buy-cost').textContent='🪙 '+(item.price||0).toLocaleString();
    document.getElementById('buy-bal').textContent='🪙 '+((S.user&&S.user.coins)||0).toLocaleString();
    UI.openModal('modal-buy');
  }

  function confirmBuy(){
    var item=S.shopItems.find(function(x){ return x.id===S.buyItemId; }); if(!item) return;
    if(!S.user||(S.user.coins||0)<item.price){ UI.toast('Not enough coins!','err'); return; }
    if(item.stock<=0||item.status==='out_of_stock'){ UI.toast('Out of stock!','err'); return; }
    var ok=Data.deductCoins(item.price, item.name); if(!ok){ UI.toast('Not enough coins!','err'); return; }
    var today=new Date().toDateString();
    var dp=S.user.dailyPurchases||{};
    dp[today]=(dp[today]||0)+1; S.user.dailyPurchases=dp;
    item.stock--; if(item.stock<=0) item.status='out_of_stock';
    if(window.FB&&window.DB&&item.id)
      window.DB.collection('shopItems').doc(item.id).update({ stock:window.FSV.increment(-1), status:item.status }).catch(function(){});
    if(window.FB&&window.DB&&S.uid)
      window.DB.collection('users').doc(S.uid).update({ dailyPurchases:dp }).catch(function(){});
    UI.closeModal('modal-buy'); UI.toast('Purchase successful! 🎉'); render();
  }

  function loadShop(){
    if(!window.FB||!window.DB){ S.shopItems=[]; _mark(); return; }
    UI.setLoad('Loading shop...', 88);
    window.DB.collection('shopItems').orderBy('createdAt','desc').get()
      .then(function(snap){
        S.shopItems=snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
        _mark();
      }).catch(function(){ S.shopItems=[]; _mark(); });
  }

  function _mark(){ S.loaded.shop=true; Boot.tryLaunch(); }

  return { render, openBuy, confirmBuy, loadShop };
}());

/* ══════════════════════════════════════════════════════════════
   §14  EARN MODULE
══════════════════════════════════════════════════════════════ */
var Earn = (function() {

  var _earnAdActive=false;

  function render(){
    var el=document.getElementById('pg-earn'); if(!el) return;
    var u=S.user||{};
    var adsOn=Settings.get('adsEnabled');
    var sr=Settings.get('adRewards.short')||25;
    var lr=Settings.get('adRewards.long')||50;
    var fr=Settings.get('adRewards.full')||100;
    el.innerHTML=
      '<div class="sec">📺 '+_t('nav_earn')+(adsOn?'':'  <span class="badge bg-rose" style="margin-left:4px">DISABLED</span>')+'</div>'
      +'<div class="card card-cyan mb12" style="padding:18px">'
        +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
          +'<div style="width:46px;height:46px;border-radius:14px;background:var(--cyan-d);border:1px solid rgba(0,212,200,.3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📺</div>'
          +'<div><div style="font-size:15px;font-weight:700">Video Ads</div><div class="tmut" style="font-size:12px;margin-top:1px">Earn coins for every ad watched</div></div>'
        +'</div>'
        +'<div class="prog-track mb8"><div id="earn-prog" class="prog-fill" style="width:0%"></div></div>'
        +'<p id="earn-timer" class="ad-timer-txt" style="margin-bottom:12px"> </p>'
        +'<div style="display:flex;flex-direction:column;gap:8px">'
          +'<button class="btn btn-teal bfull" '+(adsOn?'':'disabled')+' onclick="Earn.start(\'short\')">▶  Short (10s) — +'+sr+' 🪙</button>'
          +'<button class="btn btn-ghost bfull" '+(adsOn?'':'disabled')+' onclick="Earn.start(\'long\')">▶  Long (30s) — +'+lr+' 🪙</button>'
          +'<button class="btn btn-ghost bfull" '+(adsOn?'':'disabled')+' onclick="Earn.start(\'full\')">▶  Full (60s) — +'+fr+' 🪙</button>'
          +'<button id="earn-claim-btn" class="btn btn-amber bfull hidden" onclick="Earn.claim()">Claim Reward 🪙</button>'
        +'</div>'
      +'</div>'
      +'<div class="sec">✅ Daily Tasks</div>'
      +'<div class="card mb12" style="padding:14px">'
      +[
        {ico:'🎮',lbl:'Play 3 games',rw:30,done:(u.gamesPlayed||0)>=3},
        {ico:'🔥',lbl:'Claim 3 Daily Rewards',rw:75,done:((u.nextDay||1)-1)>=3},
        {ico:'💰',lbl:'Earn 200 coins total',rw:20,done:(u.totalEarned||0)>=200}
      ].map(function(tk){
        return '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)">'
          +'<span style="font-size:20px">'+tk.ico+'</span>'
          +'<div style="flex:1"><div style="font-size:13px;font-weight:600">'+tk.lbl+'</div><div style="font-size:11px;color:var(--t2)">+'+tk.rw+' 🪙</div></div>'
          +'<span class="badge '+(tk.done?'bg-cyan':'bg-amber')+'">'+(tk.done?'✓ DONE':'PENDING')+'</span>'
        +'</div>';
      }).join('')+'</div>'
      +'<div class="sec">👥 Referral</div>'
      +'<div class="card mb12" style="padding:18px;text-align:center">'
        +'<div style="font-size:32px;margin-bottom:8px">🎁</div>'
        +'<div style="font-size:14px;font-weight:700;margin-bottom:4px">Invite Friends &amp; Earn</div>'
        +'<div class="tmut" style="font-size:12px;margin-bottom:14px">+100 🪙 per friend who joins</div>'
        +'<div style="background:var(--s1);border:1px dashed var(--bd2);border-radius:var(--r12);padding:12px;font-family:var(--fm);font-size:14px;letter-spacing:3px;color:var(--cyan);margin-bottom:12px">LABB-'+((S.uid||'000000').slice(-6).toUpperCase())+'</div>'
        +'<button class="btn btn-ghost bfull" onclick="Earn.copyRef()">📋 Copy Code</button>'
      +'</div><div style="height:8px"></div>';
  }

  var _earnReward=0;
  function start(type){
    if(_earnAdActive){ UI.toast('Ad already running','warn'); return; }
    _earnAdActive=true;
    var dur={short:10,long:30,full:60}[type]||10;
    _earnReward=Settings.get('adRewards.'+type)||25;
    var prog=document.getElementById('earn-prog');
    var timer=document.getElementById('earn-timer');
    var claimBtn=document.getElementById('earn-claim-btn');
    if(prog) prog.style.width='0%';
    if(timer) timer.textContent=dur+'s remaining';
    var elapsed=0;
    clearInterval(window._earnIv);
    window._earnIv=setInterval(function(){
      elapsed++;
      if(prog) prog.style.width=Math.min(elapsed/dur*100,100)+'%';
      if(timer) timer.textContent=Math.max(dur-elapsed,0)+'s remaining';
      if(elapsed>=dur){
        clearInterval(window._earnIv);
        if(timer) timer.textContent='✓ Ad complete!';
        if(claimBtn) claimBtn.classList.remove('hidden');
        _earnAdActive=false;
      }
    },1000);
  }

  function claim(){
    var claimBtn=document.getElementById('earn-claim-btn');
    if(claimBtn) claimBtn.classList.add('hidden');
    var prog=document.getElementById('earn-prog');
    var timer=document.getElementById('earn-timer');
    if(prog) prog.style.width='0%';
    if(timer) timer.textContent=' ';
    Data.addCoins(_earnReward,'Video Ad Reward');
    UI.toast('+'+_earnReward+' 🪙 earned!');
    _earnReward=0;
  }

  function copyRef(){
    var code='LABB-'+((S.uid||'000000').slice(-6).toUpperCase());
    if(navigator.clipboard) navigator.clipboard.writeText(code).catch(function(){});
    UI.toast('Referral code copied! 📋');
  }

  return { render, start, claim, copyRef };
}());

/* ══════════════════════════════════════════════════════════════
   §15  ADMIN MODULE
   Access strictly limited to ADMIN_EMAIL.
   _guard() is called at the top of every admin function.
══════════════════════════════════════════════════════════════ */
var Admin = (function() {

  function _guard(){
    if(!S.isAdmin){ UI.toast('Admin access denied','err'); return false; } return true;
  }

  /* ── Main admin render ── */
  function render(){
    var el=document.getElementById('pg-admin'); if(!el) return;
    if(!_guard()){ el.innerHTML='<div class="tmut tc" style="padding:40px">⛔ Access Denied</div>'; return; }
    el.innerHTML=
      '<div class="sec">⚙️ Admin Panel</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
        +'<div style="background:var(--rose-d);border:1px solid rgba(240,64,96,.22);border-radius:var(--r16);padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase">USERS</div><div class="mono" id="adm-tu" style="font-size:26px;font-weight:700;color:var(--rose)">—</div></div>'
        +'<div style="background:var(--amber-d);border:1px solid rgba(240,165,0,.22);border-radius:var(--r16);padding:14px;text-align:center"><div style="font-size:10px;color:var(--t2);letter-spacing:1px;text-transform:uppercase">COINS</div><div class="mono" id="adm-tc" style="font-size:26px;font-weight:700;color:var(--amber)">—</div></div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">'
        +'<button class="btn btn-violet bfull" onclick="Admin.openSettings()">⚙️ Global Settings</button>'
        +'<button class="btn btn-teal bfull" onclick="Admin.openSponsors()">🎯 Sponsor Ad Manager</button>'
      +'</div>'
      +'<div class="sub-tabs">'
        +'<button class="stab active" id="at-users" onclick="Admin._tab(\'users\')">Users</button>'
        +'<button class="stab"        id="at-shop"  onclick="Admin._tab(\'shop\')">Shop Items</button>'
      +'</div>'
      +'<div id="adm-body"></div><div style="height:8px"></div>';
    _tab('users');
  }

  var _ct='users';
  function _tab(t){
    _ct=t;
    ['users','shop'].forEach(function(x){ var b=document.getElementById('at-'+x); if(b)b.classList.remove('active'); });
    var ab=document.getElementById('at-'+t); if(ab) ab.classList.add('active');
    if(t==='users') _renderUsers();
    else _renderShopAdmin();
  }

  /* ── USERS TAB ── */
  function _renderUsers(){
    var el=document.getElementById('adm-body'); if(!el) return;
    el.innerHTML=
      '<div style="display:flex;gap:8px;margin-bottom:12px">'
        +'<input class="fi" id="adm-srch" placeholder="Search name/email..." style="flex:1" oninput="Admin._filter()" />'
        +'<button class="btn btn-teal bsm" onclick="Admin.loadUsers()">🔄</button>'
      +'</div>'
      +'<div class="card" style="padding:14px;overflow-x:auto"><div id="adm-tbl">Loading...</div></div>';
    loadUsers();
  }

  function loadUsers(){
    if(!_guard()) return;
    if(!window.FB||!window.DB){ var e=document.getElementById('adm-tbl'); if(e) e.innerHTML='<div class="tmut tc" style="padding:20px">Firebase unavailable</div>'; return; }
    window.DB.collection('users').orderBy('coins','desc').get()
      .then(function(snap){
        S.adminUsers=snap.docs.map(function(d){ return Object.assign({uid:d.id},d.data()); });
        var tc=0; S.adminUsers.forEach(function(u){ tc+=u.coins||0; });
        var tu=document.getElementById('adm-tu'), tcc=document.getElementById('adm-tc');
        if(tu)  tu.textContent=S.adminUsers.length;
        if(tcc) tcc.textContent=tc.toLocaleString();
        _drawTable(S.adminUsers);
      })
      .catch(function(e){ var el=document.getElementById('adm-tbl'); if(el) el.innerHTML='<div style="color:var(--rose);padding:20px;text-align:center">'+e.message+'</div>'; });
  }

  function _filter(){
    var q=((document.getElementById('adm-srch')||{}).value||'').toLowerCase();
    _drawTable(q?(S.adminUsers||[]).filter(function(u){ return (u.name||'').toLowerCase().indexOf(q)>=0||(u.email||'').toLowerCase().indexOf(q)>=0; }):(S.adminUsers||[]));
  }

  function _drawTable(list){
    var el=document.getElementById('adm-tbl'); if(!el) return;
    if(!list.length){ el.innerHTML='<div class="tmut tc" style="padding:20px">No users found</div>'; return; }
    el.innerHTML='<table class="atable"><thead><tr><th>User</th><th>Coins</th><th>LV</th><th>Role</th><th>Actions</th></tr></thead><tbody>'
      +list.map(function(u){
        return '<tr>'
          +'<td style="min-width:110px"><div style="font-size:13px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_esc(u.name||'—')+'</div><div style="font-size:10px;color:var(--t2);max-width:120px;overflow:hidden;text-overflow:ellipsis">'+_esc(u.email||'')+'</div></td>'
          +'<td><span class="mono" style="color:var(--amber);font-weight:700">'+(u.coins||0).toLocaleString()+'</span></td>'
          +'<td><span class="lv-chip" style="font-size:9px">LV'+(u.level||1)+'</span></td>'
          +'<td><span class="badge '+(u.role==='admin'?'bg-rose':'bg-cyan')+'">'+(u.role||'user')+'</span></td>'
          +'<td><div style="display:flex;gap:4px">'
            +'<button class="btn btn-amber bxs" onclick="Admin._openEdit(\''+u.uid+'\',\''+encodeURIComponent(u.name||'Player')+'\','+(u.coins||0)+')">✏️</button>'
            +'<button class="btn btn-ghost bxs" onclick="Admin._toggleRole(\''+u.uid+'\',\''+(u.role||'user')+'\')">⚡</button>'
          +'</div></td>'
        +'</tr>';
      }).join('')+'</tbody></table>';
  }

  /* Edit balance — only opened from user table */
  function _openEdit(uid, nameEnc, coins){
    if(!_guard()) return;
    S.editUID=uid; S.editName=decodeURIComponent(nameEnc);
    document.getElementById('ebal-name').textContent=S.editName;
    document.getElementById('ebal-val').value=coins;
    UI.openModal('modal-edit-bal');
  }

  function saveBalance(){
    if(!_guard()) return;
    var v=parseInt(document.getElementById('ebal-val').value||'0');
    if(isNaN(v)||v<0){ UI.toast('Invalid amount','err'); return; }
    if(!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    window.DB.collection('users').doc(S.editUID).update({ coins:v })
      .then(function(){
        var u=(S.adminUsers||[]).find(function(x){ return x.uid===S.editUID; }); if(u) u.coins=v;
        UI.closeModal('modal-edit-bal');
        UI.toast(S.editName+' → '+v.toLocaleString()+' coins ✓');
        _drawTable(S.adminUsers||[]);
        var tc=0; (S.adminUsers||[]).forEach(function(x){ tc+=x.coins||0; });
        var tcc=document.getElementById('adm-tc'); if(tcc) tcc.textContent=tc.toLocaleString();
      }).catch(function(e){ UI.toast(e.message,'err'); });
  }

  function _toggleRole(uid, role){
    if(!_guard()) return;
    if(!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    var nr=role==='admin'?'user':'admin';
    window.DB.collection('users').doc(uid).update({ role:nr })
      .then(function(){
        var u=(S.adminUsers||[]).find(function(x){ return x.uid===uid; }); if(u) u.role=nr;
        _drawTable(S.adminUsers||[]); UI.toast('Role → '+nr+' ✓');
      }).catch(function(e){ UI.toast(e.message,'err'); });
  }

  /* ── SHOP ADMIN TAB ── */
  function _renderShopAdmin(){
    var el=document.getElementById('adm-body'); if(!el) return;
    el.innerHTML='<button class="btn btn-teal bfull mb12" onclick="Admin._openItem(null)">➕ Add New Item</button>'
      +'<div id="adm-shop-list">'+_buildShopList()+'</div>';
  }

  function _buildShopList(){
    if(!S.shopItems.length) return '<div class="tmut tc" style="padding:20px">No items yet</div>';
    return S.shopItems.map(function(item){
      var sb={active:'<span class="badge bg-cyan">Active</span>',out_of_stock:'<span class="badge bg-rose">OOS</span>',hidden:'<span class="badge bg-violet">Hidden</span>'}[item.status]||'';
      return '<div class="sir">'
        +'<div class="sir-thumb">'+_imgHtml(item.image,22)+'</div>'
        +'<div class="sir-info"><div class="sir-name">'+_esc(item.name)+'</div><div class="sir-meta mono">🪙'+(item.price||0)+' · Stock:'+(item.stock||0)+(item.expiry?' · Exp:'+item.expiry:'')+'</div></div>'
        +sb
        +'<div class="sir-acts">'
          +'<button class="btn btn-amber bxs" onclick="Admin._openItem(\''+item.id+'\')">✏️</button>'
          +'<button class="btn btn-rose bxs"  onclick="Admin._delItem(\''+item.id+'\')">🗑</button>'
        +'</div>'
      +'</div>';
    }).join('');
  }

  function _openItem(id){
    if(!_guard()) return;
    document.getElementById('item-mo-title').textContent=id?'✏️ Edit Item':'➕ Add Item';
    document.getElementById('item-edit-id').value=id||'';
    var item=id?S.shopItems.find(function(x){ return x.id===id; }):null;
    document.getElementById('item-name').value  =item?(item.name||''):'';
    document.getElementById('item-img').value   =item?(item.image||''):'';
    document.getElementById('item-desc').value  =item?(item.desc||''):'';
    document.getElementById('item-expiry').value=item?(item.expiry||''):'';
    document.getElementById('item-price').value =item?(item.price||''):'';
    document.getElementById('item-stock').value =item?(item.stock||''):'';
    document.getElementById('item-status').value=item?(item.status||'active'):'active';
    UI.openModal('modal-item');
  }

  function saveItem(){
    if(!_guard()) return;
    var name  =document.getElementById('item-name').value.trim();
    var price =parseInt(document.getElementById('item-price').value);
    var stock =parseInt(document.getElementById('item-stock').value);
    var image =document.getElementById('item-img').value.trim();
    var desc  =document.getElementById('item-desc').value.trim();
    var expiry=document.getElementById('item-expiry').value;
    var status=document.getElementById('item-status').value;
    var editId=document.getElementById('item-edit-id').value;
    if(!name){ UI.toast('Name required','err'); return; }
    if(isNaN(price)||price<1){ UI.toast('Valid price required','err'); return; }
    if(isNaN(stock)||stock<0){ UI.toast('Valid stock required','err'); return; }
    if(!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    var data={ name,price,stock,image,desc,expiry,status };
    if(editId){
      window.DB.collection('shopItems').doc(editId).update(data)
        .then(function(){
          var idx=S.shopItems.findIndex(function(x){ return x.id===editId; });
          if(idx>=0) S.shopItems[idx]=Object.assign({id:editId},data);
          UI.closeModal('modal-item'); UI.toast('Item updated ✓');
          var el=document.getElementById('adm-shop-list'); if(el) el.innerHTML=_buildShopList();
        }).catch(function(e){ UI.toast(e.message,'err'); });
    } else {
      data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
      window.DB.collection('shopItems').add(data)
        .then(function(ref){
          S.shopItems.unshift(Object.assign({id:ref.id},data));
          UI.closeModal('modal-item'); UI.toast('Item added ✓');
          var el=document.getElementById('adm-shop-list'); if(el) el.innerHTML=_buildShopList();
        }).catch(function(e){ UI.toast(e.message,'err'); });
    }
  }

  function _delItem(id){
    if(!_guard()) return;
    if(!confirm('Delete this item?')) return;
    window.DB.collection('shopItems').doc(id).delete()
      .then(function(){
        S.shopItems=S.shopItems.filter(function(x){ return x.id!==id; });
        UI.toast('Deleted');
        var el=document.getElementById('adm-shop-list'); if(el) el.innerHTML=_buildShopList();
      }).catch(function(e){ UI.toast(e.message,'err'); });
  }

  /* ── GLOBAL SETTINGS MODAL ── */
  function openSettings(){
    if(!_guard()) return;
    var gs=S.settings||Settings.DEFAULTS;
    document.getElementById('gs-ads-on').checked=!!gs.adsEnabled;
    document.getElementById('gs-ad-s').value=(gs.adRewards||{}).short||25;
    document.getElementById('gs-ad-l').value=(gs.adRewards||{}).long||50;
    document.getElementById('gs-ad-f').value=(gs.adRewards||{}).full||100;
    document.getElementById('gs-dbl-dur').value=gs.doubleRewardDuration||15;
    var gameIds=['wheel','scratch','math','dice','slots','cardflip','numguess','rps','wordscram','cointoss'];
    var gameNames={wheel:'Wheel Spin',scratch:'Scratch Card',math:'Math Quiz',dice:'Dice Roll',slots:'Slots',cardflip:'Card Flip',numguess:'Num Guess',rps:'Rock Paper Scissors',wordscram:'Word Scramble',cointoss:'Coin Toss'};
    var gameIcons={wheel:'🎡',scratch:'🎫',math:'🧮',dice:'🎲',slots:'🎰',cardflip:'🃏',numguess:'🔢',rps:'✊',wordscram:'🔤',cointoss:'🪙'};
    var gEl=document.getElementById('gs-games-list');
    if(gEl) gEl.innerHTML=gameIds.map(function(id){
      var cfg=(gs.games||{})[id]||{};
      return '<div class="ss-game-row">'
        +'<span class="ss-game-icon">'+gameIcons[id]+'</span>'
        +'<span class="ss-game-name">'+gameNames[id]+'</span>'
        +'<input class="fi fs" type="number" id="gsr-'+id+'" value="'+(cfg.reward||25)+'" style="width:70px" />'
        +'<label class="tog"><input type="checkbox" id="gse-'+id+'" '+(cfg.enabled!==false?'checked':'')+'><span class="tsl"></span></label>'
      +'</div>';
    }).join('');
    document.getElementById('gs-lb1').value=(gs.leaderboardPrizes||{}).first||500;
    document.getElementById('gs-lb2').value=(gs.leaderboardPrizes||{}).second||300;
    document.getElementById('gs-lb3').value=(gs.leaderboardPrizes||{}).third||150;
    document.getElementById('gs-buy-lim').value=gs.dailyBuyLimit||5;
    UI.openModal('modal-settings');
  }

  function saveSettings(){
    if(!_guard()) return;
    if(!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    var gameIds=['wheel','scratch','math','dice','slots','cardflip','numguess','rps','wordscram','cointoss'];
    var gamesData={};
    gameIds.forEach(function(id){
      var rEl=document.getElementById('gsr-'+id), eEl=document.getElementById('gse-'+id);
      gamesData[id]={ reward:parseInt((rEl&&rEl.value)||25), enabled:eEl?eEl.checked:true };
    });
    var newSettings={
      adsEnabled:document.getElementById('gs-ads-on').checked,
      adRewards:{
        short:parseInt(document.getElementById('gs-ad-s').value)||25,
        long: parseInt(document.getElementById('gs-ad-l').value)||50,
        full: parseInt(document.getElementById('gs-ad-f').value)||100
      },
      doubleRewardDuration:parseInt(document.getElementById('gs-dbl-dur').value)||15,
      games:gamesData,
      leaderboardPrizes:{
        first: parseInt(document.getElementById('gs-lb1').value)||500,
        second:parseInt(document.getElementById('gs-lb2').value)||300,
        third: parseInt(document.getElementById('gs-lb3').value)||150
      },
      dailyBuyLimit:parseInt(document.getElementById('gs-buy-lim').value)||5
    };
    window.DB.collection('meta').doc('globalSettings').set(newSettings)
      .then(function(){ UI.closeModal('modal-settings'); UI.toast('Settings saved & synced ✓'); })
      .catch(function(e){ UI.toast(e.message,'err'); });
  }

  /* ── SPONSOR MANAGER MODAL ── */
  function openSponsors(){
    if(!_guard()) return;
    _renderSponsorSlots();
    UI.openModal('modal-sponsors');
  }

  function _renderSponsorSlots(){
    var el=document.getElementById('sponsor-slots-list'); if(!el) return;
    var slots=S.sponsors.length?S.sponsors:[];
    var ZONES=['Startup_Popup','Home_Banner','Game_Reward_Double','Daily_Reward'];
    el.innerHTML=slots.map(function(sp,i){
      return '<div class="sp-row">'
        +'<div class="sp-row-head">'
          +'<span class="sp-row-num">SPONSOR '+(i+1)+'</span>'
          +'<button class="btn btn-rose bxs" onclick="Admin._removeSponsor('+i+')">Remove</button>'
        +'</div>'
        +'<div class="fw"><label class="flbl">Sponsor Name</label>'
          +'<input class="fi" id="sp-name-'+i+'" value="'+_esc(sp.name||'')+'" placeholder="e.g. Acme Corp" /></div>'
        +'<div class="fw"><label class="flbl">Media URL (image/gif/video/webpage)</label>'
          +'<input class="fi" id="sp-url-'+i+'" value="'+_esc(sp.mediaUrl||'')+'" placeholder="https://..." /></div>'
        +'<div class="form2">'
          +'<div class="fw"><label class="flbl">Media Type</label>'
            +'<select class="fi" id="sp-type-'+i+'">'
              +['image','gif','video','url'].map(function(t){ return '<option value="'+t+'"'+(sp.mediaType===t?' selected':'')+'>'+t+'</option>'; }).join('')
            +'</select></div>'
          +'<div class="fw"><label class="flbl">Placement Zone</label>'
            +'<select class="fi" id="sp-zone-'+i+'">'
              +ZONES.map(function(z){ return '<option value="'+z+'"'+(sp.zone===z?' selected':'')+'>'+z+'</option>'; }).join('')
            +'</select></div>'
        +'</div>'
        +'<div class="ss-row"><span>Active</span><label class="tog"><input type="checkbox" id="sp-active-'+i+'" '+(sp.active?'checked':'')+' /><span class="tsl"></span></label></div>'
      +'</div>';
    }).join('');
    // disable add button if 5 slots already
    var addBtn=document.getElementById('add-sponsor-btn');
    if(addBtn) addBtn.disabled=slots.length>=5;
  }

  function addSponsorSlot(){
    if(S.sponsors.length>=5){ UI.toast('Maximum 5 sponsors','warn'); return; }
    S.sponsors.push({ name:'', mediaUrl:'', mediaType:'image', zone:'Home_Banner', active:false });
    _renderSponsorSlots();
  }

  function _removeSponsor(idx){
    S.sponsors.splice(idx,1);
    _renderSponsorSlots();
    UI.toast('Sponsor removed');
  }

  function saveSponsors(){
    if(!_guard()) return;
    if(!window.FB||!window.DB){ UI.toast('Firebase unavailable','err'); return; }
    var slots=[];
    for(var i=0;i<S.sponsors.length;i++){
      var nameEl=document.getElementById('sp-name-'+i);
      var urlEl =document.getElementById('sp-url-'+i);
      var typeEl=document.getElementById('sp-type-'+i);
      var zoneEl=document.getElementById('sp-zone-'+i);
      var actEl =document.getElementById('sp-active-'+i);
      if(!nameEl) continue;
      slots.push({
        name:    nameEl.value.trim(),
        mediaUrl:urlEl?urlEl.value.trim():'',
        mediaType:typeEl?typeEl.value:'image',
        zone:    zoneEl?zoneEl.value:'Home_Banner',
        active:  actEl?actEl.checked:false
      });
    }
    S.sponsors=slots;
    window.DB.collection('meta').doc('sponsors').set({ slots:slots })
      .then(function(){
        UI.closeModal('modal-sponsors');
        UI.toast('Sponsors saved & applied ✓');
        // Re-apply all zones immediately
        ['Startup_Popup','Home_Banner','Game_Reward_Double','Daily_Reward']
          .forEach(function(z){ Sponsors.applyZone(z); });
      }).catch(function(e){ UI.toast(e.message,'err'); });
  }

  return {
    render, _tab, loadUsers, _filter, _openEdit, saveBalance, _toggleRole,
    _openItem, saveItem, _delItem, openSettings, saveSettings,
    openSponsors, addSponsorSlot, saveSponsors, _removeSponsor
  };
}());

/* ══════════════════════════════════════════════════════════════
   §16  GAMES — all 10 original games, UNTOUCHED
   Only change: Games.win() now calls Ads.offerDouble() to trigger
   the double-reward ad system after every win.
══════════════════════════════════════════════════════════════ */
var Games = (function() {

  function open(id) {
    if(!Settings.gameEnabled(id)){ UI.toast('This game is disabled','warn'); return; }
    var gc=document.getElementById('game-slot'); if(!gc) return;
    var MAP={wheel:_wheel,scratch:_scratch,math:_math,dice:_dice,slots:_slots,
             cardflip:_cardflip,numguess:_numguess,rps:_rps,wordscram:_wordscram,cointoss:_cointoss};
    var fn=MAP[id]; if(!fn){ UI.toast('Game not found','err'); return; }
    fn(gc);
    UI.openModal('modal-game');
  }

  function close()         { UI.closeModal('modal-game'); clearInterval(window._gIv); }
  function overlayClose(e) { if(e.target===e.currentTarget) close(); }

  /**
   * win(amt, desc)
   * 1. Credits coins to user immediately.
   * 2. Shows toast.
   * 3. Offers double-reward ad popup.
   * If user claims double → they get amt again (total 2×).
   * If user skips → they keep the original amt already credited.
   */
  function win(amt, desc) {
    if(!amt||amt<=0) return;
    Data.addCoins(amt, desc||'Game Win');
    UI.toast('🎉 +'+amt+' 🪙 — Double it?');
    // Offer double reward after short delay so toast shows first
    setTimeout(function(){ Ads.offerDouble(amt, desc||'Game Win'); }, 600);
  }

  /* ── WHEEL ── */
  var _wSpin=false,_wR=0;
  var WP=[{l:'10',c:10,bg:'#1A2540'},{l:'50',c:50,bg:'#2D1F6E'},{l:'25',c:25,bg:'#111A30'},{l:'Max!',c:0,bg:'#5C1A2E'},{l:'20',c:20,bg:'#142033'},{l:'150',c:150,bg:'#3D1508'},{l:'15',c:15,bg:'#0C1420'},{l:'75',c:75,bg:'#0A3328'}];

  function _wheel(el){
    var maxR=Settings.gameReward('wheel');
    WP[3].c=maxR; WP[3].l=maxR+'!';
    el.innerHTML='<h3 class="mo-title">🎡 Wheel Spin</h3><p class="mo-sub">Win up to '+maxR+' coins!</p>'
      +'<div class="wheel-wrap mb14"><div class="wheel-ptr"></div><canvas id="wheel-cv" width="264" height="264"></canvas><div class="wheel-hub"></div></div>'
      +'<div id="w-res" style="text-align:center;min-height:26px;font-size:15px;font-weight:700;color:var(--amber);font-family:var(--fm);margin-bottom:14px"></div>'
      +'<button class="btn btn-violet bfull" id="w-btn" onclick="Games._spin()" style="padding:15px;font-size:15px">🎡 SPIN NOW</button>';
    _drawW(_wR);
  }

  function _drawW(r){
    var cv=document.getElementById('wheel-cv'); if(!cv) return;
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

  function _spin(){
    if(_wSpin) return; _wSpin=true;
    var btn=document.getElementById('w-btn'),res=document.getElementById('w-res');
    if(btn){btn.disabled=true;btn.textContent='Spinning...';}
    if(res) res.textContent='';
    var idx=Math.floor(Math.random()*WP.length),arc=Math.PI*2/WP.length;
    var tgt=Math.PI*2*6-(idx*arc+arc/2)-Math.PI/2,st=null,dur=4400;
    function fr(ts){
      if(!st) st=ts; var p=Math.min((ts-st)/dur,1),e=1-Math.pow(1-p,3);
      _wR=tgt*e; _drawW(_wR);
      if(p<1){ requestAnimationFrame(fr); }
      else{
        _wSpin=false; var prize=WP[idx];
        if(res) res.textContent='🎉 You won '+prize.c+' coins!';
        if(btn){btn.disabled=false;btn.textContent='🎡 Spin Again';}
        win(prize.c,'Wheel Spin');
      }
    }
    requestAnimationFrame(fr);
  }

  /* ── SCRATCH ── */
  var _sDone=false,_sPrize=0,_sDown=false;
  function _scratch(el){
    _sDone=false;_sDown=false;
    _sPrize=Math.floor(Math.random()*(Settings.gameReward('scratch')))+5;
    el.innerHTML='<h3 class="mo-title">🎫 Lucky Scratch</h3><p class="mo-sub">Scratch 60% to reveal your prize!</p>'
      +'<div class="sc-wrap mb12"><div class="sc-reveal"><div id="sc-val" style="font-family:var(--fm);font-size:34px;font-weight:700;color:var(--amber)">'+_sPrize+'</div><div class="tmut" style="font-size:12px">LABB Coins</div></div><canvas id="sc-cv" width="264" height="148"></canvas></div>'
      +'<div id="sc-msg" style="text-align:center;min-height:22px;font-size:14px;font-weight:700;color:var(--cyan);margin-bottom:12px"></div>'
      +'<button class="btn btn-amber bfull" style="padding:13px" onclick="Games._newSc()">🔄 New Card</button>';
    _initSc();
  }

  function _initSc(){
    var cv=document.getElementById('sc-cv'); if(!cv) return;
    var ctx=cv.getContext('2d');ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,264,148);
    var g=ctx.createLinearGradient(0,0,264,148);g.addColorStop(0,'#1A3060');g.addColorStop(.5,'#20304A');g.addColorStop(1,'#1A3060');
    ctx.fillStyle=g;try{ctx.roundRect(0,0,264,148,16);}catch(e){ctx.rect(0,0,264,148);}ctx.fill();
    ctx.fillStyle='rgba(160,170,191,.6)';ctx.font='bold 14px Sora,sans-serif';ctx.textAlign='center';ctx.fillText('✦  SCRATCH HERE  ✦',132,64);
    ctx.font='11px Sora,sans-serif';ctx.fillStyle='rgba(160,170,191,.35)';ctx.fillText('Reveal 60% to claim',132,86);
    function at(e){
      if(_sDone) return; e.preventDefault();
      var ctx2=cv.getContext('2d'),rect=cv.getBoundingClientRect(),sx=264/rect.width,sy=148/rect.height;
      var cx=e.touches?e.touches[0].clientX:e.clientX,cy=e.touches?e.touches[0].clientY:e.clientY;
      ctx2.globalCompositeOperation='destination-out';
      ctx2.beginPath();ctx2.arc((cx-rect.left)*sx,(cy-rect.top)*sy,24,0,Math.PI*2);ctx2.fill();
      var data=ctx2.getImageData(0,0,264,148).data,cl=0;
      for(var i=3;i<data.length;i+=4) if(data[i]<64) cl++;
      if(cl/(264*148)>0.60&&!_sDone){
        _sDone=true;var m=document.getElementById('sc-msg');if(m)m.textContent='🎊 You won '+_sPrize+' coins!';
        win(_sPrize,'Lucky Scratch');
      }
    }
    cv.onmousedown=function(e){_sDown=true;at(e);}; cv.ontouchstart=function(e){_sDown=true;at(e);};
    cv.onmousemove=function(e){if(_sDown)at(e);}; cv.ontouchmove=function(e){if(_sDown)at(e);};
    cv.onmouseup=cv.onmouseleave=cv.ontouchend=function(){_sDown=false;};
  }

  function _newSc(){
    _sDone=false;_sDown=false;_sPrize=Math.floor(Math.random()*Settings.gameReward('scratch'))+5;
    var pv=document.getElementById('sc-val');if(pv)pv.textContent=_sPrize;
    var m=document.getElementById('sc-msg');if(m)m.textContent='';_initSc();
  }

  /* ── MATH ── */
  var _mScore=0,_mQ=null;
  var MTIERS=[{ops:['+','-'],r:[1,15],rw:20},{ops:['+','-'],r:[10,50],rw:30},{ops:['×'],r:[1,10],rw:45},{ops:['÷'],r:[1,10],rw:0}];

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
    el.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:18px;text-align:center;margin-bottom:13px"><div class="tmut" style="font-size:12px;margin-bottom:6px">Score: '+_mScore+' · Reward: +'+tier.rw+' 🪙</div><div class="mono" style="font-size:40px;font-weight:700">'+a+' '+op+' '+b+' = ?</div></div>'
      +'<div style="text-align:right;font-size:12px;color:var(--rose);font-family:var(--fm);margin-bottom:10px" id="m-tm">⏱ '+t+'s</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+sh.map(function(o){return '<button class="btn btn-ghost" style="padding:16px;font-size:20px;font-family:var(--fm);font-weight:700;border-radius:var(--r16)" onclick="Games._checkM('+o+')">'+o+'</button>';}).join('')+'</div>';
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
    el.innerHTML='<h3 class="mo-title">🎲 Dice Roll</h3><p class="mo-sub">Roll higher than the house!</p>'
      +'<div style="display:flex;justify-content:center;gap:16px;margin-bottom:18px"><div style="text-align:center"><div id="d-y" style="width:84px;height:84px;background:var(--cyan-d);border:2px solid rgba(0,212,200,.35);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px">🎲</div><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">YOU</div></div>'
      +'<div style="display:flex;align-items:center;font-size:17px;font-weight:700;color:var(--t2)">VS</div>'
      +'<div style="text-align:center"><div id="d-h" style="width:84px;height:84px;background:var(--rose-d);border:2px solid rgba(240,64,96,.35);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px">🎲</div><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">HOUSE</div></div></div>'
      +'<div id="d-res" style="text-align:center;min-height:28px;font-size:14px;font-weight:700;margin-bottom:14px"></div>'
      +'<button class="btn btn-teal bfull" id="d-btn" onclick="Games._rollD()" style="padding:15px;font-size:14px">🎲 ROLL DICE</button>';
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
    el.innerHTML='<h3 class="mo-title">🎰 Slot Machine</h3><p class="mo-sub">Match 3 to win up to '+maxR+' coins!</p>'
      +'<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px">'+[0,1,2].map(function(i){return '<div class="reel" id="r'+i+'">'+SS[Math.floor(Math.random()*SS.length)]+'</div>';}).join('')+'</div>'
      +'<div id="sl-res" style="text-align:center;min-height:26px;font-size:14px;font-weight:700;color:var(--amber);margin-bottom:12px"></div>'
      +'<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r12);padding:10px;margin-bottom:13px"><div style="font-size:9px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px">Pay Table</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">'+Object.keys(SPAY).map(function(k){return '<div style="font-size:11px;color:var(--t1)">'+k+'<span class="mono" style="color:var(--amber);margin-left:4px">=+'+SPAY[k]+'</span></div>';}).join('')+'</div></div>'
      +'<button class="btn btn-rose bfull" id="sl-btn" onclick="Games._spinSl()" style="padding:15px;font-size:14px">🎰 SPIN</button>';
  }

  function _spinSl(){
    if(_slRun) return; _slRun=true;var btn=document.getElementById('sl-btn');if(btn){btn.disabled=true;btn.textContent='Spinning...';}
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
    el.innerHTML='<h3 class="mo-title">🃏 Card Flip</h3><p class="mo-sub">Match all 8 pairs — +'+Math.round(Settings.gameReward('cardflip')/8)+' 🪙 per match!</p>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:13px" id="cf-grid">'
      +syms.map(function(sym,i){return '<div class="fcard" style="width:56px;height:74px;margin:0 auto" id="cf'+i+'" onclick="Games._flipC('+i+')"><div class="finner"><div class="fface ffront">?</div><div class="fface fback">'+syms[i]+'</div></div></div>';}).join('')
      +'</div><div id="cf-res" class="tmut tc" style="font-size:12px">Tap cards to flip!</div>';
  }

  function _flipC(i){
    if(_cfL||_cf[i].matched||_cf[i].revealed) return;
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
    el.innerHTML='<h3 class="mo-title">🔢 Number Guess</h3><p class="mo-sub">Guess 1–100 in 6 tries!</p>'
      +'<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:18px;text-align:center;margin-bottom:15px"><div style="font-size:46px;margin-bottom:7px">🤔</div><div id="ng-h" class="tmut" style="font-size:13px">Think of a number 1–100...</div><div id="ng-l" class="mono" style="font-size:11px;color:var(--t2);margin-top:6px">6 attempts left</div></div>'
      +'<div style="display:flex;gap:8px;margin-bottom:12px"><input class="fi" id="ng-inp" type="number" min="1" max="100" placeholder="1–100" style="flex:1" onkeydown="if(event.key===\'Enter\')Games._checkNG()" /><button class="btn btn-teal" style="padding:0 22px;border-radius:var(--r16)" onclick="Games._checkNG()">→</button></div>'
      +'<div id="ng-hist" style="display:flex;flex-wrap:wrap;gap:5px"></div>';
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
    el.innerHTML='<h3 class="mo-title">✊ Rock Paper Scissors</h3><p class="mo-sub">Beat the CPU — win +'+Settings.gameReward('rps')+' 🪙!</p>'
      +'<div style="display:flex;justify-content:center;gap:18px;margin-bottom:18px"><div style="text-align:center"><div id="rps-y" style="width:80px;height:80px;background:var(--cyan-d);border:2px solid rgba(0,212,200,.3);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:42px">?</div><div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">YOU</div></div>'
      +'<div style="display:flex;align-items:center;font-size:16px;font-weight:700;color:var(--t2)">VS</div>'
      +'<div style="text-align:center"><div id="rps-c" style="width:80px;height:80px;background:var(--rose-d);border:2px solid rgba(240,64,96,.3);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:42px">?</div><div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--t2);margin-top:7px">CPU</div></div></div>'
      +'<div id="rps-r" style="text-align:center;min-height:26px;font-size:14px;font-weight:700;margin-bottom:16px"></div>'
      +'<div style="display:flex;justify-content:center;gap:10px">'+RPC.map(function(c,i){return '<div style="text-align:center"><button onclick="Games._playRPS('+i+')" style="width:70px;height:70px;background:var(--s2);border:1px solid var(--bd2);border-radius:16px;font-size:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto">'+c+'</button><div style="font-size:9px;color:var(--t2);font-weight:700;margin-top:4px">'+RPN[i]+'</div></div>';}).join('')+'</div>';
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
    el.innerHTML='<h3 class="mo-title">🔤 Word Scramble</h3><p class="mo-sub">Unscramble for up to +'+Settings.gameReward('wordscram')+' 🪙!</p>'
      +'<div style="background:var(--s1);border:1px solid var(--bd);border-radius:var(--r16);padding:20px;text-align:center;margin-bottom:15px"><div class="mono" style="font-size:36px;font-weight:700;color:var(--violet);letter-spacing:8px;margin-bottom:8px">'+sc+'</div><div class="tmut" style="font-size:12px">💡 '+q.h+'</div><div id="ws-l" class="mono" style="font-size:11px;color:var(--t2);margin-top:6px">3 attempts left</div></div>'
      +'<div style="display:flex;gap:8px;margin-bottom:12px"><input class="fi" id="ws-i" placeholder="Your answer..." style="flex:1;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')Games._checkWS()" /><button class="btn btn-violet" style="padding:0 20px;border-radius:var(--r16)" onclick="Games._checkWS()">→</button></div>'
      +'<div id="ws-r" style="text-align:center;min-height:22px;font-size:14px;font-weight:700"></div>';
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
    el.innerHTML='<h3 class="mo-title">🪙 Coin Toss</h3><p class="mo-sub">Heads or Tails? Win +'+Settings.gameReward('cointoss')+' 🪙!</p>'
      +'<div id="ct-c" style="width:130px;height:130px;border-radius:50%;margin:0 auto 18px;background:linear-gradient(135deg,var(--amber),var(--amber2));border:4px solid rgba(240,165,0,.4);display:flex;align-items:center;justify-content:center;font-size:54px;box-shadow:0 0 44px rgba(240,165,0,.3)">🪙</div>'
      +'<div id="ct-r" style="text-align:center;min-height:26px;font-size:15px;font-weight:700;color:var(--amber);margin-bottom:18px"></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn btn-amber bfull" id="ct-h" onclick="Games._toss(\'heads\')" style="font-size:15px;padding:16px">👑 HEADS</button><button class="btn btn-teal bfull" id="ct-t" onclick="Games._toss(\'tails\')" style="font-size:15px;padding:16px">⭕ TAILS</button></div>';
  }

  function _toss(ch){
    var bh=document.getElementById('ct-h'),bt=document.getElementById('ct-t');if(bh)bh.disabled=true;if(bt)bt.disabled=true;
    var coin=document.getElementById('ct-c'),res=document.getElementById('ct-r'),t=0;
    var iv=setInterval(function(){coin.textContent=t%2===0?'👑':'⭕';if(++t>18){clearInterval(iv);var out=Math.random()<.5?'heads':'tails';coin.textContent=out==='heads'?'👑':'⭕';coin.style.background=out==='heads'?'linear-gradient(135deg,var(--amber),var(--amber2))':'linear-gradient(135deg,var(--cyan),var(--cyan2))';var rw=Settings.gameReward('cointoss');if(ch===out){res.textContent='🎉 Correct! +'+rw+' 🪙';res.style.color='var(--cyan)';win(rw,'Coin Toss');}else{res.textContent='Wrong! It was '+out+'. Try again!';res.style.color='var(--rose)';}if(bh)bh.disabled=false;if(bt)bt.disabled=false;}},80);
  }

  return {
    open, close, overlayClose,
    _spin, _newSc, _checkM, _rollD, _spinSl, _flipC, _checkNG, _playRPS, _checkWS, _toss
  };
}());

/* ══════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════ */
function _esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _dl() { return new Date().toLocaleDateString(); }
function _imgHtml(src, fs){
  if(!src) return '<span style="font-size:'+fs+'px">🎁</span>';
  if(src.startsWith('http')) return '<img src="'+_esc(src)+'" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML=\'<span style=font-size:'+fs+'px>🎁</span>\'" />';
  return '<span style="font-size:'+fs+'px">'+src+'</span>';
}

/* ══════════════════════════════════════════════════════════════
   §17  BOOT MODULE
   Sequence:
   1. App.initLang() — check saved lang or show language screen
   2. User picks lang → App.setLang() → Boot.init()
   3. Boot.init() → starts Settings.load + Shop.loadShop (parallel)
      then starts Auth.initListener 400ms later
   4. Boot.tryLaunch() called by each module when its gate closes
   5. All 3 gates closed → Boot.launch()
══════════════════════════════════════════════════════════════ */
var Boot = (function() {

  function tryLaunch(){
    if(S.loaded.auth && S.loaded.settings && S.loaded.shop) launch();
  }

  function launch(){
    UI.hide('screen-loading');
    UI.hide('screen-auth');
    UI.show('screen-app');
    UI.initParticles();
    UI.refreshCoins();
    // Apply saved language to all DOM elements
    var ismy = S.lang === 'my';
    document.body.classList.toggle('lang-my', ismy);
    var lb = document.getElementById('lang-btn');
    if (lb) lb.textContent = S.lang.toUpperCase();
    // Show admin nav only for the hardcoded admin email
    if(S.isAdmin){
      var na=document.getElementById('bn-admin'); if(na) na.classList.remove('hidden');
    }
    // Populate coin history modal on open
    document.getElementById('modal-history')
      .addEventListener('click', function(){ if(!this.classList.contains('hidden')) UI.openHistModal(); });
    // Show startup sponsor popup (if assigned)
    setTimeout(function(){ Sponsors._triggerStartupPopup && Sponsors._triggerStartupPopup(); }, 500);
    UI.nav('home');
  }

  function init(){
    UI.setLoad('Initializing Firebase...', 20);
    setTimeout(function(){
      UI.setLoad('Loading settings & shop...', 40);
      Settings.load();
      Shop.loadShop();
    }, 300);
    setTimeout(function(){
      UI.setLoad('Checking auth...', 60);
      Auth.initListener();
    }, 400);
  }

  return { tryLaunch, launch, init };
}());

/* ══════════════════════════════════════════════════════════════
   ENTRY POINT
   Check for saved language preference first.
   If found → skip language screen and go straight to loading.
   If not found → language screen is shown (default in HTML).
══════════════════════════════════════════════════════════════ */
App.initLang();
