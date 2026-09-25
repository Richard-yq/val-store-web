import os
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(line_buffering=True)
import json
import ssl
import base64
import time
import uuid
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

PORT = 3000
BASE_DIR = Path(__file__).parent.resolve()
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
WISHLIST_FILE = DATA_DIR / "wishlist.json"

# In-memory assets cache
ASSETS = {
    "skins_by_level": {},
    "skins_by_id": {},
    "all_skins": [],
    "bundles": {},
    "tiers": {},
    "client_version": "release-13.06-shipping-13-5435758",
    "ready": False
}

ACTIVE_CREDENTIALS_SESSION = None
PENDING_MFA_SESSIONS = {}


def load_valorant_assets():
    """Fetches and caches all Valorant skins, tiers, and bundles in Traditional Chinese"""
    print("[Assets] Initializing Valorant-API asset cache (zh-TW)...")
    headers = {"User-Agent": "ValStoreWeb/1.0 (Mozilla/5.0)"}
    
    # 1. Version
    try:
        req = urllib.request.Request("https://valorant-api.com/v1/version", headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            ASSETS["client_version"] = data["data"]["riotClientVersion"]
            print(f"[Assets] Client Version: {ASSETS['client_version']}")
    except Exception as e:
        print(f"[Assets] Warning: Failed to fetch client version: {e}")

    # 2. Content Tiers (Rarity)
    try:
        req = urllib.request.Request("https://valorant-api.com/v1/contenttiers", headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            for tier in data["data"]:
                hex_color = tier.get("highlightColor") or "ffffff"
                if len(hex_color) == 8:
                    hex_color = hex_color[:6]
                ASSETS["tiers"][tier["uuid"]] = {
                    "uuid": tier["uuid"],
                    "devName": tier.get("devName", ""),
                    "color": f"#{hex_color}",
                    "icon": tier.get("displayIcon")
                }
            print(f"[Assets] Loaded {len(ASSETS['tiers'])} content tiers")
    except Exception as e:
        print(f"[Assets] Warning: Failed to fetch content tiers: {e}")

    # 3. Bundles
    try:
        req = urllib.request.Request("https://valorant-api.com/v1/bundles?language=zh-TW", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            for b in data["data"]:
                ASSETS["bundles"][b["uuid"]] = {
                    "uuid": b["uuid"],
                    "displayName": b.get("displayName", ""),
                    "displayIcon": b.get("displayIcon"),
                    "displayIcon2": b.get("displayIcon2"),
                    "verticalPromoImage": b.get("verticalPromoImage"),
                    "description": b.get("description", "")
                }
            print(f"[Assets] Loaded {len(ASSETS['bundles'])} bundles")
    except Exception as e:
        print(f"[Assets] Warning: Failed to fetch bundles: {e}")

    # 4. Weapons Skins
    try:
        req = urllib.request.Request("https://valorant-api.com/v1/weapons/skins?language=zh-TW", headers=headers)
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode())
            all_skins = []
            for s in data["data"]:
                if s.get("displayName") in ["隨機", "標準"]:
                    continue
                tier_id = s.get("contentTierUuid")
                tier_info = ASSETS["tiers"].get(tier_id, {
                    "devName": "Standard",
                    "color": "#94a3b8",
                    "icon": None
                })
                
                skin_summary = {
                    "uuid": s["uuid"],
                    "displayName": s.get("displayName", ""),
                    "displayIcon": s.get("displayIcon"),
                    "contentTier": tier_info,
                    "themeUuid": s.get("themeUuid"),
                    "levels": [
                        {
                            "uuid": lvl["uuid"],
                            "displayName": lvl.get("displayName", ""),
                            "levelItem": lvl.get("levelItem"),
                            "displayIcon": lvl.get("displayIcon") or s.get("displayIcon"),
                            "streamedVideo": lvl.get("streamedVideo")
                        } for lvl in s.get("levels", [])
                    ],
                    "chromas": [
                        {
                            "uuid": c["uuid"],
                            "displayName": c.get("displayName", ""),
                            "displayIcon": c.get("displayIcon") or s.get("displayIcon"),
                            "fullRender": c.get("fullRender") or c.get("displayIcon") or s.get("displayIcon"),
                            "swatch": c.get("swatch"),
                            "streamedVideo": c.get("streamedVideo")
                        } for c in s.get("chromas", [])
                    ]
                }
                
                ASSETS["skins_by_id"][s["uuid"]] = skin_summary
                for lvl in s.get("levels", []):
                    ASSETS["skins_by_level"][lvl["uuid"]] = skin_summary
                
                all_skins.append({
                    "uuid": s["uuid"],
                    "displayName": s.get("displayName", ""),
                    "displayIcon": s.get("displayIcon"),
                    "contentTier": tier_info
                })
            
            ASSETS["all_skins"] = all_skins
            print(f"[Assets] Loaded {len(all_skins)} weapon skins and mapped {len(ASSETS['skins_by_level'])} skin levels.")
            ASSETS["ready"] = True
    except Exception as e:
        print(f"[Assets] Error fetching weapon skins: {e}")


def get_lockfile_auth():
    """Reads the local Riot Client lockfile and retrieves the local authorization token"""
    lockfile_path = os.path.expandvars(r'%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile')
    if not os.path.exists(lockfile_path):
        return None, "未偵測到本機特戰英豪/Riot Client 執行中"
    
    try:
        with open(lockfile_path, 'r', encoding='utf-8') as f:
            parts = f.read().strip().split(':')
            if len(parts) < 5:
                return None, "本機 Lockfile 格式異常"
            name, pid, port, password, protocol = parts[0], parts[1], parts[2], parts[3], parts[4]
            
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        auth = base64.b64encode(f'riot:{password}'.encode()).decode()
        
        t_req = urllib.request.Request(f'https://127.0.0.1:{port}/entitlements/v1/token', headers={
            'Authorization': f'Basic {auth}',
            'Accept': 'application/json'
        })
        with urllib.request.urlopen(t_req, context=ctx, timeout=5) as resp:
            token_data = json.loads(resp.read().decode())
            
        access_token = token_data.get('accessToken')
        entitlements_token = token_data.get('token')
        puuid = token_data.get('subject')
        
        player_name = "Agent"
        player_tag = "VAL"
        try:
            u_req = urllib.request.Request(f'https://127.0.0.1:{port}/rso-auth/v1/authorization/userinfo', headers={
                'Authorization': f'Basic {auth}',
                'Accept': 'application/json'
            })
            with urllib.request.urlopen(u_req, context=ctx, timeout=5) as u_resp:
                u_raw = json.loads(u_resp.read().decode())
                user_info = json.loads(u_raw.get('userInfo', '{}'))
                acct = user_info.get('acct', {})
                if 'game_name' in acct:
                    player_name = acct['game_name']
                    player_tag = acct.get('tag_line', '')
        except Exception:
            pass
            
        return {
            "source": "lockfile",
            "access_token": access_token,
            "entitlements_token": entitlements_token,
            "puuid": puuid,
            "name": player_name,
            "tag": player_tag,
            "shard": "ap"
        }, None
    except Exception as e:
        return None, f"通訊失敗: {str(e)}"


def riot_token_login(url_or_token, shard="ap"):
    """Validates and initializes session from official Riot OAuth redirect URL or raw token"""
    global ACTIVE_CREDENTIALS_SESSION
    url_or_token = (url_or_token or "").strip()
    access_token = None
    id_token = None
    
    # 1. Parse token from URL fragment, query string, or raw string
    if "#" in url_or_token:
        fragment = url_or_token.split("#", 1)[1]
        params = dict(urllib.parse.parse_qsl(fragment))
        access_token = params.get("access_token")
        id_token = params.get("id_token")
    elif "access_token=" in url_or_token:
        clean_str = url_or_token.lstrip("?#")
        params = dict(urllib.parse.parse_qsl(clean_str))
        access_token = params.get("access_token")
        id_token = params.get("id_token")
    elif not url_or_token.startswith("http"):
        access_token = url_or_token

    if not access_token:
        print(f"[Auth] 錯誤: 未能識別有效的 Access Token (長度: {len(url_or_token)})")
        return {"status": "error", "message": "未能識別有效的 Access Token，請確認已在 Riot 官方頁面完成登入。"}

    print(f"[Auth] 收到官方 Token，開始驗證特戰英豪授權憑證 (分區: {shard})...")

    try:
        # 2. Exchange Entitlements Token
        ent_req = urllib.request.Request(
            'https://entitlements.auth.riotgames.com/api/token/v1',
            data=b'{}',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        )
        with urllib.request.urlopen(ent_req, timeout=12) as ent_resp:
            ent_data = json.loads(ent_resp.read().decode())
            entitlements_token = ent_data.get('entitlements_token')

        if not entitlements_token:
            return {"status": "error", "message": "未能取得特戰英豪遊戲授權憑證 (Entitlements Token)。"}

        # 3. Extract PUUID & Player Name
        puuid = None
        player_name = "特務"
        player_tag = "VAL"

        # Try auth.riotgames.com/userinfo
        try:
            u_req = urllib.request.Request(
                'https://auth.riotgames.com/userinfo',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            )
            with urllib.request.urlopen(u_req, timeout=8) as u_resp:
                u_data = json.loads(u_resp.read().decode())
                puuid = u_data.get('sub')
                acct = u_data.get('acct') or {}
                if isinstance(acct, dict):
                    if acct.get('game_name'):
                        player_name = acct['game_name']
                    if acct.get('tag_line'):
                        player_tag = acct['tag_line']
        except Exception as ue:
            print(f"[Auth] userinfo 提示: {ue}")

        # Fallback puuid from id_token JWT
        if not puuid and id_token:
            try:
                parts = id_token.split('.')
                if len(parts) >= 2:
                    payload_b64 = parts[1]
                    payload_b64 += '=' * (-len(payload_b64) % 4)
                    payload = json.loads(base64.b64decode(payload_b64).decode())
                    puuid = payload.get('sub')
            except Exception as pe:
                print(f"[Auth] id_token 解碼提示: {pe}")

        if not puuid:
            return {"status": "error", "message": "未能取得玩家 PUUID，請重新登入。"}

        # 4. Fetch in-game Riot ID from VALORANT name-service
        try:
            t_client_ver = ASSETS.get("client_version", "release-13.06-shipping-13-5435758")
            ns_headers = {
                'Authorization': f'Bearer {access_token}',
                'X-Riot-Entitlements-JWT': entitlements_token,
                'X-Riot-ClientVersion': t_client_ver,
                'X-Riot-ClientPlatform': "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9",
                'User-Agent': f'RiotClient/{t_client_ver} (Windows; 10;;Enterprise; x64)',
                'Content-Type': 'application/json'
            }
            ns_req = urllib.request.Request(
                f'https://pd.{shard}.a.pvp.net/name-service/v2/players',
                data=json.dumps([puuid]).encode('utf-8'),
                headers=ns_headers,
                method='PUT'
            )
            with urllib.request.urlopen(ns_req, timeout=8) as ns_resp:
                ns_data = json.loads(ns_resp.read().decode())
                if ns_data and isinstance(ns_data, list) and len(ns_data) > 0:
                    gn = ns_data[0].get('GameName')
                    tl = ns_data[0].get('TagLine')
                    if gn: player_name = gn
                    if tl: player_tag = tl
        except Exception as ne:
            print(f"[Auth] 遊戲暱稱查詢提示: {ne}")

        # 5. Verify storefront API permissions
        try:
            t_client_ver = ASSETS.get("client_version", "release-13.06-shipping-13-5435758")
            t_headers = {
                'Authorization': f'Bearer {access_token}',
                'X-Riot-Entitlements-JWT': entitlements_token,
                'X-Riot-ClientVersion': t_client_ver,
                'X-Riot-ClientPlatform': "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9",
                'User-Agent': f'RiotClient/{t_client_ver} (Windows; 10;;Enterprise; x64)',
                'Content-Type': 'application/json'
            }
            t_req = urllib.request.Request(f'https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}', data=b'{}', headers=t_headers)
            with urllib.request.urlopen(t_req, timeout=8) as t_resp:
                pass
        except urllib.error.HTTPError as te:
            if te.code == 403:
                print(f"[Auth] 拒絕存取: 該 Token 缺少特戰英豪遊戲商城權限 (HTTP 403)")
                return {
                    "status": "error",
                    "message": "此授權 Token 缺乏遊戲商城權限 (HTTP 403)。請點擊「前往 Riot 官方網站登入」重新以原廠客戶端視窗登入，或直接使用「🔥 Riot 帳密登入 (Recon-Bolt)」！"
                }

        session_obj = {
            "source": "credentials",
            "accessToken": access_token,
            "entitlementsToken": entitlements_token,
            "puuid": puuid,
            "name": player_name,
            "tag": player_tag,
            "shard": shard
        }

        ACTIVE_CREDENTIALS_SESSION = {
            "source": "credentials",
            "access_token": access_token,
            "entitlements_token": entitlements_token,
            "puuid": puuid,
            "name": player_name,
            "tag": player_tag,
            "shard": shard
        }

        print(f"[Auth] ★ 官方跳轉登入成功: {player_name}#{player_tag} (分區: {shard}, PUUID: {puuid})")
        return {
            "status": "success",
            "session": session_obj,
            "player": {
                "name": player_name,
                "tag": player_tag,
                "shard": shard
            }
        }
    except urllib.error.HTTPError as e:
        err_msg = ""
        try:
            err_msg = e.read().decode('utf-8', errors='ignore')
        except Exception:
            pass
        print(f"[Auth] 官方驗證 HTTP {e.code}: {err_msg}")
        if e.code == 401:
            return {"status": "error", "message": "此 Token 已過期或失效，請重新點擊官方登入。"}
        return {"status": "error", "message": f"驗證伺服器回應錯誤 (HTTP {e.code})"}
    except Exception as e:
        print(f"[Auth] 登入異常: {e}")
        return {"status": "error", "message": f"登入失敗: {str(e)}"}


def riot_remote_login(username, password, shard="ap"):
    global ACTIVE_CREDENTIALS_SESSION
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'RiotClient/99.0.0.1234567.9876543 rso-auth (Windows;10;;Professional, x64)',
        'Accept': 'application/json'
    }

    init_payload = json.dumps({
        'client_id': 'riot-client',
        'nonce': '1',
        'redirect_uri': 'http://localhost/redirect',
        'response_type': 'token id_token',
        'scope': 'openid link ban lol_region'
    }).encode()

    try:
        req1 = urllib.request.Request('https://auth.riotgames.com/api/v1/authorization', data=init_payload, headers=headers)
        with opener.open(req1, timeout=12) as resp:
            resp.read()
    except Exception as e:
        return {"status": "error", "message": f"無法連線至 Riot 認證伺服器: {str(e)}"}

    auth_payload = json.dumps({
        'type': 'auth',
        'username': username,
        'password': password,
        'remember': True,
        'language': 'zh_TW'
    }).encode()

    try:
        req2 = urllib.request.Request('https://auth.riotgames.com/api/v1/authorization', data=auth_payload, headers=headers, method='PUT')
        with opener.open(req2, timeout=12) as resp:
            data2 = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"status": "error", "message": f"Riot 伺服器回應錯誤 (HTTP {e.code})"}
    except Exception as e:
        return {"status": "error", "message": f"登入請求失敗: {str(e)}"}

    if data2.get("type") == "multifactor":
        mfa_info = data2.get("multifactor", {})
        session_id = str(uuid.uuid4())
        PENDING_MFA_SESSIONS[session_id] = {
            "cj": cj,
            "opener": opener,
            "shard": shard,
            "created_at": time.time()
        }
        return {
            "status": "multifactor",
            "sessionId": session_id,
            "email": mfa_info.get("email", "註冊信箱"),
            "method": mfa_info.get("method", "email")
        }

    if data2.get("error") == "auth_failure":
        return {
            "status": "error", 
            "message": "Riot 帳號或密碼錯誤，請確認帳號密碼後再試。"
        }

    if data2.get("type") == "response":
        uri = data2.get("response", {}).get("parameters", {}).get("uri", "")
        return complete_remote_session(uri, shard)

    return {"status": "error", "message": f"未知的認證回應: {data2.get('type')}"}


