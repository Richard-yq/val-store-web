/**
 * Netlify Serverless Function for VALORANT PROTOCOL STORE WEB
 * Stateless, Multi-User, and Cloud-Ready
 */

// In-memory cache for Lambda container reuse
let ASSETS_CACHE = {
  skinsByLevel: null,
  skinsById: null,
  allSkins: null,
  bundles: null,
  tiers: null,
  clientVersion: "release-13.06-shipping-13-5435758",
  lastFetched: 0
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Riot-Access-Token, X-Riot-Entitlements-JWT, X-Riot-Puuid, X-Riot-Shard, X-Riot-Name, X-Riot-Tag",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

exports.handler = async (event, context) => {
  const method = event.httpMethod;
  const path = event.path.replace(/\/\.netlify\/functions\/api/, "").replace(/^\/api/, "");

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    await ensureAssetsLoaded();

    // 1. Status
    if (path === "/status" || path === "") {
      return jsonResponse({
        status: "ok",
        environment: "netlify",
        assetsReady: !!ASSETS_CACHE.skinsByLevel
      });
    }

    // 2. Skins catalog for wishlist search
    if (path === "/skins") {
      return jsonResponse(ASSETS_CACHE.allSkins || []);
    }

    // 3. Official Token / Redirect URL Login
    if (path === "/auth/token-login" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const urlOrToken = (body.urlOrToken || body.url || "").trim();
      const shard = body.shard || "ap";

      if (!urlOrToken) {
        return jsonResponse({ status: "error", message: "請提供跳轉網址或 Access Token" }, 400);
      }

      const tokenRes = await exchangeTokensAndBuildSession(urlOrToken, shard);
      return jsonResponse(tokenRes);
    }

    // Deprecated: Username & Password Login (Disabled for security)
    if (path === "/auth/login" || path === "/auth/2fa") {
      return jsonResponse({
        status: "error",
        message: "為保障帳號安全，本站不經手任何密碼。請透過 Riot 官方網站安全跳轉登入 (Token Flow)。"
      }, 403);
    }

    // 5. Store & Night Market Fetch
    if (path === "/store" && method === "GET") {
      const headers = event.headers || {};
      const accessToken = headers["x-riot-access-token"] || headers["X-Riot-Access-Token"];
      const entitlementsToken = headers["x-riot-entitlements-jwt"] || headers["X-Riot-Entitlements-JWT"];
      const puuid = headers["x-riot-puuid"] || headers["X-Riot-Puuid"];
      const shard = headers["x-riot-shard"] || headers["X-Riot-Shard"] || "ap";

      if (!accessToken || !entitlementsToken || !puuid) {
        return jsonResponse({
          error: "未授權：請先登入 Riot 帳號",
          needsLogin: true
        }, 401);
      }

      const storeData = await fetchStoreData(accessToken, entitlementsToken, puuid, shard);
      return jsonResponse(storeData);
    }

    return jsonResponse({ error: "Endpoint Not Found: " + path }, 404);
  } catch (err) {
    console.error("API Error:", err);
    return jsonResponse({ error: err.message || "伺服器內部錯誤" }, 500);
  }
};

function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

// Ensure Valorant skins & bundles assets are loaded into Lambda memory
async function ensureAssetsLoaded() {
  const now = Date.now();
  if (ASSETS_CACHE.skinsByLevel && now - ASSETS_CACHE.lastFetched < 1000 * 60 * 60) {
    return;
  }

  try {
    // 1. Version
    const vRes = await fetch("https://valorant-api.com/v1/version");
    const vData = await vRes.json();
    ASSETS_CACHE.clientVersion = vData.data?.riotClientVersion || ASSETS_CACHE.clientVersion;

    // 2. Content Tiers
    const tRes = await fetch("https://valorant-api.com/v1/contenttiers");
    const tData = await tRes.json();
    const tiers = {};
    for (const t of tData.data || []) {
      let color = t.highlightColor || "ffffff";
      if (color.length === 8) color = color.slice(0, 6);
      tiers[t.uuid] = {
        uuid: t.uuid,
        devName: t.devName || "",
        color: "#" + color,
        icon: t.displayIcon
      };
    }
    ASSETS_CACHE.tiers = tiers;

    // 3. Bundles
    const bRes = await fetch("https://valorant-api.com/v1/bundles?language=zh-TW");
    const bData = await bRes.json();
    const bundles = {};
    for (const b of bData.data || []) {
      bundles[b.uuid] = {
        uuid: b.uuid,
        displayName: b.displayName || "",
        displayIcon: b.displayIcon,
        displayIcon2: b.displayIcon2
      };
    }
    ASSETS_CACHE.bundles = bundles;

    // 4. Weapons & Skins
    const sRes = await fetch("https://valorant-api.com/v1/weapons/skins?language=zh-TW");
    const sData = await sRes.json();
    const skinsByLevel = {};
    const skinsById = {};
    const allSkins = [];

    for (const s of sData.data || []) {
      if (s.displayName === "隨機" || s.displayName === "標準") continue;
      const tier = tiers[s.contentTierUuid] || { devName: "Standard", color: "#94a3b8", icon: null };
      
      const skinMeta = {
        uuid: s.uuid,
        displayName: s.displayName,
        displayIcon: s.displayIcon,
        contentTier: tier,
        levels: (s.levels || []).map(lvl => ({
          uuid: lvl.uuid,
          displayName: lvl.displayName,
          displayIcon: lvl.displayIcon || s.displayIcon,
          streamedVideo: lvl.streamedVideo
        })),
        chromas: (s.chromas || []).map(c => ({
          uuid: c.uuid,
          displayName: c.displayName,
          displayIcon: c.displayIcon || s.displayIcon,
          fullRender: c.fullRender || c.displayIcon || s.displayIcon,
          swatch: c.swatch
        }))
      };

      skinsById[s.uuid] = skinMeta;
      for (const lvl of s.levels || []) {
        skinsByLevel[lvl.uuid] = skinMeta;
      }

      allSkins.push({
        uuid: s.uuid,
        displayName: s.displayName,
        displayIcon: s.displayIcon,
        contentTier: tier
      });
    }

    ASSETS_CACHE.skinsByLevel = skinsByLevel;
    ASSETS_CACHE.skinsById = skinsById;
    ASSETS_CACHE.allSkins = allSkins;
    ASSETS_CACHE.lastFetched = now;
  } catch (err) {
    console.error("Asset load error in Netlify Function:", err);
  }
}

