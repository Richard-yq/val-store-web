/**
 * VALORANT PROTOCOL STORE WEB - CLIENT LOGIC
 * Compatible with both Netlify Cloud and Local Server
 */

// Global State
const STATE = {
  data: null,
  session: null, // { accessToken, entitlementsToken, puuid, name, tag, shard }
  wishlist: new Set(),
  catalog: [],
  flippedNightMarket: new Set(),
  currentInspectSkin: null,
  activeVideoUrl: null,
  mfaSessionData: null,
  mfaShard: 'ap',
  timers: {
    dailyRemaining: 0,
    nightMarketRemaining: 0,
    bundleRemaining: 0
  }
};

// Tactical Audio Synthesizer (Web Audio API)
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  },
  play(type) {
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (type === 'flip') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(720, t + 0.12);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
      } else if (type === 'fanfare') {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.connect(g);
          g.connect(this.ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.12, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.35);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.35);
        });
      }
    } catch (e) {
      // Audio autoplay policy
    }
  }
};

// DOM Elements
const DOM = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  playerName: document.getElementById('playerName'),
  playerTagline: document.getElementById('playerTagline'),
  walletVp: document.getElementById('walletVp'),
  walletRp: document.getElementById('walletRp'),
  walletKc: document.getElementById('walletKc'),
  btnRefresh: document.getElementById('btnRefresh'),
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  dailySkinsGrid: document.getElementById('dailySkinsGrid'),
  dailyTimer: document.getElementById('dailyTimer'),
  nightMarketGrid: document.getElementById('nightMarketGrid'),
  nightMarketTimer: document.getElementById('nightMarketTimer'),
  nightMarketTabBtn: document.getElementById('nightMarketTabBtn'),
  nightMarketBadge: document.getElementById('nightMarketBadge'),
  nightMarketGlow: document.getElementById('nightMarketGlow'),
  btnRevealAll: document.getElementById('btnRevealAll'),
  bundleCover: document.getElementById('bundleCover'),
  bundleName: document.getElementById('bundleName'),
  bundleTimer: document.getElementById('bundleTimer'),
  bundleItemsGrid: document.getElementById('bundleItemsGrid'),
  wishlistCountBadge: document.getElementById('wishlistCountBadge'),
  wishlistAlertBanner: document.getElementById('wishlistAlertBanner'),
  wishlistAlertText: document.getElementById('wishlistAlertText'),
  skinSearchInput: document.getElementById('skinSearchInput'),
  searchCount: document.getElementById('searchCount'),
  trackedSkinsGrid: document.getElementById('trackedSkinsGrid'),
  trackedCount: document.getElementById('trackedCount'),
  catalogGrid: document.getElementById('catalogGrid'),
  
  // Inspect Modal
  inspectModal: document.getElementById('inspectModal'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalWeaponImg: document.getElementById('modalWeaponImg'),
  modalVideoContainer: document.getElementById('modalVideoContainer'),
  modalVideoPlayer: document.getElementById('modalVideoPlayer'),
  btnShowImage: document.getElementById('btnShowImage'),
  btnShowVideo: document.getElementById('btnShowVideo'),
  modalTierBadge: document.getElementById('modalTierBadge'),
  modalTierIcon: document.getElementById('modalTierIcon'),
  modalTierName: document.getElementById('modalTierName'),
  modalSkinName: document.getElementById('modalSkinName'),
  modalPriceVal: document.getElementById('modalPriceVal'),
  modalChromas: document.getElementById('modalChromas'),
  modalLevels: document.getElementById('modalLevels'),
  modalWishlistToggle: document.getElementById('modalWishlistToggle'),

  // Auth / Login Modal
  authModal: document.getElementById('authModal'),
  authModalCloseBtn: document.getElementById('authModalCloseBtn'),
  btnOpenAuthModal: document.getElementById('btnOpenAuthModal'),
  authSourceDot: document.getElementById('authSourceDot'),
  authSourceLabel: document.getElementById('authSourceLabel'),
  authTabBtns: document.querySelectorAll('.auth-tab-btn'),
  panelOfficial: document.getElementById('panelOfficial'),
  officialShard: document.getElementById('officialShard'),
  btnLaunchOfficialAuth: document.getElementById('btnLaunchOfficialAuth'),
  officialAuthBtnText: document.getElementById('officialAuthBtnText'),
  officialAuthSpinner: document.getElementById('officialAuthSpinner'),
  authAutoIndicator: document.getElementById('authAutoIndicator'),
  authStatusText: document.getElementById('authStatusText'),
  officialErrorMsg: document.getElementById('officialErrorMsg'),
  btnToggleManualPaste: document.getElementById('btnToggleManualPaste'),
  manualPasteDrawer: document.getElementById('manualPasteDrawer'),
  officialRedirectUrl: document.getElementById('officialRedirectUrl'),
  btnSubmitManualToken: document.getElementById('btnSubmitManualToken'),
  panelLockfile: document.getElementById('panelLockfile'),
  lockfileStatusDetail: document.getElementById('lockfileStatusDetail'),
  btnSwitchLockfile: document.getElementById('btnSwitchLockfile')
};