def riot_verify_2fa(session_id, code, shard="ap"):
    global ACTIVE_CREDENTIALS_SESSION
    if session_id not in PENDING_MFA_SESSIONS:
        return {"status": "error", "message": "雙重驗證階段已過期，請重新輸入帳號密碼登入。"}
    
    session = PENDING_MFA_SESSIONS[session_id]
    opener = session["opener"]
    target_shard = session.get("shard", shard)
    
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'RiotClient/99.0.0.1234567.9876543 rso-auth (Windows;10;;Professional, x64)',
        'Accept': 'application/json'
    }

    mfa_payload = json.dumps({
        'type': 'multifactor',
        'code': code.strip(),
        'rememberDevice': True
    }).encode()

    try:
        req = urllib.request.Request('https://auth.riotgames.com/api/v1/authorization', data=mfa_payload, headers=headers, method='PUT')
        with opener.open(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        return {"status": "error", "message": f"驗證碼送出失敗: {str(e)}"}

    if data.get("error"):
        return {"status": "error", "message": "驗證碼錯誤或已過期，請檢查信箱並重新輸入。"}

    if data.get("type") == "response":
        del PENDING_MFA_SESSIONS[session_id]
        uri = data.get("response", {}).get("parameters", {}).get("uri", "")
        return complete_remote_session(uri, target_shard)

    return {"status": "error", "message": f"未預期的驗證回應: {data.get('type')}"}


def complete_remote_session(uri, shard):
    global ACTIVE_CREDENTIALS_SESSION
    try:
        fragment = uri.split('#')[1]
        params = dict(urllib.parse.parse_qsl(fragment))
        access_token = params.get('access_token')
        id_token = params.get('id_token')
        
        if not access_token:
            return {"status": "error", "message": "無法從授權回傳中獲取 Access Token"}

        ent_req = urllib.request.Request('https://entitlements.auth.riotgames.com/api/token/v1', data=b'{}', headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        })
        with urllib.request.urlopen(ent_req, timeout=10) as ent_resp:
            ent_data = json.loads(ent_resp.read().decode())
            entitlements_token = ent_data.get('entitlements_token')

        player_name = "Agent"
        player_tag = "VAL"
        puuid = None

        u_req = urllib.request.Request('https://auth.riotgames.com/userinfo', headers={
            'Authorization': f'Bearer {access_token}',
            'User-Agent': 'Mozilla/5.0'
        })
        try:
            with urllib.request.urlopen(u_req, timeout=10) as u_resp:
                u_data = json.loads(u_resp.read().decode())
                puuid = u_data.get('sub')
                acct = u_data.get('acct') or {}
                if isinstance(acct, dict):
                    if acct.get('game_name'): player_name = acct['game_name']
                    if acct.get('tag_line'): player_tag = acct['tag_line']
        except Exception:
            pass

        if not puuid and id_token:
            try:
                parts = id_token.split('.')
                if len(parts) >= 2:
                    payload_b64 = parts[1]
                    payload_b64 += '=' * (-len(payload_b64) % 4)
                    payload = json.loads(base64.b64decode(payload_b64).decode())
                    puuid = payload.get('sub')
            except Exception:
                pass

        if player_name in ["Agent", "特務"] and puuid:
            try:
                t_client_ver = ASSETS.get("client_version", "release-13.06-shipping-13-5435758")
                ns_headers = {
                    'Authorization': f'Bearer {access_token}',
                    'X-Riot-Entitlements-JWT': entitlements_token,
                    'X-Riot-ClientVersion': t_client_ver,
                    'X-Riot-ClientPlatform': "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9",
                    'User-Agent': f'RiotClient/{t_client_ver} (Windows; 10;;Enterprise; x64)',
                    'Content-Type': 'application/json'
                }
                ns_req = urllib.request.Request(
                    f'https://pd.{shard}.a.pvp.net/name-service/v2/players',
                    data=json.dumps([puuid]).encode('utf-8'),
                    headers=ns_headers,
                    method='PUT'
                )
                with urllib.request.urlopen(ns_req, timeout=8) as ns_resp:
                    ns_data = json.loads(ns_resp.read().decode())
                    if ns_data and isinstance(ns_data, list) and len(ns_data) > 0:
                        gn = ns_data[0].get('GameName')
                        tl = ns_data[0].get('TagLine')
                        if gn: player_name = gn
                        if tl: player_tag = tl
            except Exception:
                pass

        session_obj = {
            "source": "credentials",
            "accessToken": access_token,
            "entitlementsToken": entitlements_token,
            "puuid": puuid,
            "name": player_name,
            "tag": player_tag,
            "shard": shard
        }

        ACTIVE_CREDENTIALS_SESSION = {
            "source": "credentials",
            "access_token": access_token,
            "entitlements_token": entitlements_token,
            "puuid": puuid,
            "name": player_name,
            "tag": player_tag,
            "shard": shard
        }

        print(f"[Auth] 成功以帳密登入玩家: {player_name}#{player_tag} (分區: {shard})")
        return {
            "status": "success",
            "session": session_obj,
            "player": {
                "name": player_name,
                "tag": player_tag,
                "shard": shard
            }
        }
    except Exception as e:
        return {"status": "error", "message": f"完成登入憑證交換時失敗: {str(e)}"}


