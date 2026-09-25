# ⚡ VALORANT // PROTOCOL STORE WEB (特戰英豪專屬商城與夜市特惠儀表板)

<div align="center">

![VALORANT](https://img.shields.io/badge/VALORANT-API_v3-FF4655?style=for-the-badge&logo=riotgames&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Netlify](https://img.shields.io/badge/Netlify-Ready-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00F5D4?style=for-the-badge)

<p align="center">
  <b>專為特戰英豪玩家打造的戰術美學商城系統 — 隨時隨地在手機、平板與電腦檢視每日商城、夜市特惠、心願單雷達與造型特效！</b>
</p>

</div>

---

## 🌟 專案亮點 (Key Features)

### 1. ⚡ 每日特選輪替造型 (Daily Storefront)
- 實時同步特戰英豪 24 小時限時特選 4 款槍枝造型與近戰武器。
- 精準同步官方伺服器倒數計時器（`00:00:00`）。
- 顯示即時特務幣（VP）、輻能點數（RP）與王國幣（KC）錢包餘額。

### 2. 🌙 夜市特惠專區 (Night Market)
- 當 Riot 官方開放夜市檔期時**自動解鎖啟用**。
- 專屬 **3D 塔羅互動翻牌動效**，沉浸式揭曉 6 款專屬特惠造型。
- 明確標示原價、折扣百分比（-%）與折後特惠價格。

### 3. 📦 精選組合包 (Featured Bundles)
- 完整展示目前主打的精選組合包宣傳封面與剩餘天數。
- 條列所有包內武器單品、吊飾、卡面與噴漆，支援個別價格與全包優惠試算。

### 4. ⭐ 心願單雷達追蹤 (Wishlist Radar)
- 收藏夢寐以求的造型（如：虛空狂想、掠奪印象、蓋亞復仇、奇幻龐克等）。
- 當日商城或夜市刷出心願造型時，首頁自動彈出 **「🎉 狂賀！今日商城有符合您心願單的造型」** 高能警報與專屬慶祝音效！

### 5. 🔍 全造型圖鑑即時檢索 (Skin Catalog)
- 內建收錄超過 1,400+ 款官方繁體中文武器造型。
- 支援極速關鍵字搜尋，依 Deluxe、Premium、Exclusive、Ultra 等造型階級色彩動態標記。

### 6. 🎬 3D 檢視、炫彩換色與終結動畫預覽 (Chromas & Video Preview)
- 點擊任何造型即可開啟戰術檢視面板。
- 即時切換不同炫彩換色（Variant Swatches）款式。
- 內建播放器直接串流預覽等級特效升級與終結動畫（Finisher Video）！

---

## 🔐 三大安全認證模式 (Authentication)

本專案支援多種彈性認證通道，兼顧方便性與極致安全性：

| 登入方式 | 適用情境 | 運作原理 | 安全性 |
| :--- | :--- | :--- | :--- |
| **🌐 Riot 官方網站安全登入** | **網頁版 / 手機版推薦** | 點擊後開啟原廠 `auth.riotgames.com` 頁面，登入後自動帶回 Access Token。 | 🛡️ **最高**（帳密直接交由 Riot 官方伺服器處理，密碼絕不經由第三方伺服器） |
| **🔥 快速帳密登入 (Recon-Bolt 模式)** | **極速免跳轉登入** | 採用同開源社群著名工具 Recon-Bolt 之 RSO 認證協議，完整支援 **2FA 信箱雙重驗證**。 | 🔒 **高**（僅透過安全 SSL 直連 Riot 官方端點，無中間人記錄） |
| **🎮 本機遊戲端一鍵免密同步** | **電腦有開遊戲時** | 自動偵測本機執行中的 `Riot Client` Lockfile 憑證，無須輸入任何帳號密碼。 | ⚡ **極速**（零密碼、本機即時通訊） |

---

## 🛠️ 技術架構 (Tech Stack)

```
[使用者瀏覽器 (Mobile / Desktop)]
        │
        ├── ① 純靜態戰術 UI (HTML5 + Vanilla CSS + ES6 JavaScript)
        │
        ▼ (依運行環境選擇)
┌───────────────────────────────────────┬───────────────────────────────────────┐
│        本地環境 (Local Machine)       │        雲端環境 (Netlify Cloud)       │
│  Python 3 原生微服務 (server.py)      │  Serverless Functions (api.js)        │
│  - Port 3000: Web 介面與 RESTful API  │  - AWS Lambda / Node.js 18+           │
│  - Port 80: Riot OAuth 自動跳轉接收器 │  - 無伺服器架構，多使用者獨立 Session │
│  - Local Lockfile 讀取與免密同步      │  - 跨域 CORS 與安全 Headers 防護      │
└───────────────────────────────────────┴───────────────────────────────────────┘
        │
        ▼
[Riot Games 原廠 API (pd.ap.a.pvp.net & auth.riotgames.com)]
[Valorant-API.com 造型資產快取]
```

- **前端**：純原生 JavaScript（零肥大依賴）、賽博戰術風格 Vanilla CSS、Web Audio API 擬真音效、Google Fonts（Outfit, Rajdhani, Noto Sans TC）。
- **後端（本地）**：Python 3 原生標準庫（零外部 pip 依賴），內建多線程 OAuth Redirect Receiver（Port 80）與資產快取。
- **後端（雲端）**：Netlify Serverless Function，支援無狀態多租戶架構，使用者 Token 僅存放於個人裝置。

---

## 🚀 本地端快速運行 (Localhost)

### 必備環境
- **作業系統**：Windows 10 / 11、macOS 或 Linux
- **Python**：Python 3.8 或以上版本

### 啟動步驟 (Windows)
1. 複製本專案至本地端：
   ```bash
   git clone https://github.com/Richard-yq/val-store-web.git
   cd val-store-web
   ```
2. 直接雙擊執行專案根目錄的 **`start.bat`**。
3. 系統將自動啟動服務並於預設瀏覽器開啟 **`http://localhost:3000`**。

### 手動指令啟動 (跨平台)
```bash
python server.py
```
> 💡 **提示**：同區域網路（同 Wi-Fi）內的手機或平板，可直接以瀏覽器訪問 `http://<您的電腦區網IP>:3000` 即可使用！

---

## ☁️ Netlify 雲端免費一鍵部署指南

想讓自己與好友在外隨時用手機看商城？部署到 Netlify 完全免費且支援永久線上運行：

### 步驟 A：透過 GitHub 連動（推薦，支援自動更新）
1. 將本專案 Fork 或 Push 至您個人的 GitHub 儲存庫。
2. 前往 [Netlify 官網](https://www.netlify.com/) 登入。
3. 點選 **"Add new site"** ➔ **"Import an existing project"** ➔ 選擇 **GitHub**。
4. 選取剛剛建立的 `val-store-web` 儲存庫。
5. 專案已附帶標準 `netlify.toml`，Build command 與 Publish directory 保持預設即可。
6. 點擊 **"Deploy val-store-web"**，約 30 秒內即可取得您的專屬線上網址（例如：`https://your-name.netlify.app`）！

### 步驟 B：Netlify Drop 拖曳上傳（免 Git 極速上線）
1. 登入 [Netlify Drop](https://app.netlify.com/drop)。
2. 將本專案資料夾直接拖曳丟入網頁虛線框中。
3. 上傳解析完成後即可立即取得線上公開網址！

---

## 🔒 隱私與安全性保證 (Privacy & Security)

1. **零第三方帳密儲存**：本專案不設有任何資料庫收集您的 Riot 帳號密碼。
2. **官方原廠直連**：所有身分驗證與 Token 交換皆直接透過加密通道（HTTPS / SSL）與 Riot 官方端點通訊。
3. **客戶端獨立存放**：登入憑證與 Session 僅保存在您個人的瀏覽器 `sessionStorage` / `localStorage`，重新整理或關閉分頁隨時可一鍵登出清除。

---

## 📄 免責聲明 (Disclaimer)

- 本專案為非官方開源工具，僅供個人與特戰英豪社群愛好者技術交流使用。
- VALORANT 以及 Riot Games、Riot Client 是 Riot Games, Inc. 的商標或註冊商標。
- 本專案與 Riot Games 官方無任何商業隸屬或背書關係。

---

<div align="center">
  <sub>Built with ❤️ for VALORANT Agents by <a href="https://github.com/Richard-yq">Richard-yq</a></sub>
</div>