// Initializer
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initModal();
  initAuthModal();
  initSearch();
  initRefresh();
  initMainCardEvents();

  // Check if current URL has #access_token= from Riot redirect
  if (window.location.hash && window.location.hash.includes('access_token=')) {
    const rawHash = window.location.hash;
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
    if (DOM.statusText) {
      DOM.statusText.textContent = "● 官方登入成功，正在獲取商城資料...";
      DOM.statusText.style.color = "var(--nm-purple)";
    }
    try {
      const preferredShard = localStorage.getItem('val_preferred_shard') || 'ap';
      const res = await fetch('/api/auth/token-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrToken: rawHash, shard: preferredShard })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success' && data.session) {
        saveSession(data.session);
        AudioFX.play('fanfare');
        closeAuthModal();
      } else {
        console.error("Auto hash login failed:", data);
        alert("Riot 官方授權失敗：" + (data.message || "驗證逾時或失效"));
      }
    } catch (e) {
      console.warn("Auto hash login failed:", e);
    }
  }

  // Load saved session if exists
  restoreSession();

  await loadWishlist();
  loadSkinCatalog();
  setInterval(tickTimers, 1000);

  if (STATE.session) {
    await loadStoreData();
  } else {
    // If not logged in, directly prompt for Riot Login!
    DOM.statusText.textContent = "○ 請登入 Riot 官方帳號";
    DOM.statusText.style.color = "var(--val-red)";
    DOM.authSourceDot.classList.add('credentials');
    DOM.authSourceLabel.textContent = "官方登入";
    renderDailyStore(null);
    openAuthModal('official');
  }
});

function restoreSession() {
  const saved = sessionStorage.getItem('val_session') || localStorage.getItem('val_session');
  if (saved) {
    try {
      STATE.session = JSON.parse(saved);
    } catch (e) {
      STATE.session = null;
    }
  }
}

function saveSession(sessionObj, remember = true) {
  STATE.session = sessionObj;
  sessionStorage.setItem('val_session', JSON.stringify(sessionObj));
  if (remember) {
    localStorage.setItem('val_session', JSON.stringify(sessionObj));
  }
}

function clearSession() {
  STATE.session = null;
  sessionStorage.removeItem('val_session');
  localStorage.removeItem('val_session');
}

// Tab Navigation
function initTabs() {
  DOM.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      AudioFX.play('click');
      const target = tab.dataset.tab;
      DOM.navTabs.forEach(t => t.classList.remove('active'));
      DOM.tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetContent = document.getElementById(`tab${target.charAt(0).toUpperCase() + target.slice(1)}`);
      if (targetContent) targetContent.classList.add('active');

      if (target === 'nightmarket') {
        DOM.nightMarketGlow.classList.add('active');
      } else {
        DOM.nightMarketGlow.classList.remove('active');
      }
    });
  });
}

// Refresh Button
function initRefresh() {
  DOM.btnRefresh.addEventListener('click', async () => {
    AudioFX.play('click');
    DOM.btnRefresh.style.transform = 'rotate(180deg)';
    await loadStoreData();
    setTimeout(() => {
      DOM.btnRefresh.style.transform = '';
    }, 400);
  });
}