def get_current_auth(req_headers=None):
    global ACTIVE_CREDENTIALS_SESSION
    if req_headers:
        acc = req_headers.get('X-Riot-Access-Token') or req_headers.get('x-riot-access-token')
        ent = req_headers.get('X-Riot-Entitlements-JWT') or req_headers.get('x-riot-entitlements-jwt')
        puuid = req_headers.get('X-Riot-Puuid') or req_headers.get('x-riot-puuid')
        shard = req_headers.get('X-Riot-Shard') or req_headers.get('x-riot-shard') or 'ap'
        name_raw = req_headers.get('X-Riot-Name') or req_headers.get('x-riot-name')
        name = urllib.parse.unquote(name_raw) if name_raw else (ACTIVE_CREDENTIALS_SESSION.get("name") if ACTIVE_CREDENTIALS_SESSION else '特務')
        tag_raw = req_headers.get('X-Riot-Tag') or req_headers.get('x-riot-tag')
        tag = urllib.parse.unquote(tag_raw) if tag_raw else (ACTIVE_CREDENTIALS_SESSION.get("tag") if ACTIVE_CREDENTIALS_SESSION else 'VAL')
        if acc and ent and puuid:
            return {
                "source": "credentials",
                "access_token": acc,
                "entitlements_token": ent,
                "puuid": puuid,
                "name": name,
                "tag": tag,
                "shard": shard
            }, None

    if ACTIVE_CREDENTIALS_SESSION:
        return ACTIVE_CREDENTIALS_SESSION, None
    return get_lockfile_auth()