function resolveSkin(itemId) {
  if (ASSETS_CACHE.skinsByLevel && ASSETS_CACHE.skinsByLevel[itemId]) {
    return ASSETS_CACHE.skinsByLevel[itemId];
  }
  if (ASSETS_CACHE.skinsById && ASSETS_CACHE.skinsById[itemId]) {
    return ASSETS_CACHE.skinsById[itemId];
  }
  return {
    uuid: itemId,
    displayName: "特戰英豪造型",
    displayIcon: null,
    contentTier: { devName: "Deluxe", color: "#009587", icon: null },
    levels: [],
    chromas: []
  };
}

// Riot Token Exchange Implementation (Zero Password - 100% Client-Side Credentials)
async function exchangeTokensAndBuildSession(uri, shard = "ap") {
  try {
    let accessToken = null;
    let idToken = null;
    const cleanStr = (uri || "").trim();

    if (cleanStr.includes("#")) {
      const fragment = cleanStr.split("#")[1];
      const params = new URLSearchParams(fragment);
      accessToken = params.get("access_token");
      idToken = params.get("id_token");
    } else if (cleanStr.includes("?")) {
      const query = cleanStr.split("?")[1];
      const params = new URLSearchParams(query);
      accessToken = params.get("access_token");
      idToken = params.get("id_token");
    } else if (cleanStr.includes("access_token=")) {
      const params = new URLSearchParams(cleanStr);
      accessToken = params.get("access_token");
      idToken = params.get("id_token");
    } else if (!cleanStr.startsWith("http")) {
      accessToken = cleanStr;
    }

    if (!accessToken) {
      return { status: "error", message: "未能識別有效的 Access Token，請確認已貼上跳轉後的完整網址或 Token。" };
    }

    // 1. Entitlements
    const entRes = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "RiotClient/99.0.0.1234567.9876543 rso-auth (Windows;10;;Professional, x64)"
      },
      body: "{}"
    });
    if (!entRes.ok) {
      return { status: "error", message: "Token 已失效或不具備特戰英豪遊戲權限，請重新登入。" };
    }
    const entData = await entRes.json();
    const entitlementsToken = entData.entitlements_token;

    // 2. User Info
    let puuid = null;
    let name = "特務";
    let tag = "VAL";

    try {
      const uRes = await fetch("https://auth.riotgames.com/userinfo", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": "RiotClient/99.0.0.1234567.9876543 rso-auth (Windows;10;;Professional, x64)"
        }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        puuid = uData.sub;
        const acct = uData.acct || {};
        name = acct.game_name || "特務";
        tag = acct.tag_line || "VAL";
      }
    } catch (e) {
      console.warn("userinfo fetch failed:", e);
    }

    if (!puuid && idToken) {
      try {
        let b64 = idToken.split(".")[1];
        b64 += "=".repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
        puuid = payload.sub;
      } catch (e) {
        console.warn("id_token decode failed:", e);
      }
    }

    if (!puuid) {
      return { status: "error", message: "無法辨識您的 Riot PUUID，請重新登入。" };
    }

    if (name === "特務") {
      try {
        const nsRes = await fetch(`https://pd.${shard}.a.pvp.net/name-service/v2/players`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "X-Riot-Entitlements-JWT": entitlementsToken,
            "Content-Type": "application/json"
          },
          body: JSON.stringify([puuid])
        });
        if (nsRes.ok) {
          const nsData = await nsRes.json();
          if (Array.isArray(nsData) && nsData[0]) {
            if (nsData[0].GameName) name = nsData[0].GameName;
            if (nsData[0].TagLine) tag = nsData[0].TagLine;
          }
        }
      } catch (e) {
        console.warn("name-service fetch failed:", e);
      }
    }

    return {
      status: "success",
      session: {
        accessToken,
        entitlementsToken,
        puuid,
        name,
        tag,
        shard
      },
      player: {
        name,
        tag,
        shard
      }
    };
  } catch (err) {
    return { status: "error", message: "憑證解析失敗: " + err.message };
  }
}