// Authentication Modal Logic
function initAuthModal() {
  DOM.btnOpenAuthModal.addEventListener('click', () => {
    AudioFX.play('click');
    openAuthModal();
  });

  DOM.authModalCloseBtn.addEventListener('click', closeAuthModal);
  DOM.authModal.addEventListener('click', (e) => {
    if (e.target === DOM.authModal) closeAuthModal();
  });

  // Switch between Tabs (Credentials, Official, Lockfile)
  DOM.authTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      AudioFX.play('click');
      switchAuthTab(btn.dataset.authtab);
    });
  });

  // Switch back to Lockfile
  DOM.btnSwitchLockfile.addEventListener('click', async () => {
    AudioFX.play('click');
    DOM.btnSwitchLockfile.disabled = true;
    DOM.btnSwitchLockfile.textContent = "正在同步本機遊戲...";
    try {
      clearSession(); // Remove manual session to trigger lockfile fallback
      const res = await fetch('/api/auth/switch-lockfile', { method: 'POST' });
      await res.json();
      closeAuthModal();
      await loadStoreData();
    } catch (e) {
      alert("切換失敗: " + e.message);
    } finally {
      DOM.btnSwitchLockfile.disabled = false;
      DOM.btnSwitchLockfile.textContent = "一鍵同步本機特戰英豪帳號";
    }
  });

  // Reset button state helper
  function resetAuthBtn() {
    if (DOM.btnLaunchOfficialAuth) {
      DOM.btnLaunchOfficialAuth.disabled = false;
      DOM.officialAuthBtnText.textContent = "前往 Riot 官方網站登入";
      DOM.officialAuthSpinner.style.display = 'none';
      DOM.authAutoIndicator.classList.remove('waiting');
      DOM.authStatusText.textContent = "支援自動偵測：跳轉完成或複製網址後切回此頁面將自動載入商城";
    }
    if (DOM.officialErrorMsg) DOM.officialErrorMsg.style.display = 'none';
  }

  // Quick Clipboard Load
  const btnQuickClipboardLoad = document.getElementById('btnQuickClipboardLoad');
  if (btnQuickClipboardLoad) {
    btnQuickClipboardLoad.addEventListener('click', async () => {
      AudioFX.play('click');
      let text = '';
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      } catch (e) {
        console.warn("Clipboard access denied:", e);
      }

      if (!text || (!text.includes('access_token=') && !text.includes('#'))) {
        text = DOM.officialRedirectUrl.value.trim();
      }

      if (!text) {
        alert('請先在官方跳轉頁面複製網址（或手動貼至輸入框）！');
        DOM.officialRedirectUrl.focus();
        return;
      }

      DOM.officialRedirectUrl.value = text;
      const shard = DOM.officialShard.value || 'ap';
      await executeTokenLogin(text, shard);
    });
  }

  // Execute Token Login
  async function executeTokenLogin(urlOrToken, shard) {
    if (!urlOrToken) return;
    DOM.officialErrorMsg.style.display = 'none';
    DOM.officialAuthBtnText.textContent = "正在驗證特戰英豪授權...";
    DOM.officialAuthSpinner.style.display = 'inline-block';
    DOM.btnLaunchOfficialAuth.disabled = true;

    try {
      const res = await fetch('/api/auth/token-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrToken: urlOrToken.trim(), shard: shard || 'ap' })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.status === 'success') {
        if (data.session) {
          saveSession(data.session);
        }
        AudioFX.play('fanfare');
        closeAuthModal();
        await loadStoreData();
      } else {
        DOM.officialErrorMsg.style.display = 'block';
        DOM.officialErrorMsg.textContent = data.message || "登入授權失敗，請確認已在 Riot 完成驗證。";
        resetAuthBtn();
      }
    } catch (err) {
      DOM.officialErrorMsg.style.display = 'block';
      DOM.officialErrorMsg.textContent = "連線失敗: " + err.message;
      resetAuthBtn();
    }
  }

  // Launch Riot Official Auth directly
  DOM.btnLaunchOfficialAuth.addEventListener('click', () => {
    AudioFX.play('click');
    DOM.officialErrorMsg.style.display = 'none';

    const origin = window.location.origin;
    const shard = DOM.officialShard.value || 'ap';
    localStorage.setItem('val_preferred_shard', shard);

    // Official Riot Sign-On URL with prompt=login and dynamic nonce
    const nonce = Date.now();
    const state = encodeURIComponent(window.location.origin);
    const authUrl = `https://auth.riotgames.com/authorize?redirect_uri=http%3A%2F%2Flocalhost%2Fredirect&client_id=riot-client&response_type=token%20id_token&scope=openid%20link%20ban%20lol_region&nonce=${nonce}&prompt=login&state=${state}`;
    
    // Open in dedicated popup or new tab so it's not blocked
    const width = 560;
    const height = 750;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const popup = window.open(authUrl, 'riot_auth_popup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`);

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.open(authUrl, '_blank');
    }

    DOM.officialAuthBtnText.textContent = "已開啟 Riot 官方登入頁面";
    DOM.authAutoIndicator.classList.add('waiting');
    DOM.authStatusText.textContent = "請在開啟的視窗中登入 Riot 帳號，完成後點擊「一鍵讀取剪貼簿」或貼上網址即可載入商城！";
  });

  // 1. Listen for postMessage from popup window redirect page
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'RIOT_AUTH_TOKEN' && event.data.hash) {
      const shard = DOM.officialShard.value || 'ap';
      await executeTokenLogin(event.data.hash, shard);
    }
  });

  // 2. BroadcastChannel cross-tab listener
  try {
    const bc = new BroadcastChannel('riot_auth_channel');
    bc.onmessage = async (event) => {
      if (event.data && event.data.type === 'RIOT_AUTH_TOKEN' && event.data.hash) {
        const shard = DOM.officialShard.value || 'ap';
        await executeTokenLogin(event.data.hash, shard);
      }
    };
  } catch(e) {}

  // 3. Storage event listener (localStorage fallback)
  window.addEventListener('storage', async (event) => {
    if (event.key === 'val_auth_hash' && event.newValue) {
      const hash = event.newValue;
      localStorage.removeItem('val_auth_hash');
      const shard = DOM.officialShard.value || 'ap';
      await executeTokenLogin(hash, shard);
    }
  });

  // 4. Focus / Visibility listener (automatically checks clipboard if copied)
  async function checkClipboardForToken() {
    if (!STATE.session) {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip && (clip.includes('access_token=') || clip.startsWith('eyJ'))) {
          const shard = DOM.officialShard?.value || localStorage.getItem('val_preferred_shard') || 'ap';
          await executeTokenLogin(clip, shard);
        }
      } catch(e) {}
    }
  }

  window.addEventListener('focus', checkClipboardForToken);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkClipboardForToken();
    }
  });

  // Manual submit listener
  if (DOM.btnToggleManualPaste) {
    DOM.btnToggleManualPaste.addEventListener('click', () => {
      if (DOM.manualPasteDrawer) {
        const isHidden = DOM.manualPasteDrawer.style.display === 'none';
        DOM.manualPasteDrawer.style.display = isHidden ? 'block' : 'none';
      }
    });
  }

  if (DOM.btnSubmitManualToken) {
    DOM.btnSubmitManualToken.addEventListener('click', async () => {
      AudioFX.play('click');
      const val = DOM.officialRedirectUrl.value.trim();
      if (!val) {
        alert('請先貼上跳轉後的網址或 Token！');
        DOM.officialRedirectUrl.focus();
        return;
      }
      const shard = DOM.officialShard.value || 'ap';
      await executeTokenLogin(val, shard);
    });
  }

  if (DOM.officialRedirectUrl) {
    DOM.officialRedirectUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (DOM.btnSubmitManualToken) DOM.btnSubmitManualToken.click();
      }
    });
  }
}

function switchAuthTab(tabName) {
  DOM.authTabBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.authtab === tabName);
  });
  if (DOM.panelOfficial) DOM.panelOfficial.classList.toggle('active', tabName === 'official');
  if (DOM.panelLockfile) DOM.panelLockfile.classList.toggle('active', tabName === 'lockfile');
}

function openAuthModal(defaultTab = 'official') {
  DOM.authModal.classList.add('open');
  if (DOM.officialErrorMsg) DOM.officialErrorMsg.style.display = 'none';
  resetAuthBtn();
  switchAuthTab(defaultTab);

  fetch('/api/status').then(r => r.json()).then(status => {
    if (status.environment === 'netlify') {
      DOM.lockfileStatusDetail.textContent = "您目前在雲端 Netlify 網頁，本機同步需在個人電腦開啟本機 server.py。";
      DOM.lockfileStatusDetail.style.color = "var(--text-secondary)";
    } else if (status.connected && status.authSource === 'lockfile') {
      DOM.lockfileStatusDetail.textContent = `🟢 已偵測到本機特戰英豪遊戲正在執行 (玩家: ${status.player?.name}#${status.player?.tag})`;
      DOM.lockfileStatusDetail.style.color = "var(--val-cyan)";
    } else if (STATE.session) {
      DOM.lockfileStatusDetail.textContent = `目前正使用官方授權模式 (玩家: ${STATE.session.name}#${STATE.session.tag})，可切換回本機。`;
      DOM.lockfileStatusDetail.style.color = "var(--text-secondary)";
    } else {
      DOM.lockfileStatusDetail.textContent = `未偵測到特戰英豪遊戲正在執行。請啟動遊戲或使用「Riot 官方安全登入」。`;
      DOM.lockfileStatusDetail.style.color = "var(--text-muted)";
    }
  }).catch(() => {
    DOM.lockfileStatusDetail.textContent = "請透過 Riot 官方安全登入以載入商城。";
  });
}