def fetch_live_store(req_headers=None):
    auth, err = get_current_auth(req_headers)
    if not auth:
        return None, err
    
    puuid = auth["puuid"]
    shard = auth.get("shard", "ap")
    client_version = ASSETS.get("client_version", "release-13.06-shipping-13-5435758")
    client_platform = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"
    
    headers = {
        'Authorization': f'Bearer {auth["access_token"]}',
        'X-Riot-Entitlements-JWT': auth["entitlements_token"],
        'X-Riot-ClientVersion': client_version,
        'X-Riot-ClientPlatform': client_platform,
        'User-Agent': f'RiotClient/{client_version} (Windows; 10;;Enterprise; x64)',
        'Content-Type': 'application/json'
    }
    
    wallet = { "vp": 0, "rp": 0, "kc": 0 }
    try:
        w_req = urllib.request.Request(f'https://pd.{shard}.a.pvp.net/store/v1/wallet/{puuid}', headers=headers)
        with urllib.request.urlopen(w_req, timeout=10) as w_resp:
            w_data = json.loads(w_resp.read().decode())
            balances = w_data.get("Balances", {})
            wallet["vp"] = balances.get("85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741", 0)
            wallet["kc"] = balances.get("85ca954a-41f2-ce94-9b45-8ca3dd39a00d", 0)
            wallet["rp"] = balances.get("e59aa87c-4cbf-517a-5983-6e81511be9b7", 0)
    except Exception as e:
        print(f"[Store] Warning fetching wallet: {e}")

    try:
        s_req = urllib.request.Request(f'https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}', data=b'{}', headers=headers)
        with urllib.request.urlopen(s_req, timeout=12) as s_resp:
            store_data = json.loads(s_resp.read().decode())
    except Exception as e:
        return None, f"無法獲取商城資料 (可能是登入階段過期，請重新登入): {str(e)}"
        
    daily_items = []
    panel = store_data.get("SkinsPanelLayout", {})
    item_offers = panel.get("SingleItemStoreOffers", [])
    remaining_secs = panel.get("SingleItemOffersRemainingDurationInSeconds", 0)
    
    for offer in item_offers:
        item_id = offer["Rewards"][0]["ItemID"]
        cost = offer["Cost"].get("85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741", 0)
        skin_meta = resolve_skin_item(item_id)
        daily_items.append({
            "offerId": offer.get("OfferID"),
            "itemId": item_id,
            "cost": cost,
            "skin": skin_meta
        })

    night_market = {
        "active": False,
        "remainingSeconds": 0,
        "offers": []
    }
    bonus = store_data.get("BonusStore")
    if bonus and "BonusStoreOffers" in bonus:
        night_market["active"] = True
        night_market["remainingSeconds"] = bonus.get("BonusStoreRemainingDurationInSeconds", 0)
        for bo in bonus["BonusStoreOffers"]:
            offer = bo["Offer"]
            item_id = offer["Rewards"][0]["ItemID"]
            orig_cost = list(offer.get("Cost", {}).values())[0] if offer.get("Cost") else 0
            disc_cost = list(bo.get("DiscountCosts", {}).values())[0] if bo.get("DiscountCosts") else 0
            discount = bo.get("DiscountPercent", 0)
            skin_meta = resolve_skin_item(item_id)
            night_market["offers"].append({
                "bonusOfferId": bo.get("BonusOfferID"),
                "itemId": item_id,
                "originalCost": orig_cost,
                "discountCost": disc_cost,
                "discountPercent": discount,
                "skin": skin_meta
            })

    bundle_data = None
    featured = store_data.get("FeaturedBundle")
    if featured:
        bundles_list = featured.get("Bundles", [])
        if bundles_list:
            b = bundles_list[0]
            bundle_asset_id = b.get("DataAssetID")
            bundle_meta = ASSETS["bundles"].get(bundle_asset_id, {})
            
            bundle_items = []
            for itm in b.get("Items", []):
                item_obj = itm.get("Item", {})
                itm_id = item_obj.get("ItemID")
                base_price = itm.get("BasePrice", 0)
                disc_price = itm.get("DiscountedPrice", 0)
                skin_meta = resolve_skin_item(itm_id)
                bundle_items.append({
                    "itemId": itm_id,
                    "itemTypeId": item_obj.get("ItemTypeID"),
                    "basePrice": base_price,
                    "discountedPrice": disc_price,
                    "skin": skin_meta
                })
                
            bundle_data = {
                "id": b.get("ID"),
                "dataAssetId": bundle_asset_id,
                "displayName": bundle_meta.get("displayName", "精選特惠組合包"),
                "displayIcon": bundle_meta.get("displayIcon"),
                "displayIcon2": bundle_meta.get("displayIcon2"),
                "durationRemainingInSeconds": b.get("DurationRemainingInSeconds", 0),
                "items": bundle_items
            }

    return {
        "authSource": auth.get("source", "lockfile"),
        "player": {
            "name": auth.get("name", "特務"),
            "tag": auth.get("tag", "VAL"),
            "puuid": auth["puuid"],
            "shard": shard
        },
        "wallet": wallet,
        "daily": {
            "remainingSeconds": remaining_secs,
            "items": daily_items
        },
        "nightMarket": night_market,
        "bundle": bundle_data
    }, None


