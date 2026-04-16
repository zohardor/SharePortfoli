# SharePortfolio — מסמך דרישות

**גרסה:** 1.0 | **תאריך:** אפריל 2026

---

## 1. סקירת המערכת

**SharePortfolio** — מערכת ניתוח תיק מניות אישי לדוברי עברית.

### מטרות
- מעקב אחר אחזקות מניות אישיות עם מחירים בזמן אמת
- המלצות **מכירה** לפי ניתוח טכני על אחזקות קיימות
- המלצות **קנייה** לפי ניתוח טכני על כל מניה שהמשתמש מבקש
- זיהוי **תבניות מסחר קלאסיות** (ראש וכתפיים, תחתיות עולות, שיא כפול ועוד)
- ניתוח **ממוצע נע 150 שבועות** — מחיר מעל/מתחת לממוצע
- **גרפים אינטראקטיביים** עם אנוטציות תבניות

### אילוצים טכנולוגיים (קבועים)
| רכיב | טכנולוגיה |
|------|----------|
| Hosting | GitHub Pages (static) |
| Frontend | HTML + CSS + Vanilla JS (ES Modules) |
| Database | Supabase (free tier — PostgreSQL) |
| Stock data | Yahoo Finance v8 API via CORS proxy |
| Charts | TradingView Lightweight Charts v4 (CDN) |
| Pie chart | Chart.js v4 (CDN) |
| Build step | ❌ ללא build — push ישיר ל-GitHub |

---

## 2. סיפורי משתמש

### ניהול תיק
- **US-01**: הוספה/עריכה/מחיקה של אחזקות (סמל, כמות, עלות ממוצעת)
- **US-02**: לוח מחוונים עם מחיר נוכחי, שווי, רווח/הפסד, ואות ניתוח
- **US-03**: ייבוא/ייצוא CSV
- **US-04**: סיכום כולל: שווי תיק, עלות, רווח/הפסד, מספר אחזקות
- **US-05**: גרף פיזור (pie chart) לפי משקל כל אחזקה

### המלצות מכירה
- **US-06**: ניתוח אוטומטי של כל האחזקות → אות מכירה
- **US-07**: כל אות כולל גורמים מפורטים בעברית
- **US-08**: ממויין מ-"מכירה חזקה" לנייטרל/קנייה
- **US-09**: ציון מספרי (-100 עד +100)

### המלצות קנייה
- **US-10**: הזנת סמל מניה → ניתוח BUY מלא
- **US-11**: אות עם גורמים מפורטים
- **US-12**: שמירת מניות שנותחו לאחרונה (localStorage)
- **US-13**: הוספה ישירה לתיק/מעקב מתוצאות הניתוח

### זיהוי תבניות
- **US-14**: ראש וכתפיים / ראש וכתפיים הפוך
- **US-15**: תחתיות עולות (3+ שפלים עולים)
- **US-16**: שיא כפול / תחתית כפולה
- **US-17**: משולשים (עולה, יורד, סימטרי)
- **US-18**: קודקודים יורדים (lower highs)
- **US-19**: כל תבנית: רמת ביטחון, מחיר יעד, אנוטציה על גרף

### ממוצע נע 150 שבועות
- **US-20**: חישוב על נתונים שבועיים, הצגה על גרף
- **US-21**: % סטייה מהממוצע + מיקום (מעל/מתחת)
- **US-22**: השפעה על ציון ה-BUY/SELL

### גרפים
- **US-23**: נרות יפניים + מסגרות זמן 1ח/3ח/6ח/1ש/3ש/5ש/מקסימום
- **US-24**: שכבות: MA20/50/200, MA150W, בולינגר
- **US-25**: תת-גרפים: RSI, MACD, נפח
- **US-26**: אנוטציות תבניות על canvas overlay

---

## 3. דרישות פונקציונליות

### 3.1 שליפת נתונים

| ID | דרישה |
|----|-------|
| FR-D01 | שימוש ב-Yahoo Finance v8 API: `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` |
| FR-D02 | מעבר דרך CORS proxy (corsproxy.io כברירת מחדל, allorigins כגיבוי) |
| FR-D03 | Cache ב-Supabase analysis_cache עם TTL 4 שעות |
| FR-D04 | שליפת OHLCV יומי (1d) ו-שבועי (1wk) לכל מניה |
| FR-D05 | בקשת range=5y — מספיק ל-150 שבועות + ניתוח תבניות |

### 3.2 אינדיקטורים

| ID | דרישה |
|----|-------|
| FR-I01 | SMA לכל תקופה (20, 50, 150, 200) |
| FR-I02 | EMA (12, 26) |
| FR-I03 | RSI-14 לפי שיטת Wilder |
| FR-I04 | MACD (12/26/9): קו MACD, קו signal, histogram |
| FR-I05 | Bollinger Bands (20, 2σ) |
| FR-I06 | ATR-14 |
| FR-I07 | ממוצע נע 150 שבועות על נתונים שבועיים |

### 3.3 זיהוי תבניות

| ID | תבנית | כיוון |
|----|-------|-------|
| FR-P01 | ראש וכתפיים | דובי |
| FR-P02 | ראש וכתפיים הפוך | שורי |
| FR-P03 | שיא כפול | דובי |
| FR-P04 | תחתית כפולה | שורי |
| FR-P05 | תחתיות עולות | שורי |
| FR-P06 | קודקודים יורדים | דובי |
| FR-P07 | משולש עולה | שורי |
| FR-P08 | משולש יורד | דובי |
| FR-P09 | משולש סימטרי | נייטרל |