function closeAuthModal() {
  AudioFX.play('click');
  DOM.authModal.classList.remove('open');
}

// Load Store Data from Backend
async function loadStoreData() {
  DOM.statusText.textContent = "連線更新中...";

  // Prepare auth headers if custom session is active
  const headers = {};
  if (STATE.session) {
    headers['X-Riot-Access-Token'] = STATE.session.accessToken;
    headers['X-Riot-Entitlements-JWT'] = STATE.session.entitlementsToken;
    headers['X-Riot-Puuid'] = STATE.session.puuid;
    headers['X-Riot-Shard'] = STATE.session.shard || 'ap';
    if (STATE.session.name) {
      headers['X-Riot-Name'] = encodeURIComponent(STATE.session.name);
    }
    if (STATE.session.tag) {
      headers['X-Riot-Tag'] = encodeURIComponent(STATE.session.tag);
    }
  }

  try {
    const res = await fetch('/api/store', { headers });
    
    if (res.status === 401) {
      if (STATE.session) {
        clearSession();
        // Immediately try fallback to local client
        try {
          const fallbackRes = await fetch('/api/store');
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            STATE.data = fbData;
            applyStoreData(fbData);
            return;
          }
        } catch(e) {}
      }
      DOM.statusText.textContent = "○ 請登入 Riot 帳號";
      DOM.statusText.style.color = "var(--val-red)";
      openAuthModal('credentials');
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "無法取得商城資料");
    }

    const data = await res.json();
    STATE.data = data;
    applyStoreData(data);
    closeAuthModal();

  } catch (err) {
    console.error("Store error:", err);
    DOM.statusText.textContent = "○ 請登入 Riot 帳號";
    DOM.statusText.style.color = "var(--val-red)";
    renderDailyStore(null);
    if (!STATE.session) {
      openAuthModal('credentials');
    }
  }
}

function applyStoreData(data) {
  // Update Header Status & Source
  if (STATE.session || data.authSource === 'credentials') {
    DOM.authSourceDot.classList.add('credentials');
    DOM.authSourceLabel.textContent = "官方登入";
    DOM.statusText.textContent = `● 官方授權登入中 (${(STATE.session?.shard || data.player?.shard || 'AP').toUpperCase()})`;
    DOM.statusText.style.color = "var(--nm-purple)";
  } else {
    DOM.authSourceDot.classList.remove('credentials');
    DOM.authSourceLabel.textContent = "本機同步";
    DOM.statusText.textContent = "● 本機遊戲端同步中";
    DOM.statusText.style.color = "var(--val-cyan)";
  }

  const playerName = STATE.session?.name || data.player?.name || "特務";
  const playerTag = STATE.session?.tag || data.player?.tag || "VAL";
  DOM.playerName.textContent = playerName;
  DOM.playerTagline.textContent = `#${playerTag}`;

  // Update Wallet
  if (data.wallet) {
    DOM.walletVp.textContent = data.wallet.vp.toLocaleString();
    DOM.walletRp.textContent = data.wallet.rp.toLocaleString();
    DOM.walletKc.textContent = data.wallet.kc.toLocaleString();
  }

  // Timers
  STATE.timers.dailyRemaining = data.daily?.remainingSeconds || 0;
  STATE.timers.nightMarketRemaining = data.nightMarket?.remainingSeconds || 0;
  STATE.timers.bundleRemaining = data.bundle?.durationRemainingInSeconds || 0;

  // Render Views
  renderDailyStore(data.daily);
  renderNightMarket(data.nightMarket);
  renderFeaturedBundle(data.bundle);
  checkWishlistAlerts();
}

function renderMainLoginCard() {
  DOM.dailySkinsGrid.innerHTML = `
    <div class="empty-state login-prompt-card" style="grid-column: 1 / -1; padding: 2.5rem 1.5rem; text-align: center; background: rgba(15, 25, 35, 0.85); border: 1px solid rgba(255, 70, 85, 0.3); border-radius: 8px; max-width: 600px; margin: 1rem auto; width: 100%;">
      <div class="empty-state-icon" style="font-size: 2.8rem; margin-bottom: 0.75rem;">🛡️</div>
      <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem; font-weight: 800; color: #fff; letter-spacing: 1px;">特戰英豪 帳號登入</h2>
      <p style="font-size: 0.92rem; margin-bottom: 1.5rem; color: var(--text-secondary); line-height: 1.5;">
        請點擊下方透過 <strong>Riot 官方安全登入</strong>，以取得今日特選造型與夜市特惠！<br/>
        <span style="font-size: 0.82rem; color: var(--val-cyan);">🔒 密碼透過加密直連原廠 API，或使用官方網頁跳轉，絕不外洩。</span>
      </p>

      <div style="margin-bottom: 1.5rem;">
        <button type="button" class="tactical-action-btn primary-btn riot-auth-btn" id="btnMainLaunchRiot" style="width: 100%; margin: 0; padding: 1.15rem 1.25rem; font-size: 1.05rem; font-weight: 800;">
          <svg viewBox="0 0 24 24" fill="currentColor" class="riot-fist-icon"><path d="M12 2L3 9l9 13 9-13-9-7zm0 3.5L17.5 9 12 18 6.5 9 12 5.5z"/></svg>
          <span>🌐 前往 Riot 官方網站安全登入 (auth.riotgames.com)</span>
        </button>
      </div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
        <div style="font-size: 0.85rem; color: var(--val-cyan); font-weight: 700; margin-bottom: 0.4rem;">官方網站登入完成？貼上跳轉網址或讀取剪貼簿：</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.65rem; line-height: 1.5;">
          📱 <strong>跨裝置 / 手機登入提示：</strong>登入後若網址跳轉至 <code>localhost/redirect#access_token=...</code>（顯示連線失敗為 Riot 官方原廠機制），請<strong>直接複製上方網址列整行連結</strong>，切回此頁面點擊「一鍵讀取剪貼簿」即可瞬間載入商城！
        </div>
        <button type="button" class="tactical-action-btn secondary-btn" id="btnMainClipboardLoad" style="width: 100%; margin-bottom: 0.6rem; border-color: rgba(0, 245, 212, 0.4); color: var(--val-cyan); padding: 0.75rem; font-weight: 700;">
          📋 一鍵讀取剪貼簿並載入商城
        </button>
        <div class="url-input-wrapper">
          <input type="text" id="mainRedirectUrlInput" class="tactical-input" placeholder="貼上跳轉網址 (http://localhost/redirect#... 或 Token)" />
          <button type="button" class="btn-paste-clipboard" id="btnMainSubmitUrl">確認載入</button>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; justify-content: center; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn-text-link" id="btnMainSyncLockfile" style="color: var(--val-cyan); font-size: 0.9rem;">
          🎮 電腦正在執行特戰英豪？點此一鍵免登入同步
        </button>
        <span style="color: rgba(255,255,255,0.2);">|</span>
        <a href="https://auth.riotgames.com/logout" target="_blank" rel="noopener noreferrer" style="color: var(--text-muted); font-size: 0.82rem; text-decoration: underline;">
          🔄 切換帳號？點此登出 Riot 官方 Session
        </a>
      </div>
    </div>`;

  initMainCardEvents();
}

