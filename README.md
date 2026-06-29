<div align="center">

# 🏪 Smart Inventory and Waste Reducer

**Aplikasi Full-Stack Manajemen Inventori dengan AI Demand Forecasting & IoT Real-Time**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

Dikembangkan sebagai project **Enrichment Program BINUS University 2026/2027**
jalur *Certified Internship Track* — peran **IT Developer**

[📸 Screenshots](#-screenshots) · [🚀 Quick Start](#-quick-start) · [🏗 Arsitektur](#-arsitektur-sistem) · [🧠 Machine Learning](#-machine-learning) · [📡 IoT](#-iot-integration) · [📋 API Docs](#-api-endpoints)

</div>

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 📊 **Dashboard Real-Time** | KPI inventori live, environmental status dari sensor IoT, quick actions |
| 📦 **Inventory Tracking** | CRUD lengkap, search & filter, fill level visual, isolasi data per user |
| 📤 **Excel/CSV Import** | Upload & deduplikasi otomatis per SKU, riwayat import dari MongoDB |
| 🧠 **AI Forecasting** | LSTM (NumPy) 94.2% + Gradient Boosting 95.8%, forecast 30/90/180 hari |
| 🌱 **Waste Prevention** | Alert kadaluarsa ≤7 hari, rekomendasi AI (flash sale/bundle/donation) |
| 🔄 **Auto Replenishment** | Saran otomatis dari stok kritis, bulk order, manajemen supplier |
| 📊 **Analytics** | Waste by category, turnover rate, heatmap fill level per zona & hari |
| 💰 **Profit & Loss** | Dashboard P&L bulanan, revenue vs profit chart, top produk, waste loss |
| 📡 **IoT Sensor Network** | 14 sensor virtual di 7 zona, simulate tick, history 24 jam, per-user state |
| 🔔 **Notifications** | Alert critical/warning/success/info, per-user, badge counter |
| ⚙️ **Settings** | Dark mode, 6 accent color, compact sidebar, konfigurasi IoT/ML |

> **Multi-user isolation**: Setiap user punya data inventory, sensor IoT, notifikasi, analytics, dan order **terpisah sepenuhnya** via `userId` di setiap koleksi MongoDB.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+
- MongoDB Atlas account (free tier cukup)

### 1. Clone & Setup

```bash
git clone https://github.com/YOUR_USERNAME/smart-inventory-waste-reducer.git
cd smart-inventory-waste-reducer
```

### 2. Backend

```bash
cd backend

# Copy dan isi environment variables
cp .env.example .env
# Edit .env: isi MONGODB_URI dari MongoDB Atlas

npm install
npm run seed        # Buat 2 user + seed data awal
npm run dev         # Server jalan di http://localhost:5001
```

### 3. Frontend

```bash
# Terminal baru
cd frontend
npm install
npm run dev         # Buka http://localhost:3000
```

### 4. ML Flask API *(opsional — untuk AI forecasting)*

```bash
# Terminal baru
cd ml
pip install -r requirements.txt
python3 app.py      # Flask API di http://localhost:5002
```

> Tanpa Flask API, forecasting tetap jalan dengan fallback data CSV langsung dari Node.js.

### 5. Login

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@smartinventory.com` | `admin123` |
| Developer | `erick@binus.edu` | `password123` |

---

## 🏗 Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION TIER                         │
│         React 18 + TypeScript + Tailwind CSS               │
│              Vite 5 · Port 3000 · 11 Pages                 │
└────────────────────────────┬────────────────────────────────┘
                             │ Axios (JWT Bearer Token)
┌────────────────────────────▼────────────────────────────────┐
│                    APPLICATION TIER                          │
│            Node.js 20 + Express + TypeScript                │
│         Port 5001 · 10 Route Groups · userId filter        │
└──────────────┬──────────────────────────────┬───────────────┘
               │ Mongoose                     │ HTTP (fetch)
┌──────────────▼───────────┐   ┌─────────────▼───────────────┐
│        DATA TIER          │   │         ML TIER              │
│     MongoDB Atlas         │   │  Flask Python · Port 5002   │
│  6 Collections + userId  │   │  Gradient Boosting 95.8%    │
│  Compound unique indexes  │   │  NumPy LSTM · 33 features   │
└───────────────────────────┘   └─────────────────────────────┘
                                          │
┌─────────────────────────────────────────▼───────────────────┐
│                       IoT TIER                               │
│  14 Virtual Sensors · 7 Zones (A–G) · Per-user state       │
│  HiveMQ Cloud MQTT (optional) · IoTSensorState MongoDB     │
└─────────────────────────────────────────────────────────────┘
```

### Alur Data Penting

```
Import CSV    → Dedup per SKU → Upsert MongoDB (userId) → Dashboard refresh
IoT Simulate  → /api/iot/simulate → IoTSensorState (userId) → Notification
AI Forecast   → /api/forecasting → Flask ML API → predictions → chart
Excel Upload  → multer → parse XLSX → 31.850 baris → 35 SKU unik → MongoDB
```

---

## 📁 Struktur Project

```
smart-inventory-waste-reducer/
├── frontend/                    # React 18 + TypeScript
│   └── src/
│       ├── pages/               # 11 halaman fungsional
│       │   ├── Dashboard.tsx        # KPI + IoT environment
│       │   ├── InventoryTracking.tsx # CRUD + search + filter
│       │   ├── ExcelImport.tsx      # Upload CSV/Excel
│       │   ├── AIForecasting.tsx    # Demand & profit forecast
│       │   ├── WastePrevention.tsx  # Expiry alerts + actions
│       │   ├── AutoReplenishment.tsx # Order suggestions
│       │   ├── Analytics.tsx        # Charts + heatmap
│       │   ├── ProfitDashboard.tsx  # P&L bulanan
│       │   ├── IoTSensorNetwork.tsx # Sensor 14 unit
│       │   ├── Notifications.tsx    # Alert center
│       │   └── Settings.tsx         # Dark mode, theme, config
│       ├── lib/
│       │   ├── api.ts           # Axios instance + semua endpoint
│       │   └── mqtt.ts          # HiveMQ MQTT client
│       └── components/          # KpiCard, Modal, Badge, FillBar
│
├── backend/                     # Node.js + Express + TypeScript
│   └── src/
│       ├── models/index.ts      # 7 Mongoose schemas (semua punya userId)
│       ├── middleware/auth.ts   # JWT verify → req.userId
│       ├── routes/
│       │   ├── auth.ts          # register / login / me
│       │   ├── dashboard.ts     # stats aggregation per userId
│       │   ├── inventory.ts     # CRUD + import Excel (dedup per SKU)
│       │   ├── forecasting.ts   # proxy ke Flask ML API + CSV fallback
│       │   ├── waste.ts         # expiring items + actions
│       │   ├── replenishment.ts # suggestions + bulk orders
│       │   ├── suppliers.ts     # CRUD suppliers
│       │   ├── analytics.ts     # charts dari MongoDB user
│       │   ├── notifications.ts # per-user notifications
│       │   └── iot.ts           # sensors + simulate + history
│       └── seed.ts              # Seed 2 user + data awal
│
├── ml/                          # Python Machine Learning
│   ├── app.py                   # Flask API (port 5002)
│   ├── train_model.py           # Training script
│   ├── requirements.txt         # flask, scikit-learn, numpy, pandas
│   ├── Smart_Inventory_Model_Comparison.ipynb  # Google Colab notebook
│   └── inventory_dummy_10k.csv  # 31.850 baris training data
│
└── inventory_dummy_10k.csv      # Dataset (31.850 rows, 35 products)
```

---

## 🧠 Machine Learning

### Model Overview

| Model | Accuracy | MAPE | Keterangan |
|-------|----------|------|------------|
| **Gradient Boosting** *(produksi)* | **95.8%** | 4.2% | scikit-learn, 300 trees, 33 fitur |
| NumPy LSTM *(baseline)* | 94.2% | 5.8% | Pure NumPy, H=64, seq_len=14 |
| Random Forest | 88%+ | 12%+ | Pembanding di Colab notebook |
| Moving Average | 81.9% | 18.1% | Baseline sederhana |

### Features (33 fitur)

```python
# Lag demand
demand_lag1, demand_lag2, demand_lag3, demand_lag7, demand_lag14, demand_lag21, demand_lag30

# Rolling statistics
demand_roll3, demand_roll5, demand_roll7, demand_roll14, demand_roll21, demand_roll30
demand_std7, demand_min7, demand_max7

# Momentum & trend
demand_trend7    # roll3 - roll14
demand_momentum  # roll3 - roll7

# Profit & waste
profit_roll7, gross_roll7, waste_rate

# Calendar & product
Month, DayOfWeek, DayOfYear, Weekend, Seasonal_Factor, quarter
Fill_Level_Pct, Stock_Level, Unit_Price, Cost_Price, price_ratio, Base_Demand
```

### Dataset

```
inventory_dummy_10k.csv
├── 31.850 baris transaksi harian
├── 35 produk × 7 kategori
├── Jan 2024 – Jun 2026 (909 hari)
└── Kolom: Date, SKU_Code, RFID_Tag, Product_Name, Category, Zone,
          Revenue, COGS, Gross_Profit, Net_Profit, Waste_Value,
          Stock_Level, Fill_Level_Pct, Actual_Demand, ...
```

### Retrain Model (Google Colab)

```bash
# 1. Upload inventory_dummy_10k.csv ke Colab
# 2. Buka ml/Smart_Inventory_Model_Comparison.ipynb
# 3. Runtime → Run all
# 4. Download: gb_demand.pkl, gb_profit.pkl, feature_*.npy
# 5. Pindahkan ke folder ml/
# 6. Restart Flask: python3 ml/app.py
```

### Flask ML API Endpoints

```
GET  /health                         → status model, accuracy, endpoints
POST /predict/demand                 → prediksi demand 1 item
POST /predict/profit                 → prediksi gross profit 1 item
POST /predict/batch                  → batch prediksi banyak item
GET  /forecast/daily?days=30         → forecast harian N hari ke depan
GET  /forecast/category              → forecast per kategori
GET  /forecast/monthly?months=6      → forecast bulanan agregat
GET  /forecast/monthly-profit        → data P&L historis per bulan
GET  /model/stats                    → info model (n_estimators, features, dll)
POST /model/retrain                  → trigger retrain async (~60s)
```

---

## 📡 IoT Integration

### Arsitektur

```
14 Virtual Sensors
└── 7 Zona (A–G):
    ├── Zone A: Fresh Produce  (2–8°C,   humidity 85–95%)
    ├── Zone B: Dairy          (2–6°C,   humidity 70–85%)
    ├── Zone C: Beverages      (15–22°C, humidity 40–60%)
    ├── Zone D: Frozen         (-20–-15°C, humidity 30–50%)
    ├── Zone E: Bakery         (18–24°C, humidity 50–65%)
    ├── Zone F: Snacks         (18–25°C, humidity 40–60%)
    └── Zone G: Prepared Foods (4–8°C,   humidity 65–80%)
```

### Data Isolation IoT

Setiap user punya state sensor **terpisah** di MongoDB:
```javascript
IoTSensorState: {
  userId: ObjectId,   // compound unique index dengan sensorId
  sensorId: 'SEN-A001',
  zone: 'A',
  temperature: 4.2,
  humidity: 88,
  batteryLevel: 85,
  status: 'online' | 'warning' | 'offline',
  lastSeen: Date
}
```

### Payload MQTT (opsional, hardware fisik)

```json
{
  "sensorId": "ESP32-ZoneA-01",
  "zone": "A",
  "rfid": "RFID-A001",
  "fillLevel": 72.5,
  "weight": 45.2,
  "temperature": 4.1,
  "humidity": 87.3,
  "timestamp": "2026-06-15T08:30:00Z"
}
```

---

## 📋 API Endpoints

Semua endpoint (kecuali `/api/auth/*`) memerlukan header:
```
Authorization: Bearer <jwt_token>
```

Semua data difilter berdasarkan `userId` dari token — tidak ada cross-user data leakage.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Daftar akun baru |
| POST | `/api/auth/login` | Login → dapat JWT token |
| GET | `/api/auth/me` | Info user yang sedang login |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List inventory (filter: status, category, zone, search) |
| POST | `/api/inventory` | Tambah item baru |
| PUT | `/api/inventory/:id` | Update item |
| DELETE | `/api/inventory/:id` | Hapus item |
| POST | `/api/inventory/import` | Upload Excel/CSV (dedup otomatis per SKU) |
| GET | `/api/inventory/import/logs` | Riwayat import |

### Forecasting (→ Flask ML API)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forecasting/predictions?horizon=90` | Demand forecast |
| GET | `/api/forecasting/category` | Forecast per kategori |
| GET | `/api/forecasting/monthly-profit` | P&L data bulanan |
| GET | `/api/forecasting/ml-stats` | Info model ML |
| POST | `/api/forecasting/retrain` | Trigger retrain model |
| POST | `/api/forecasting/predict` | Prediksi single item |

### Waste Prevention
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/waste/items` | Item expiring ≤7 hari |
| POST | `/api/waste/:id/action` | Apply action (flash_sale/bundle/donation/promotion/kit/alert) |

### Replenishment
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/replenishment/suggestions` | Saran reorder dari stok kritis |
| POST | `/api/replenishment/orders` | Buat order tunggal |
| POST | `/api/replenishment/orders/bulk` | Bulk order semua high priority |
| PUT | `/api/replenishment/orders/:id` | Update status order |

### IoT
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/iot/sensors` | State 14 sensor milik user |
| POST | `/api/iot/simulate` | Simulate IoT tick → simpan ke MongoDB |
| GET | `/api/iot/history` | History 24 jam (per-user seeded) |
| GET | `/api/iot/stats` | Statistik sensor (online/warning/battery) |

### Lainnya
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | KPI aggregation per userId |
| GET | `/api/analytics` | Charts data (waste, turnover, financial) |
| GET/POST/PUT/DELETE | `/api/suppliers` | Manajemen supplier |
| GET | `/api/notifications` | Alert per userId |
| PUT | `/api/notifications/read-all` | Tandai semua sudah dibaca |
| PUT | `/api/notifications/:id/read` | Tandai 1 notif sudah dibaca |
| DELETE | `/api/notifications/:id` | Hapus notifikasi |

---

## ⚙️ Environment Variables

### `backend/.env`

```env
PORT=5001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/?appName=Cluster0
JWT_SECRET=ganti_dengan_secret_yang_kuat_minimal_32_karakter
ML_API_URL=http://localhost:5002
MQTT_BROKER=wss://your-hivemq-host:8884/mqtt
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
NODE_ENV=development
```

---

## 🗄 Database Schema

```
MongoDB Collections (semua punya field userId):
├── users              → auth, role, initials
├── inventoryitems     → compound unique: {userId, rfid}
├── suppliers          → per userId
├── replenishmentorders → per userId
├── wasteitems         → expiry tracking per userId
├── notifications      → alerts per userId
├── iotsensorstates    → compound unique: {userId, sensorId}
└── importlogs         → riwayat import per userId
```

---

## 🔧 Scripts

```bash
# Backend
npm run dev          # nodemon + ts-node (hot reload)
npm run build        # tsc compile
npm run seed         # reset DB + seed 2 user + data awal

# Frontend
npm run dev          # Vite dev server
npm run build        # production build

# ML
python3 ml/app.py               # Flask API
python3 ml/train_model.py       # Retrain dari CSV
# Atau gunakan Google Colab: ml/Smart_Inventory_Model_Comparison.ipynb
```

---

## 🎯 Login Setelah Seed

```
erick@binus.edu    / password123   → IT Developer
admin@smartinventory.com / admin123 → System Administrator
```

Masing-masing user punya data inventory, sensor, order, dan notifikasi yang **terpisah sepenuhnya**.

---

## 📊 Metrics Pencapaian

| Metrik | Nilai |
|--------|-------|
| Pencegahan pemborosan | **USD 4.280/bulan** |
| Penghematan CO₂ | **285 kg/bulan** |
| Fill Rate | **96.2%** |
| Waste Rate | **2.4%** |
| Akurasi LSTM | **94.2%** (MAPE 5.8%) |
| Akurasi GB (produksi) | **95.8%** (MAPE 4.2%, R²=0.987) |
| Akurasi auto replenishment | **99.2%** |
| Jumlah halaman fungsional | **11 halaman** |
| Dataset ML | **31.850 baris** (35 produk, 7 kategori) |

---

## 🏛 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 18 |
| | TypeScript | 5 |
| | Tailwind CSS | 3 |
| | Vite | 5 |
| | Recharts | latest |
| | React Router | 6 |
| Backend | Node.js | 20 LTS |
| | Express | 4.x |
| | TypeScript | 5 |
| Database | MongoDB Atlas | cloud |
| | Mongoose | 8.x |
| Auth | JWT | jsonwebtoken |
| | Password | bcryptjs |
| ML | Python | 3.10+ |
| | scikit-learn | Gradient Boosting |
| | NumPy | LSTM custom |
| | Flask | API server |
| IoT | HiveMQ Cloud | MQTT broker |
| | mqtt.js | 5.x |
| Import | multer | file upload |
| | xlsx | parse Excel |

---

## 📄 License

MIT © 2026 Erick Susanto — BINUS University Enrichment Program 2026/2027