def resolve_skin_item(item_id):
    if item_id in ASSETS["skins_by_level"]:
        return ASSETS["skins_by_level"][item_id]
    if item_id in ASSETS["skins_by_id"]:
        return ASSETS["skins_by_id"][item_id]
    try:
        headers = {"User-Agent": "ValStoreWeb/1.0 (Mozilla/5.0)"}
        req = urllib.request.Request(f"https://valorant-api.com/v1/weapons/skinlevels/{item_id}?language=zh-TW", headers=headers)
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            info = data.get("data", {})
            return {
                "uuid": item_id,
                "displayName": info.get("displayName", "未知造型"),
                "displayIcon": info.get("displayIcon"),
                "contentTier": {"devName": "Deluxe", "color": "#009587", "icon": None},
                "levels": [],
                "chromas": []
            }
    except Exception:
        pass
        
    return {
        "uuid": item_id,
        "displayName": "特戰英豪造型",
        "displayIcon": None,
        "contentTier": {"devName": "Select", "color": "#5a9fe2", "icon": None},
        "levels": [],
        "chromas": []
    }


def get_wishlist():
    if WISHLIST_FILE.exists():
        try:
            with open(WISHLIST_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_wishlist(items):
    with open(WISHLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


class ValStoreHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        global ACTIVE_CREDENTIALS_SESSION
        if self.path.startswith("/api/status"):
            auth, err = get_current_auth(self.headers)
            response_data = {
                "connected": auth is not None,
                "authSource": auth.get("source") if auth else None,
                "assetsReady": ASSETS["ready"],
                "error": err,
                "player": {
                    "name": auth.get("name") if auth else None,
                    "tag": auth.get("tag") if auth else None,
                    "shard": auth.get("shard", "ap") if auth else "ap"
                } if auth else None
            }
            self.send_json(response_data)
            return

        elif self.path.startswith("/api/store"):
            data, err = fetch_live_store(self.headers)
            if err:
                self.send_json({"error": err, "needsLogin": True}, status=401)
            else:
                self.send_json(data)
            return

        elif self.path.startswith("/api/wishlist"):
            self.send_json(get_wishlist())
            return

        elif self.path.startswith("/api/skins"):
            self.send_json(ASSETS["all_skins"])
            return

        elif self.path.startswith("/redirect"):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(OAUTH_REDIRECT_HTML.encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        global ACTIVE_CREDENTIALS_SESSION
        content_length = int(self.headers.get('Content-Length', 0))
        body_str = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        
        try:
            body = json.loads(body_str) if body_str else {}
        except Exception:
            body = {}

        # Token / Official Redirect URL Login
        if self.path.startswith("/api/auth/token-login"):
            url_or_token = (body.get("urlOrToken") or body.get("url") or "").strip()
            shard = body.get("shard", "ap")
            if not url_or_token:
                self.send_json({"status": "error", "message": "請貼上 Riot 官方跳轉網址或 Token"}, status=400)
                return
            result = riot_token_login(url_or_token, shard)
            status_code = 200 if result.get("status") == "success" else 400
            self.send_json(result, status=status_code)
            return

        elif self.path.startswith("/api/auth/login"):
            username = body.get("username", "").strip()
            password = body.get("password", "")
            shard = body.get("shard", "ap")
            if not username or not password:
                self.send_json({"status": "error", "message": "請輸入 Riot 帳號與密碼"}, status=400)
                return
            result = riot_remote_login(username, password, shard)
            status_code = 200 if result.get("status") in ["success", "multifactor"] else 400
            self.send_json(result, status=status_code)
            return

        elif self.path.startswith("/api/auth/2fa"):
            session_id = body.get("sessionId") or body.get("cookies")
            code = body.get("code", "").strip()
            shard = body.get("shard", "ap")
            if not session_id or not code:
                self.send_json({"status": "error", "message": "請輸入完整的雙重驗證碼"}, status=400)
                return
            result = riot_verify_2fa(session_id, code, shard)
            status_code = 200 if result.get("status") == "success" else 400
            self.send_json(result, status=status_code)
            return

        elif self.path.startswith("/api/auth/switch-lockfile"):
            ACTIVE_CREDENTIALS_SESSION = None
            auth, err = get_lockfile_auth()
            self.send_json({
                "status": "success",
                "connected": auth is not None,
                "error": err,
                "player": {
                    "name": auth.get("name") if auth else None,
                    "tag": auth.get("tag") if auth else None
                } if auth else None
            })
            return

        elif self.path.startswith("/api/auth/logout"):
            ACTIVE_CREDENTIALS_SESSION = None
            self.send_json({"status": "success", "message": "已登出"})
            return

        elif self.path.startswith("/api/wishlist"):
            if isinstance(body, list):
                save_wishlist(body)
                self.send_json({"success": True, "count": len(body)})
                return
            self.send_json({"error": "Invalid wishlist data"}, status=400)
            return

        self.send_json({"error": "Not Found"}, status=404)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Riot-Access-Token, X-Riot-Entitlements-JWT, X-Riot-Puuid, X-Riot-Shard, X-Riot-Name, X-Riot-Tag")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Riot-Access-Token, X-Riot-Entitlements-JWT, X-Riot-Puuid, X-Riot-Shard, X-Riot-Name, X-Riot-Tag")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()


OAUTH_REDIRECT_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>特戰英豪登入成功</title>
  <style>
    body { background: #0f1923; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .spinner { width: 44px; height: 44px; border: 4px solid rgba(0, 245, 212, 0.2); border-top-color: #00f5d4; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1.5rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 1.35rem; font-weight: 800; color: #00f5d4; margin: 0 0 0.5rem; letter-spacing: 1px; }
    p { color: #8b97a5; font-size: 0.95rem; margin: 0; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2>官方驗證成功！</h2>
  <p>正在自動跳轉回特戰英豪商城...</p>
  <script>
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '');
    let target = searchParams.get('state') || hashParams.get('state') || 'http://localhost:3000';
    if (!target.startsWith('http')) {
      target = 'http://localhost:3000';
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: 'RIOT_AUTH_TOKEN', hash: hash }, '*');
        setTimeout(() => window.close(), 400);
      } catch(e) {}
    }

    try {
      const bc = new BroadcastChannel('riot_auth_channel');
      bc.postMessage({ type: 'RIOT_AUTH_TOKEN', hash: hash });
    } catch(e) {}

    setTimeout(() => {
      const cleanTarget = target.replace(/\\/+$/, '');
      const cleanHash = hash.startsWith('#') ? hash : '#' + hash;
      window.location.replace(cleanTarget + '/' + cleanHash);
    }, 400);
  </script>