function initMainCardEvents() {
  const btnMainLaunchRiot = document.getElementById('btnMainLaunchRiot');
  if (btnMainLaunchRiot) {
    btnMainLaunchRiot.onclick = () => {
      AudioFX.play('click');
      const nonce = Date.now();
      const state = encodeURIComponent(window.location.origin);
      const authUrl = `https://auth.riotgames.com/authorize?redirect_uri=http%3A%2F%2Flocalhost%2Fredirect&client_id=riot-client&response_type=token%20id_token&scope=openid%20link%20ban%20lol_region&nonce=${nonce}&prompt=login&state=${state}`;
      window.open(authUrl, '_blank');
    };
  }

  const btnMainClipboardLoad = document.getElementById('btnMainClipboardLoad');
  const mainRedirectUrlInput = document.getElementById('mainRedirectUrlInput');
  if (btnMainClipboardLoad) {
    btnMainClipboardLoad.onclick = async () => {
      AudioFX.play('click');
      let text = '';
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      } catch (e) {}
      if (!text || (!text.includes('access_token=') && !text.includes('#'))) {
        text = mainRedirectUrlInput?.value.trim() || '';
      }
      if (!text) {
        alert('請先在官方登入分頁複製整行網址，或手動貼至輸入框！');
        mainRedirectUrlInput?.focus();
        return;
      }
      if (mainRedirectUrlInput) mainRedirectUrlInput.value = text;
      const shard = (typeof mainShardSelect !== 'undefined' ? mainShardSelect?.value : null) || DOM.officialShard?.value || localStorage.getItem('val_preferred_shard') || 'ap';
      await executeTokenLogin(text, shard);
    };
  }

  const btnMainSubmitUrl = document.getElementById('btnMainSubmitUrl');
  if (btnMainSubmitUrl) {
    btnMainSubmitUrl.onclick = async () => {
      AudioFX.play('click');
      const text = mainRedirectUrlInput?.value.trim();
      if (!text) {
        alert('請貼上包含 access_token 的完整跳轉網址！');
        mainRedirectUrlInput?.focus();
        return;
      }
      const shard = (typeof mainShardSelect !== 'undefined' ? mainShardSelect?.value : null) || DOM.officialShard?.value || localStorage.getItem('val_preferred_shard') || 'ap';
      await executeTokenLogin(text, shard);
    };
  }

  if (mainRedirectUrlInput) {
    mainRedirectUrlInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnMainSubmitUrl?.click();
      }
    };
  }

  const btnMainSyncLockfile = document.getElementById('btnMainSyncLockfile');
  if (btnMainSyncLockfile) {
    btnMainSyncLockfile.onclick = async () => {
      AudioFX.play('click');
      btnMainSyncLockfile.textContent = "正在同步本機遊戲...";
      try {
        clearSession();
        await fetch('/api/auth/switch-lockfile', { method: 'POST' });
        await loadStoreData();
      } catch (e) {
        alert("本機同步失敗：" + e.message);
      } finally {
        btnMainSyncLockfile.textContent = "🎮 電腦正在執行特戰英豪？點此一鍵免登入同步";
      }
    };
  }
}