**כל תבנית מחזירה:** `{ type, direction, confidence (0-1), keyPoints, targetPrice, description (עברית) }`

### 3.4 מנוע ציון BUY/SELL

ציון מורכב -100 עד +100:

| אות | משקל | תנאי |
|-----|------|------|
| RSI | ±20 | <30 = +20, >70 = -20, קשת 30-70 = לינארי |
| MACD | ±15 | חציה חיובית = +15, שלילית = -15 |
| מחיר vs MA-150W | ±20 | מעל = +20, מתחת = -20 (לפי %) |
| מחיר vs MA-50D | ±10 | מעל = +10, מתחת = -10 |
| Bollinger | ±10 | בתחתית הרצועה = +10, בראש = -10 |
| נפח מסחר | ±10 | גבוה + מחיר עולה = +10 |
| תבנית | ±15 | שורית מאושרת = +15, דובית = -15 |
| Golden/Death Cross | ±8 | MA50>MA200 = +8, MA50<MA200 = -8 |

**ציון → אות:**
- ≥30: קנייה חזקה
- 10-29: קנייה
- 1-9: קנייה חלשה
- -9–0: המתן
- -29–-10: מכירה חלשה
- -49–-30: מכירה
- ≤-50: מכירה חזקה

---

## 4. דרישות לא-פונקציונליות

| קריטריון | ערך |
|----------|-----|
| ניתוח מניה אחת | <10 שניות |
| רינדור גרף | <3 שניות |
| שפה | עברית RTL מלא |
| אחסון | Supabase בלבד + localStorage |
| ללא login | UUID אנונימי ב-localStorage |
| תמיכה בדפדפנים | Chrome, Firefox, Safari, Edge (מודרניים) |

---

## 5. Supabase Schema

```sql
-- אחזקות
holdings (id, user_id, ticker, name, shares, avg_cost, added_at, updated_at)

-- רשימת מעקב
watchlist (id, user_id, ticker, added_at) + unique(user_id, ticker)

-- מטמון OHLCV
analysis_cache (ticker PK, interval, ohlcv_json JSONB, fetched_at, expires_at GENERATED)
```

**RLS:** כל משתמש רואה רק שורות עם `user_id = x-user-id header`  
**Cache:** ללא RLS — נתוני מניות הם ציבוריים

---

## 6. מבנה קבצים

```
/
├── index.html          # לוח מחוונים
├── buy.html            # ניתוח קנייה
├── sell.html           # המלצות מכירה
├── chart.html          # גרף מלא (?ticker=AAPL)
├── watchlist.html      # רשימת מעקב
├── settings.html       # הגדרות Supabase + proxy
│
├── css/
│   ├── global.css      # RTL, dark theme, design tokens
│   ├── components.css  # page-specific components
│   └── chart.css       # chart layout
│
├── js/
│   ├── config.js       # Supabase credentials, USER_ID
│   ├── db.js           # Supabase CRUD
│   ├── proxy.js        # Yahoo Finance fetch + cache
│   ├── indicators.js   # SMA/EMA/RSI/MACD/Bollinger
│   ├── patterns.js     # pattern detection (7 patterns)
│   ├── recommendations.js # scoring engine
│   ├── chart-init.js   # TradingView + canvas overlay
│   ├── portfolio.js    # dashboard UI
│   ├── watchlist.js    # watchlist UI
│   └── utils.js        # formatters, Hebrew labels
│
├── supabase-schema.sql # SQL ליצירת טבלאות
└── REQUIREMENTS.md     # מסמך זה
```

---

## 7. פריסה ל-GitHub Pages

1. **הפעלת Pages:** `Settings → Pages → branch: main → /root`
2. **Supabase CORS:** `Authentication → URL Configuration → Allowed Origins → הוסף https://<username>.github.io`
3. **ללא build** — push קבצים ישיר ל-`main`
4. **הגדרות ראשוניות:** פתח `/settings.html` → הזן Supabase URL + Key → הרץ `supabase-schema.sql`

---

## 8. שימוש ראשוני

1. פתח `settings.html`
2. צור פרויקט חינמי ב-[supabase.com](https://supabase.com)
3. הזן URL + Anon Key
4. העתק את ה-SQL מהדף ← הרץ ב-Supabase SQL Editor
5. בדוק חיבור → "מחובר בהצלחה ✓"
6. עבור ל-`index.html` → הוסף אחזקות

---

## 9. מילון מונחים

| English | עברית |
|---------|-------|
| Portfolio | תיק השקעות |
| Holdings | אחזקות |
| Buy signal | אות קנייה |
| Sell signal | אות מכירה |
| 150-week MA | ממוצע נע 150 שבועות |
| Head & Shoulders | ראש וכתפיים |
| Double Top/Bottom | שיא/תחתית כפול/ה |
| Ascending bottoms | תחתיות עולות |
| Neckline | קו הצוואר |
| Confidence | רמת ביטחון |
| Target price | מחיר יעד |
| Stop loss | סטופ לוס |
| Watchlist | רשימת מעקב |
| Strong Buy | קנייה חזקה |
| Strong Sell | מכירה חזקה |