</body>
</html>"""

class RiotOAuthRedirectHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(OAUTH_REDIRECT_HTML.encode('utf-8'))

    def log_message(self, format, *args):
        pass

def start_redirect_listener():
    try:
        redirect_server = HTTPServer(("0.0.0.0", 80), RiotOAuthRedirectHandler)
        print("[Auth] 官方 OAuth 自動跳轉監聽器已在 port 80 就緒 (http://localhost/redirect)")
        redirect_server.serve_forever()
    except Exception as e:
        print(f"[Auth] 提示: Port 80 自動監聽未能啟動 ({e})，仍支援剪貼簿與手動跳轉。")

def start_server():
    asset_thread = threading.Thread(target=load_valorant_assets, daemon=True)
    asset_thread.start()

    redirect_thread = threading.Thread(target=start_redirect_listener, daemon=True)
    redirect_thread.start()

    server = HTTPServer(("0.0.0.0", PORT), ValStoreHandler)
    print(f"============================================================")
    print(f"  VALORANT // PROTOCOL STORE WEB (特戰英豪專屬商城網站)")
    print(f"  支援: Riot 官方網頁自動跳轉授權登入 / 本機免密同步")
    print(f"  運行網址: http://localhost:{PORT}")
    print(f"============================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()


if __name__ == "__main__":
    start_server()