// Render Daily Store 4 Skins
function renderDailyStore(daily) {
  if (!daily || !daily.items || daily.items.length === 0) {
    renderMainLoginCard();
    return;
  }

  DOM.dailySkinsGrid.innerHTML = '';
  daily.items.forEach(item => {
    const skin = item.skin || {};
    const tier = skin.contentTier || { color: '#009587', devName: 'Deluxe' };
    const isWish = STATE.wishlist.has(skin.uuid);

    const card = document.createElement('div');
    card.className = 'skin-card';
    card.style.setProperty('--card-tier-color', tier.color);

    card.innerHTML = `
      ${isWish ? '<div class="wishlist-flag">★ 心願造型</div>' : ''}
      <div class="card-top-meta">
        <div class="tier-badge">
          ${tier.icon ? `<img src="${tier.icon}" alt="${tier.devName}" />` : ''}
          <span>${tier.devName.toUpperCase()}</span>
        </div>
        <button class="wish-toggle-btn ${isWish ? 'active' : ''}" title="加入心願單" data-uuid="${skin.uuid}">
          ★
        </button>
      </div>

      <div class="card-weapon-stage">
        <img class="weapon-img" src="${skin.displayIcon || ''}" alt="${skin.displayName}" loading="lazy" />
      </div>

      <div class="card-bottom-info">
        <h3 class="skin-name">${skin.displayName || '特務造型'}</h3>
        <div class="price-row">
          <div class="price-box">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 9l9 13 9-13-9-7zm0 3.5L17.5 9 12 18 6.5 9 12 5.5z"/></svg>
            <span>${item.cost ? item.cost.toLocaleString() : '--'}</span>
          </div>
          <span class="inspect-trigger">檢視詳情 //</span>
        </div>
      </div>
    `;

    const wishBtn = card.querySelector('.wish-toggle-btn');
    wishBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(skin.uuid, skin);
    });

    card.addEventListener('click', () => {
      openInspectModal(skin, item.cost);
    });

    DOM.dailySkinsGrid.appendChild(card);
  });
}

// Render Night Market (6 Tarot Cards)
function renderNightMarket(nm) {
  if (!nm || !nm.active || !nm.offers || nm.offers.length === 0) {
    DOM.nightMarketTabBtn.style.opacity = '0.6';
    DOM.nightMarketBadge.textContent = '未開啟';
    DOM.nightMarketBadge.classList.remove('glow');
    DOM.nightMarketGrid.innerHTML = `<div class="empty-state">目前特戰英豪尚未開啟夜市活動，開放時系統將自動呈現！</div>`;
    return;
  }

  DOM.nightMarketTabBtn.style.opacity = '1';
  DOM.nightMarketBadge.textContent = '特惠開放中';
  DOM.nightMarketBadge.classList.add('glow');

  DOM.nightMarketGrid.innerHTML = '';

  nm.offers.forEach((offer, idx) => {
    const skin = offer.skin || {};
    const tier = skin.contentTier || { color: '#8338ec', devName: 'NightMarket' };
    const offerId = offer.bonusOfferId || `${idx}`;
    const isFlipped = STATE.flippedNightMarket.has(offerId);

    const cardContainer = document.createElement('div');
    cardContainer.className = `nm-card-container ${isFlipped ? 'flipped' : ''}`;
    cardContainer.dataset.offerId = offerId;

    cardContainer.innerHTML = `
      <div class="nm-card-inner">
        <div class="nm-card-face nm-card-back">
          <div class="nm-pattern-box">
            <div class="nm-rune-icon">✦</div>
          </div>
          <span class="nm-click-prompt">點擊揭曉折扣</span>
        </div>

        <div class="nm-card-face nm-card-front" style="--card-tier-color: ${tier.color};">
          <div class="nm-discount-badge">-${offer.discountPercent}%</div>
          <div class="nm-front-tier">
            ${tier.icon ? `<img src="${tier.icon}" style="width:12px; height:12px; display:inline;" />` : ''}
            ${tier.devName.toUpperCase()}
          </div>

          <div class="nm-weapon-stage">
            <img class="nm-weapon-img" src="${skin.displayIcon || ''}" alt="${skin.displayName}" loading="lazy" />
          </div>

          <div class="nm-front-info">
            <h4 class="nm-skin-name">${skin.displayName}</h4>
            <div class="nm-price-cluster">
              <span class="nm-orig-price">${offer.originalCost?.toLocaleString()} VP</span>
              <span class="nm-disc-price">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 9l9 13 9-13-9-7zm0 3.5L17.5 9 12 18 6.5 9 12 5.5z"/></svg>
                ${offer.discountCost?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    cardContainer.addEventListener('click', () => {
      if (!cardContainer.classList.contains('flipped')) {
        AudioFX.play('flip');
        cardContainer.classList.add('flipped');
        STATE.flippedNightMarket.add(offerId);
      } else {
        openInspectModal(skin, offer.discountCost);
      }
    });

    DOM.nightMarketGrid.appendChild(cardContainer);
  });

  DOM.btnRevealAll.onclick = () => {
    AudioFX.play('flip');
    const cards = document.querySelectorAll('.nm-card-container');
    cards.forEach((c, index) => {
      setTimeout(() => {
        c.classList.add('flipped');
        STATE.flippedNightMarket.add(c.dataset.offerId);
      }, index * 100);
    });
  };
}

// Render Featured Bundle
function renderFeaturedBundle(bundle) {
  if (!bundle) {
    DOM.bundleCover.style.display = 'none';
    DOM.bundleItemsGrid.innerHTML = `<div class="empty-state">尚無精選組合包資料。</div>`;
    return;
  }

  DOM.bundleCover.style.display = 'flex';
  DOM.bundleCover.style.backgroundImage = `url('${bundle.displayIcon2 || bundle.displayIcon || ''}')`;
  DOM.bundleName.textContent = bundle.displayName;

  DOM.bundleItemsGrid.innerHTML = '';
  (bundle.items || []).forEach(item => {
    const skin = item.skin || {};
    const card = document.createElement('div');
    card.className = 'skin-card';
    card.style.setProperty('--card-tier-color', skin.contentTier?.color || '#5a9fe2');

    card.innerHTML = `
      <div class="card-weapon-stage">
        <img class="weapon-img" src="${skin.displayIcon || ''}" alt="${skin.displayName}" loading="lazy" />
      </div>
      <div class="card-bottom-info">
        <h4 class="skin-name">${skin.displayName || '組合包物品'}</h4>
        <div class="price-row">
          <div class="price-box">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 9l9 13 9-13-9-7zm0 3.5L17.5 9 12 18 6.5 9 12 5.5z"/></svg>
            <span>${item.discountedPrice !== undefined ? item.discountedPrice.toLocaleString() : item.basePrice?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      openInspectModal(skin, item.discountedPrice || item.basePrice);
    });

    DOM.bundleItemsGrid.appendChild(card);
  });
}