// Fetch Storefront V3 & Wallet using user's tokens
async function fetchStoreData(accessToken, entitlementsToken, puuid, shard) {
  const clientVersion = ASSETS_CACHE.clientVersion;
  const clientPlatform = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "X-Riot-Entitlements-JWT": entitlementsToken,
    "X-Riot-ClientVersion": clientVersion,
    "X-Riot-ClientPlatform": clientPlatform,
    "User-Agent": `RiotClient/${clientVersion} (Windows; 10;;Enterprise; x64)`,
    "Content-Type": "application/json"
  };

  // 1. Fetch Wallet
  const wallet = { vp: 0, rp: 0, kc: 0 };
  try {
    const wRes = await fetch(`https://pd.${shard}.a.pvp.net/store/v1/wallet/${puuid}`, { headers });
    if (wRes.ok) {
      const wData = await wRes.json();
      const balances = wData.Balances || {};
      wallet.vp = balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"] || 0;
      wallet.kc = balances["85ca954a-41f2-ce94-9b45-8ca3dd39a00d"] || 0;
      wallet.rp = balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"] || 0;
    }
  } catch (e) {
    console.error("Wallet error:", e);
  }

  // 2. Fetch Storefront V3
  const sRes = await fetch(`https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`, {
    method: "POST",
    headers,
    body: "{}"
  });

  if (!sRes.ok) {
    throw new Error(`Riot 商城端點回應錯誤 (HTTP ${sRes.status})，可能是登入已過期。`);
  }

  const storeData = await sRes.json();

  // Daily Offers
  const dailyItems = [];
  const panel = storeData.SkinsPanelLayout || {};
  const itemOffers = panel.SingleItemStoreOffers || [];
  const remainingSecs = panel.SingleItemOffersRemainingDurationInSeconds || 0;

  for (const offer of itemOffers) {
    const itemId = offer.Rewards?.[0]?.ItemID || offer.OfferID;
    const cost = offer.Cost?.["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"] || 0;
    const skinMeta = resolveSkin(itemId);
    dailyItems.push({
      offerId: offer.OfferID,
      itemId,
      cost,
      skin: skinMeta
    });
  }

  // Night Market
  const nightMarket = { active: false, remainingSeconds: 0, offers: [] };
  const bonus = storeData.BonusStore;
  if (bonus && bonus.BonusStoreOffers) {
    nightMarket.active = true;
    nightMarket.remainingSeconds = bonus.BonusStoreRemainingDurationInSeconds || 0;
    for (const bo of bonus.BonusStoreOffers) {
      const offer = bo.Offer || {};
      const itemId = offer.Rewards?.[0]?.ItemID || bo.BonusOfferID;
      const origCost = Object.values(offer.Cost || {})[0] || 0;
      const discCost = Object.values(bo.DiscountCosts || {})[0] || 0;
      const discount = bo.DiscountPercent || 0;
      const skinMeta = resolveSkin(itemId);
      nightMarket.offers.push({
        bonusOfferId: bo.BonusOfferID,
        itemId,
        originalCost: origCost,
        discountCost: discCost,
        discountPercent: discount,
        skin: skinMeta
      });
    }
  }

  // Featured Bundle
  let bundleData = null;
  const featured = storeData.FeaturedBundle;
  if (featured && featured.Bundles && featured.Bundles.length > 0) {
    const b = featured.Bundles[0];
    const bundleMeta = (ASSETS_CACHE.bundles && ASSETS_CACHE.bundles[b.DataAssetID]) || {};
    const bundleItems = (b.Items || []).map(itm => ({
      itemId: itm.Item?.ItemID,
      basePrice: itm.BasePrice || 0,
      discountedPrice: itm.DiscountedPrice || 0,
      skin: resolveSkin(itm.Item?.ItemID)
    }));

    bundleData = {
      id: b.ID,
      dataAssetId: b.DataAssetID,
      displayName: bundleMeta.displayName || "精選特惠組合包",
      displayIcon: bundleMeta.displayIcon,
      displayIcon2: bundleMeta.displayIcon2,
      durationRemainingInSeconds: b.DurationRemainingInSeconds || 0,
      items: bundleItems
    };
  }

  return {
    authSource: "credentials",
    wallet,
    daily: {
      remainingSeconds: remainingSecs,
      items: dailyItems
    },
    nightMarket,
    bundle: bundleData
  };
}