// Countdown Timers
function tickTimers() {
  if (STATE.timers.dailyRemaining > 0) {
    STATE.timers.dailyRemaining--;
    DOM.dailyTimer.textContent = formatHMS(STATE.timers.dailyRemaining);
  } else {
    DOM.dailyTimer.textContent = "00:00:00";
  }

  if (STATE.timers.nightMarketRemaining > 0) {
    STATE.timers.nightMarketRemaining--;
    DOM.nightMarketTimer.textContent = formatDaysHMS(STATE.timers.nightMarketRemaining);
  }

  if (STATE.timers.bundleRemaining > 0) {
    STATE.timers.bundleRemaining--;
    DOM.bundleTimer.textContent = formatDaysHMS(STATE.timers.bundleRemaining);
  }
}

function formatHMS(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function formatDaysHMS(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}小時 ${m}分`;
}

// Wishlist Logic
async function loadWishlist() {
  try {
    const res = await fetch('/api/wishlist');
    if (res.ok) {
      const list = await res.json();
      STATE.wishlist = new Set(list);
    }
  } catch (e) {
    const saved = localStorage.getItem('val_wishlist');
    if (saved) STATE.wishlist = new Set(JSON.parse(saved));
  }
  updateWishlistUI();
}

async function saveWishlistToServer() {
  const arr = Array.from(STATE.wishlist);
  localStorage.setItem('val_wishlist', JSON.stringify(arr));
  try {
    await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(arr)
    });
  } catch (e) {
    console.error("Save wishlist error:", e);
  }
}

function toggleWishlist(uuid, skinMeta) {
  AudioFX.play('click');
  if (STATE.wishlist.has(uuid)) {
    STATE.wishlist.delete(uuid);
  } else {
    STATE.wishlist.add(uuid);
    AudioFX.play('fanfare');
  }
  saveWishlistToServer();
  updateWishlistUI();
  
  if (STATE.data?.daily) renderDailyStore(STATE.data.daily);
  checkWishlistAlerts();
}

function updateWishlistUI() {
  DOM.wishlistCountBadge.textContent = STATE.wishlist.size;
  DOM.trackedCount.textContent = STATE.wishlist.size;
  renderTrackedWishlist();
}

function renderTrackedWishlist() {
  if (STATE.wishlist.size === 0) {
    DOM.trackedSkinsGrid.innerHTML = `<div class="empty-state">尚未加入任何心願造型，請於下方搜尋或瀏覽資料庫加入收藏！</div>`;
    return;
  }

  DOM.trackedSkinsGrid.innerHTML = '';
  STATE.wishlist.forEach(uuid => {
    const item = STATE.catalog.find(s => s.uuid === uuid);
    if (!item) return;

    const card = document.createElement('div');
    card.className = 'catalog-item-card';
    card.innerHTML = `
      <div class="cat-stage">
        <img class="cat-img" src="${item.displayIcon || ''}" alt="${item.displayName}" loading="lazy" />
      </div>
      <div class="cat-name">${item.displayName}</div>
      <div class="cat-footer">
        <span class="cat-tier-badge" style="color: ${item.contentTier?.color || '#fff'}">
          ${item.contentTier?.devName || ''}
        </span>
        <button class="wish-toggle-btn active" title="移除追蹤">★</button>
      </div>
    `;

    card.querySelector('.wish-toggle-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(uuid, item);
    });

    card.addEventListener('click', () => {
      openInspectModal(item);
    });

    DOM.trackedSkinsGrid.appendChild(card);
  });
}

function checkWishlistAlerts() {
  if (STATE.wishlist.size === 0 || !STATE.data) {
    DOM.wishlistAlertBanner.style.display = 'none';
    return;
  }

  const matches = [];
  (STATE.data.daily?.items || []).forEach(i => {
    if (STATE.wishlist.has(i.skin?.uuid)) {
      matches.push(i.skin.displayName);
    }
  });

  (STATE.data.nightMarket?.offers || []).forEach(o => {
    if (STATE.wishlist.has(o.skin?.uuid)) {
      matches.push(o.skin.displayName);
    }
  });

  if (matches.length > 0) {
    DOM.wishlistAlertBanner.style.display = 'flex';
    DOM.wishlistAlertText.textContent = `🎉 狂賀！今日商城有符合您心願單的造型：【${matches.join('、')}】！`;
    AudioFX.play('fanfare');
  } else {
    DOM.wishlistAlertBanner.style.display = 'none';
  }
}

// Catalog Search
async function loadSkinCatalog() {
  try {
    const res = await fetch('/api/skins');
    if (res.ok) {
      STATE.catalog = await res.json();
      DOM.searchCount.textContent = `共 ${STATE.catalog.length} 款`;
      renderCatalog(STATE.catalog.slice(0, 30));
      renderTrackedWishlist();
    }
  } catch (e) {
    console.error("Failed to load catalog:", e);
  }
}

function initSearch() {
  let debounceTimeout;
  DOM.skinSearchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      const q = DOM.skinSearchInput.value.trim().toLowerCase();
      if (!q) {
        renderCatalog(STATE.catalog.slice(0, 30));
        DOM.searchCount.textContent = `共 ${STATE.catalog.length} 款`;
        return;
      }
      const filtered = STATE.catalog.filter(s => s.displayName.toLowerCase().includes(q));
      DOM.searchCount.textContent = `找到 ${filtered.length} 款`;
      renderCatalog(filtered.slice(0, 50));
    }, 250);
  });
}

function renderCatalog(skins) {
  DOM.catalogGrid.innerHTML = '';
  skins.forEach(item => {
    const isWish = STATE.wishlist.has(item.uuid);
    const card = document.createElement('div');
    card.className = 'catalog-item-card';
    card.innerHTML = `
      <div class="cat-stage">
        <img class="cat-img" src="${item.displayIcon || ''}" alt="${item.displayName}" loading="lazy" />
      </div>
      <div class="cat-name">${item.displayName}</div>
      <div class="cat-footer">
        <span class="cat-tier-badge" style="color: ${item.contentTier?.color || '#fff'}">
          ${item.contentTier?.devName || ''}
        </span>
        <button class="wish-toggle-btn ${isWish ? 'active' : ''}" title="加入心願單">★</button>
      </div>
    `;

    card.querySelector('.wish-toggle-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(item.uuid, item);
      e.target.classList.toggle('active', STATE.wishlist.has(item.uuid));
    });

    card.addEventListener('click', () => {
      openInspectModal(item);
    });

    DOM.catalogGrid.appendChild(card);
  });
}

// Modal Inspection
function initModal() {
  DOM.modalCloseBtn.addEventListener('click', closeInspectModal);
  DOM.inspectModal.addEventListener('click', (e) => {
    if (e.target === DOM.inspectModal) closeInspectModal();
  });

  DOM.btnShowImage.addEventListener('click', () => {
    AudioFX.play('click');
    DOM.btnShowImage.classList.add('active');
    DOM.btnShowVideo.classList.remove('active');
    DOM.modalWeaponImg.parentElement.style.display = 'flex';
    DOM.modalVideoContainer.style.display = 'none';
    DOM.modalVideoPlayer.pause();
  });

  DOM.btnShowVideo.addEventListener('click', () => {
    AudioFX.play('click');
    DOM.btnShowVideo.classList.add('active');
    DOM.btnShowImage.classList.remove('active');
    DOM.modalWeaponImg.parentElement.style.display = 'none';
    DOM.modalVideoContainer.style.display = 'block';
    DOM.modalVideoPlayer.play();
  });

  DOM.modalWishlistToggle.addEventListener('click', () => {
    if (STATE.currentInspectSkin) {
      toggleWishlist(STATE.currentInspectSkin.uuid, STATE.currentInspectSkin);
      updateModalWishlistBtn();
    }
  });
}

function openInspectModal(skin, price) {
  AudioFX.play('click');
  STATE.currentInspectSkin = skin;

  DOM.modalSkinName.textContent = skin.displayName || '造型預覽';
  DOM.modalWeaponImg.src = skin.displayIcon || '';
  DOM.modalPriceVal.textContent = price ? `${price.toLocaleString()} VP` : '精選限定';

  const tier = skin.contentTier || { devName: 'Deluxe', color: '#009587' };
  DOM.modalTierName.textContent = tier.devName.toUpperCase();
  DOM.modalTierName.style.color = tier.color;
  if (tier.icon) {
    DOM.modalTierIcon.src = tier.icon;
    DOM.modalTierIcon.style.display = 'block';
  } else {
    DOM.modalTierIcon.style.display = 'none';
  }

  // Chromas
  DOM.modalChromas.innerHTML = '';
  const chromas = skin.chromas || [];
  if (chromas.length > 0) {
    chromas.forEach((c, idx) => {
      const swatchBtn = document.createElement('button');
      swatchBtn.className = `chroma-swatch-btn ${idx === 0 ? 'active' : ''}`;
      swatchBtn.title = c.displayName;
      if (c.swatch) {
        swatchBtn.innerHTML = `<img src="${c.swatch}" alt="${c.displayName}" />`;
      } else {
        swatchBtn.innerHTML = `<span style="font-size:0.7rem; font-weight:700;">#${idx+1}</span>`;
      }

      swatchBtn.addEventListener('click', () => {
        AudioFX.play('click');
        DOM.modalChromas.querySelectorAll('.chroma-swatch-btn').forEach(b => b.classList.remove('active'));
        swatchBtn.classList.add('active');
        DOM.modalWeaponImg.src = c.fullRender || c.displayIcon || skin.displayIcon;
      });

      DOM.modalChromas.appendChild(swatchBtn);
    });
  } else {
    DOM.modalChromas.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">此造型無炫彩換色款式</span>`;
  }

  // Levels & Video
  DOM.modalLevels.innerHTML = '';
  let videoFound = null;
  const levels = skin.levels || [];
  if (levels.length > 0) {
    levels.forEach((lvl, idx) => {
      const hasVid = !!lvl.streamedVideo;
      if (hasVid && !videoFound) videoFound = lvl.streamedVideo;

      const row = document.createElement('div');
      row.className = `level-row ${hasVid ? 'has-video' : ''}`;
      row.innerHTML = `
        <div class="level-left">
          <span class="level-idx">LV.${idx + 1}</span>
          <span>${lvl.displayName || '等級升級'}</span>
        </div>
        ${hasVid ? `<span class="level-badge-tag">具備特效影片</span>` : ''}
      `;
      DOM.modalLevels.appendChild(row);
    });
  }

  if (videoFound) {
    STATE.activeVideoUrl = videoFound;
    DOM.modalVideoPlayer.src = videoFound;
    DOM.btnShowVideo.style.display = 'block';
  } else {
    STATE.activeVideoUrl = null;
    DOM.btnShowVideo.style.display = 'none';
  }

  DOM.btnShowImage.click();
  updateModalWishlistBtn();
  DOM.inspectModal.classList.add('open');
}

function updateModalWishlistBtn() {
  if (!STATE.currentInspectSkin) return;
  const isWish = STATE.wishlist.has(STATE.currentInspectSkin.uuid);
  DOM.modalWishlistToggle.classList.toggle('active', isWish);
  DOM.modalWishlistToggle.innerHTML = isWish ? 
    `★ 已在心願單中 (點擊移除)` : 
    `☆ 加入造型心願單`;
}

function closeInspectModal() {
  AudioFX.play('click');
  DOM.inspectModal.classList.remove('open');
  DOM.modalVideoPlayer.pause();
  DOM.modalVideoPlayer.src = '';
}
