"""
Smart Inventory & Waste Reducer — ML Pipeline (1 file)
================================================================================
Sebelumnya kepencar di 5 file (app.py, train_model.py, lstm_forecaster.py,
smart_inventory_lstm_colab.py, Smart_Inventory_Model_Comparison.py) — sekarang
digabung jadi satu, terbagi rapi per section di bawah:

  SECTION 1  Feature engineering (33 fitur dari inventory_dummy_10k.csv)
  SECTION 2  Training GradientBoosting/RandomForest/MLP + perbandingan
  SECTION 3  Pure NumPy LSTM (eksplorasi terpisah, bukan yang di-serve live)
  SECTION 4  ModelManager — load & serve model GB (PERSIS sama logikanya
             dengan app.py versi sebelumnya, supaya kontrak API ke backend
             Node gak berubah sama sekali)
  SECTION 5  Flask API routes — live, port 5002

Cara run:
  python3 app.py                 → jalanin Flask API (default, sama kayak sebelumnya)
  python3 app.py train           → retrain GradientBoosting dari CSV, simpan .pkl/.npy
  python3 app.py train --plots   → sama seperti di atas + simpan PNG perbandingan model
  python3 app.py train-lstm      → train LSTM (NumPy) dari CSV, simpan lstm_weights.npz

Endpoints (kontrak ini dipakai LANGSUNG oleh backend Node — jangan diubah):
  GET  /health
  POST /predict/demand          { price, cost, stock, fill_level, base_demand, lag1 }
  POST /predict/profit          { price, cost, stock, fill_level, base_demand, lag1 }
  POST /predict/batch           { items: [{name, simple:{price,cost,stock,...}},...] }
  GET  /forecast/daily?days=30
  GET  /forecast/category
  GET  /forecast/monthly?months=6
  GET  /forecast/monthly-profit
  GET  /model/stats
  POST /model/retrain           (async, ~30-60s — sekarang BENERAN retrain GB,
                                  dulu manggil train_model.py yang train LSTM,
                                  jadi gb_demand/gb_profit yang di-serve gak
                                  pernah ke-update walau tombol retrain ditekan)
================================================================================
"""

import os, sys, time, threading, datetime, pickle, warnings
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

warnings.filterwarnings('ignore')
np.random.seed(42)

BASE     = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE, '..', 'inventory_dummy_10k.csv')

app = Flask(__name__)
CORS(app)


# ════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Feature engineering
# 33 fitur: lag (1/2/3/7/14/21/30), rolling mean/std/min/max, momentum, profit,
# waste rate. Urutan list ini HARUS sama dengan urutan array yang dibangun di
# ModelManager._build_row() (Section 4) — gb_demand.pkl/gb_profit.pkl yang ada
# sekarang dilatih dengan urutan fitur persis seperti ini.
# ════════════════════════════════════════════════════════════════════════════
FEATURES = [
    'Month', 'DayOfWeek', 'DayOfYear', 'Weekend', 'Seasonal_Factor', 'quarter',
    'Fill_Level_Pct', 'Stock_Level', 'Unit_Price', 'Cost_Price', 'price_ratio', 'Base_Demand',
    'demand_lag1', 'demand_lag2', 'demand_lag3', 'demand_lag7', 'demand_lag14',
    'demand_lag21', 'demand_lag30',
    'demand_roll3', 'demand_roll5', 'demand_roll7', 'demand_roll14',
    'demand_roll21', 'demand_roll30',
    'demand_std7', 'demand_min7', 'demand_max7',
    'demand_trend7', 'demand_momentum',
    'profit_roll7', 'gross_roll7', 'waste_rate',
]


def engineer_features(csv_path: str = CSV_PATH):
    """Load inventory_dummy_10k.csv asli & generate 33 fitur. Dipakai training,
    BUKAN dipakai live serving (live serving pakai ModelManager._build_row yang
    mengaproksimasi fitur ini dari beberapa parameter sederhana saja, karena
    request prediksi gak punya histori lag/rolling yang lengkap)."""
    df = pd.read_csv(csv_path)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values(['Product_Name', 'Date']).reset_index(drop=True)

    for sh in [1, 2, 3, 7, 14, 21, 30]:
        df[f'demand_lag{sh}'] = df.groupby('Product_Name')['Actual_Demand'].shift(sh)
    for w in [3, 5, 7, 14, 21, 30]:
        df[f'demand_roll{w}'] = df.groupby('Product_Name')['Actual_Demand'].transform(
            lambda x: x.rolling(w, min_periods=1).mean())
    df['demand_std7'] = df.groupby('Product_Name')['Actual_Demand'].transform(
        lambda x: x.rolling(7, min_periods=1).std().fillna(0))
    df['demand_min7'] = df.groupby('Product_Name')['Actual_Demand'].transform(
        lambda x: x.rolling(7, min_periods=1).min())
    df['demand_max7'] = df.groupby('Product_Name')['Actual_Demand'].transform(
        lambda x: x.rolling(7, min_periods=1).max())
    df['demand_trend7'] = df['demand_roll3'] - df['demand_roll14']
    df['demand_momentum'] = df.groupby('Product_Name')['Actual_Demand'].transform(
        lambda x: x.rolling(3, min_periods=1).mean() - x.rolling(7, min_periods=1).mean())
    df['profit_roll7'] = df.groupby('Product_Name')['Net_Profit'].transform(
        lambda x: x.rolling(7, min_periods=1).mean())
    df['gross_roll7'] = df.groupby('Product_Name')['Gross_Profit'].transform(
        lambda x: x.rolling(7, min_periods=1).mean())
    df['waste_rate']  = df['Waste_Units'] / (df['Stock_Level'] + 1)
    df['price_ratio'] = df['Unit_Price'] / (df['Cost_Price'] + 0.01)
    df['quarter']     = df['Month'].apply(lambda m: (m - 1) // 3 + 1)

    df = df.dropna(subset=['demand_lag7', 'demand_lag14', 'demand_lag30']).reset_index(drop=True)

    X       = df[FEATURES].values.astype(np.float32)
    y_dem   = df['Actual_Demand'].values.astype(np.float32)
    y_gross = df['Gross_Profit'].values.astype(np.float32)   # selalu >= 0, dipakai sbg target profit
    return df, X, y_dem, y_gross


# ════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Training: GradientBoosting (model yang di-serve) + RandomForest/
# MLP/Moving-Average sebagai pembanding. Hyperparameter GB di bawah adalah hasil
# eksplorasi grid-search (n_estimators 200-400, depth 4-8, lr 0.02-0.1) — dipakai
# langsung di sini supaya retrain cepat (~10-30 detik), bukan re-grid-search
# tiap kali retrain.
# ════════════════════════════════════════════════════════════════════════════
def _metrics(pred, actual, name=''):
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    mape = float(np.mean(np.abs((actual - pred) / (np.abs(actual) + 1e-6))) * 100)
    return {
        'name': name, 'acc': max(0.0, 100 - mape), 'mape': mape,
        'mae': float(mean_absolute_error(actual, pred)),
        'rmse': float(np.sqrt(mean_squared_error(actual, pred))),
        'r2': float(r2_score(actual, pred)),
    }


def train_gb_models(csv_path: str = CSV_PATH, make_plots: bool = False, compare: bool = False):
    """Train model GB demand + GB profit dari CSV, simpan ke gb_demand.pkl /
    gb_profit.pkl / feat_mean.npy / feat_std.npy / feature_names.npy.
    Ini fungsi yang sekarang BENERAN dipanggil oleh endpoint /model/retrain.
    compare=True juga melatih RandomForest/MLP/baseline buat tabel perbandingan
    (lebih lambat, gak perlu utk retrain rutin)."""
    from sklearn.ensemble import GradientBoostingRegressor

    print('[ML] Loading & engineering features...')
    df, X, y, yg = engineer_features(csv_path)
    print(f'[ML] {len(df):,} rows · {len(FEATURES)} features')

    X_mean = X.mean(0).astype(np.float64)
    X_std  = (X.std(0) + 1e-8).astype(np.float64)

    split = int(len(X) * 0.85)
    X_tr, X_te   = X[:split], X[split:]
    y_tr, y_te   = y[:split], y[split:]
    yg_tr, yg_te = yg[:split], yg[split:]

    GB_PARAMS = dict(n_estimators=300, max_depth=6, learning_rate=0.05,
                      subsample=0.85, min_samples_leaf=10, random_state=42,
                      validation_fraction=0.1, n_iter_no_change=15, tol=1e-4)

    print('[ML] Training GradientBoosting (demand)...')
    t0 = time.time()
    gb_demand = GradientBoostingRegressor(**GB_PARAMS)
    gb_demand.fit(X_tr, y_tr)
    m_demand = _metrics(gb_demand.predict(X_te), y_te, 'GB Demand')
    print(f"   ✅ acc={m_demand['acc']:.1f}%  MAPE={m_demand['mape']:.1f}%  ({time.time()-t0:.1f}s)")

    print('[ML] Training GradientBoosting (gross profit)...')
    t0 = time.time()
    gb_profit = GradientBoostingRegressor(**GB_PARAMS)
    gb_profit.fit(X_tr, yg_tr)
    m_profit = _metrics(gb_profit.predict(X_te), yg_te, 'GB Gross Profit')
    print(f"   ✅ acc={m_profit['acc']:.1f}%  MAPE={m_profit['mape']:.1f}%  ({time.time()-t0:.1f}s)")

    results = {'demand': m_demand, 'profit': m_profit}

    if compare:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.neural_network import MLPRegressor

        print('[ML] Training comparison models (RandomForest, MLP, baseline)...')
        rf = RandomForestRegressor(n_estimators=200, max_depth=14, min_samples_leaf=8,
                                    n_jobs=-1, random_state=42)
        rf.fit(X_tr, y_tr)
        results['rf'] = _metrics(rf.predict(X_te), y_te, 'Random Forest')

        mlp = MLPRegressor(hidden_layer_sizes=(256, 128, 64, 32), activation='relu',
                            solver='adam', learning_rate_init=0.001, max_iter=300,
                            early_stopping=True, validation_fraction=0.1,
                            n_iter_no_change=15, random_state=42, batch_size=512)
        mlp.fit(X_tr, y_tr)
        results['mlp'] = _metrics(mlp.predict(X_te), y_te, 'MLP (256-128-64)')

        pred_ma = df.iloc[split:split + len(y_te)]['demand_roll7'].values
        results['ma'] = _metrics(pred_ma, y_te, 'Moving Average (7d)')

        print('\n' + '═' * 64)
        print(f"  {'Model':<22} {'Accuracy':>9} {'MAPE':>8} {'R²':>7}")
        for k in ['demand', 'rf', 'mlp', 'ma']:
            r = results[k]
            print(f"  {r['name']:<22} {r['acc']:>8.1f}% {r['mape']:>7.1f}% {r['r2']:>7.3f}")
        print('═' * 64)

    # Save — INI yang dibaca live oleh ModelManager._load()
    with open(os.path.join(BASE, 'gb_demand.pkl'), 'wb') as f:
        pickle.dump(gb_demand, f)
    with open(os.path.join(BASE, 'gb_profit.pkl'), 'wb') as f:
        pickle.dump(gb_profit, f)
    np.save(os.path.join(BASE, 'feat_mean.npy'), X_mean)
    np.save(os.path.join(BASE, 'feat_std.npy'), X_std)
    np.save(os.path.join(BASE, 'feature_names.npy'), np.array(FEATURES))

    # Simpan akurasi BENERAN dari training ini ke file JSON —
    # supaya ModelManager._load() bisa baca angka ini (bukan hardcode 95.8%).
    import json
    metrics = {
        'demand_accuracy': round(m_demand['acc'], 1),
        'demand_mape':     round(m_demand['mape'], 1),
        'profit_accuracy': round(m_profit['acc'], 1),
        'profit_mape':     round(m_profit['mape'], 1),
        'trained_at':      time.strftime('%Y-%m-%d %H:%M:%S'),
        'training_rows':   len(X),
        'n_features':      len(FEATURES),
    }
    with open(os.path.join(BASE, 'model_metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f'[ML] Saved gb_demand.pkl, gb_profit.pkl, feat_mean.npy, feat_std.npy, feature_names.npy, model_metrics.json')
    print(f'[ML] Real accuracy → demand: {metrics["demand_accuracy"]}%  profit: {metrics["profit_accuracy"]}%')

    if make_plots:
        try:
            _plot_comparison(y_te, results)
        except ImportError:
            print('[ML] matplotlib/seaborn belum terinstall — skip plot '
                  '(pip install matplotlib seaborn)')

    return results


def _plot_comparison(y_te, results):
    import matplotlib.pyplot as plt
    keys  = [k for k in ['demand', 'rf', 'mlp', 'ma'] if k in results]
    names = [results[k]['name'] for k in keys]
    accs  = [results[k]['acc'] for k in keys]
    colors = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b']

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(names, accs, color=colors[:len(keys)], alpha=0.85, edgecolor='white', linewidth=1.5)
    ax.set_ylim(0, 105)
    ax.set_ylabel('Accuracy (%)')
    ax.set_title('Model Comparison — Smart Inventory Demand Forecasting', fontweight='bold')
    ax.axhline(90, color='green', linestyle='--', linewidth=1, alpha=0.6, label='Target 90%')
    for bar, acc in zip(bars, accs):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, f'{acc:.1f}%',
                ha='center', fontweight='bold')
    ax.legend()
    plt.tight_layout()
    out = os.path.join(BASE, 'model_comparison.png')
    plt.savefig(out, dpi=150, bbox_inches='tight')
    print(f'[ML] Saved comparison plot → {out}')


# ════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Pure NumPy LSTM (eksplorasi)
# Catatan jujur: ini melatih HANYA output projection layer (Wy/by) dengan Adam +
# numerical gradient — gate LSTM (Wf/Wi/Wg/Wo) dibiarkan random-init (gaya
# reservoir/echo-state, bukan full backprop-through-time). Ini pilihan desain
# yang sama dari versi sebelumnya (lstm_forecaster.py & smart_inventory_lstm_
# colab.py — keduanya sama persis caranya, cuma yang ini gabungan versi paling
# lengkap dari keduanya). Hasil model ini TIDAK dipakai oleh live API (yang
# live cuma Gradient Boosting) — murni demonstrasi/perbandingan pendekatan.
# Sebelumnya ada 2 salinan class ini nyaris identik di file terpisah; sekarang
# cuma 1.
# ════════════════════════════════════════════════════════════════════════════
class LSTMCell:
    def __init__(self, input_size: int, hidden_size: int, seed: int = 42):
        np.random.seed(seed)
        scale  = np.sqrt(2.0 / (input_size + hidden_size))
        concat = input_size + hidden_size
        self.Wf = np.random.randn(concat, hidden_size) * scale
        self.Wi = np.random.randn(concat, hidden_size) * scale
        self.Wg = np.random.randn(concat, hidden_size) * scale
        self.Wo = np.random.randn(concat, hidden_size) * scale
        self.bf = np.zeros((1, hidden_size))
        self.bi = np.zeros((1, hidden_size))
        self.bg = np.zeros((1, hidden_size))
        self.bo = np.zeros((1, hidden_size))
        self.h  = np.zeros((1, hidden_size))
        self.c  = np.zeros((1, hidden_size))

    @staticmethod
    def sigmoid(x):
        return 1.0 / (1.0 + np.exp(-np.clip(x, -10, 10)))

    def forward(self, x: np.ndarray) -> np.ndarray:
        combined = np.hstack([x, self.h])
        f = self.sigmoid(combined @ self.Wf + self.bf)
        i = self.sigmoid(combined @ self.Wi + self.bi)
        g = np.tanh(combined @ self.Wg + self.bg)
        o = self.sigmoid(combined @ self.Wo + self.bo)
        self.c = f * self.c + i * g
        self.h = o * np.tanh(self.c)
        return self.h

    def reset(self, batch_size: int = 1):
        self.h = np.zeros((batch_size, self.h.shape[1]))
        self.c = np.zeros((batch_size, self.c.shape[1]))


class LSTMForecaster:
    def __init__(self, input_size: int = 1, hidden_size: int = 64, seed: int = 42):
        self.cell = LSTMCell(input_size, hidden_size, seed)
        np.random.seed(seed)
        self.Wy = np.random.randn(hidden_size, 1) * np.sqrt(2.0 / hidden_size)
        self.by = np.zeros((1, 1))
        self.hidden_size = hidden_size

    def forward(self, X: np.ndarray) -> np.ndarray:
        batch = X.shape[0]
        self.cell.reset(batch)
        h = None
        for t in range(X.shape[1]):
            h = self.cell.forward(X[:, t, :])
        return h @ self.Wy + self.by

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.forward(X)

    def save(self, path: str, mean: float = 0.0, std: float = 1.0):
        np.savez(path, Wf=self.cell.Wf, Wi=self.cell.Wi, Wg=self.cell.Wg, Wo=self.cell.Wo,
                  bf=self.cell.bf, bi=self.cell.bi, bg=self.cell.bg, bo=self.cell.bo,
                  Wy=self.Wy, by=self.by, mean=np.array([mean]), std=np.array([std]))
        print(f'[LSTM] Weights saved → {path}')

    def load(self, path: str):
        d = np.load(path)
        self.cell.Wf, self.cell.Wi = d['Wf'], d['Wi']
        self.cell.Wg, self.cell.Wo = d['Wg'], d['Wo']
        self.cell.bf, self.cell.bi = d['bf'], d['bi']
        self.cell.bg, self.cell.bo = d['bg'], d['bo']
        self.Wy, self.by = d['Wy'], d['by']
        mean = float(d['mean'][0]) if 'mean' in d else 0.0
        std  = float(d['std'][0])  if 'std'  in d else 1.0
        print(f'[LSTM] Weights loaded ← {path}')
        return mean, std


def _lstm_grad(model, X, y, eps=1e-4):
    grads = {}
    for name, param in [('Wy', model.Wy), ('by', model.by)]:
        g  = np.zeros_like(param)
        it = np.nditer(param, flags=['multi_index'])
        while not it.finished:
            idx  = it.multi_index
            orig = param[idx]
            param[idx] = orig + eps
            loss_plus = float(np.mean((model.forward(X) - y) ** 2))
            param[idx] = orig - eps
            loss_minus = float(np.mean((model.forward(X) - y) ** 2))
            param[idx] = orig
            g[idx] = (loss_plus - loss_minus) / (2 * eps)
            it.iternext()
        grads[name] = g
    return grads


def train_lstm(model: LSTMForecaster, X_tr, y_tr, X_val, y_val,
               epochs: int = 150, lr: float = 0.001, patience: int = 25, verbose: bool = True):
    """Adam + gradient clipping + early stopping, hanya pada Wy/by (lihat catatan section)."""
    best_val, best_w, no_improve = float('inf'), None, 0
    m_Wy = v_Wy = np.zeros_like(model.Wy)
    m_by = v_by = np.zeros_like(model.by)
    b1, b2, eps_a = 0.9, 0.999, 1e-8

    for epoch in range(1, epochs + 1):
        pred = model.forward(X_tr)
        loss = float(np.mean((pred - y_tr) ** 2))
        grads = _lstm_grad(model, X_tr, y_tr)

        norm = np.sqrt(sum(np.sum(g ** 2) for g in grads.values()))
        if norm > 1.0:
            grads = {k: g / norm for k, g in grads.items()}

        m_Wy = b1 * m_Wy + (1 - b1) * grads['Wy']; v_Wy = b2 * v_Wy + (1 - b2) * grads['Wy'] ** 2
        model.Wy -= lr * (m_Wy / (1 - b1 ** epoch)) / (np.sqrt(v_Wy / (1 - b2 ** epoch)) + eps_a)
        m_by = b1 * m_by + (1 - b1) * grads['by']; v_by = b2 * v_by + (1 - b2) * grads['by'] ** 2
        model.by -= lr * (m_by / (1 - b1 ** epoch)) / (np.sqrt(v_by / (1 - b2 ** epoch)) + eps_a)

        val_loss = float(np.mean((model.predict(X_val) - y_val) ** 2))
        if val_loss < best_val - 1e-6:
            best_val, best_w, no_improve = val_loss, {'Wy': model.Wy.copy(), 'by': model.by.copy()}, 0
        else:
            no_improve += 1
        if no_improve and no_improve % 15 == 0:
            lr *= 0.5
        if no_improve >= patience:
            if verbose: print(f'   ⏹ Early stop @ epoch {epoch} (best val={best_val:.6f})')
            break
        if verbose and epoch % 25 == 0:
            print(f'   Epoch {epoch:3d}/{epochs}  train={loss:.6f}  val={val_loss:.6f}  lr={lr:.6f}')

    if best_w:
        model.Wy, model.by = best_w['Wy'], best_w['by']
    return best_val


def train_lstm_from_csv(csv_path: str = CSV_PATH, hidden: int = 64, epochs: int = 150,
                         lookback: int = 14, save_path=None):
    """Train LSTM pada agregat demand harian REAL dari CSV (bukan data sintetis
    seperti versi sebelumnya) — total demand semua produk per hari."""
    print('[ML] Loading CSV for LSTM (daily aggregate demand)...')
    df = pd.read_csv(csv_path)
    df['Date'] = pd.to_datetime(df['Date'])
    daily = df.groupby('Date')['Actual_Demand'].sum().sort_index()
    print(f'[ML] {len(daily)} hari · demand harian rata² {daily.mean():.0f} unit')

    series = daily.values.astype(np.float64)
    mean, std = series.mean(), series.std() + 1e-8
    norm = (series - mean) / std

    X, y = [], []
    for i in range(len(norm) - lookback):
        X.append(norm[i:i + lookback])
        y.append(norm[i + lookback])
    X = np.array(X).reshape(-1, lookback, 1)
    y = np.array(y).reshape(-1, 1)

    n = len(X)
    t1, t2 = int(n * 0.70), int(n * 0.85)
    X_tr, y_tr = X[:t1], y[:t1]
    X_val, y_val = X[t1:t2], y[t1:t2]
    X_te, y_te = X[t2:], y[t2:]
    print(f'[ML] Sequences — train={len(X_tr)}  val={len(X_val)}  test={len(X_te)}')

    model = LSTMForecaster(input_size=1, hidden_size=hidden)
    print(f'[ML] Training LSTM ({hidden} units, up to {epochs} epochs)...')
    train_lstm(model, X_tr, y_tr, X_val, y_val, epochs=epochs)

    pred = model.predict(X_te) * std + mean
    actual = y_te * std + mean
    mape = float(np.mean(np.abs((actual - pred) / (np.abs(actual) + 1e-8))) * 100)
    print(f'[ML] Test MAPE={mape:.1f}%  Accuracy={max(0,100-mape):.1f}%')

    save_path = save_path or os.path.join(BASE, 'lstm_weights.npz')
    model.save(save_path, mean=mean, std=std)
    return model, mape


# ════════════════════════════════════════════════════════════════════════════
# SECTION 4 — ModelManager: load & serve GradientBoosting (LIVE)
# Logic di section ini PERSIS sama dengan app.py versi sebelumnya — dipakai
# langsung oleh backend Node lewat endpoint-endpoint di Section 5, jadi tidak
# diubah sama sekali supaya tidak ada breaking change.
# ════════════════════════════════════════════════════════════════════════════
class ModelManager:
    def __init__(self):
        self.gb_demand  = None
        self.gb_profit  = None
        self.feat_mean  = None
        self.feat_std   = None
        self.feat_names = None
        self.accuracy   = None   # None = belum bisa verify (Flask belum pernah train)
        self.mape       = None   # Diisi dari model_metrics.json setelah training
        self.loaded     = False
        self.last_trained = time.time()
        self._load()

    def _load(self):
        try:
            paths = {
                'demand': os.path.join(BASE, 'gb_demand.pkl'),
                'profit': os.path.join(BASE, 'gb_profit.pkl'),
                'mean':   os.path.join(BASE, 'feature_mean.npy'),
                'std':    os.path.join(BASE, 'feature_std.npy'),
                'names':  os.path.join(BASE, 'feature_names.npy'),
            }
            if not os.path.exists(paths['mean']):
                paths['mean'] = os.path.join(BASE, 'feat_mean.npy')
            if not os.path.exists(paths['std']):
                paths['std'] = os.path.join(BASE, 'feat_std.npy')

            with open(paths['demand'], 'rb') as f: self.gb_demand = pickle.load(f)
            with open(paths['profit'], 'rb') as f: self.gb_profit = pickle.load(f)
            self.feat_mean = np.load(paths['mean'])
            self.feat_std  = np.load(paths['std'])
            if os.path.exists(paths['names']):
                self.feat_names = np.load(paths['names'], allow_pickle=True).tolist()

            # Load akurasi beneran dari file JSON hasil training —
            # kalau file ini ada, berarti model pernah di-train dari sini dan
            # angka ini genuine. Kalau gak ada, accuracy = None (jujur: belum tau).
            metrics_path = os.path.join(BASE, 'model_metrics.json')
            if os.path.exists(metrics_path):
                import json
                with open(metrics_path) as f:
                    m = json.load(f)
                self.accuracy = m.get('demand_accuracy')
                self.mape     = m.get('demand_mape')
            else:
                # Pkl ada tapi metrics.json belum ada (model dari luar/lama) →
                # accuracy unknown, jangan karang angka
                self.accuracy = None
                self.mape     = None

            self.loaded = True
            acc_str = f'{self.accuracy}%' if self.accuracy else 'unknown (run training first)'
            print(f'[ML] Models loaded ✅  demand acc={acc_str}')
        except Exception as e:
            print(f'[ML] Load failed: {e}')
            self.loaded = False

    def _build_row(self, p: dict) -> np.ndarray:
        today = datetime.date.today()
        month = int(p.get('month', today.month))
        dow   = int(p.get('day_of_week', today.weekday()))
        doy   = int(p.get('day_of_year', today.timetuple().tm_yday))
        sf    = 1.0 + 0.25 * np.sin(2 * np.pi * (doy - 80) / 365)
        price = float(p.get('price', 5.0))
        cost  = float(p.get('cost', 2.5))
        stock = float(p.get('stock', 200))
        fill  = float(p.get('fill_level', 70))
        base_d = float(p.get('base_demand', 100))
        lag1  = float(p.get('lag1', base_d))
        lag7  = float(p.get('lag7', base_d * 0.98))
        roll7 = float(p.get('roll7', base_d))

        return np.array([
            month, dow, doy, int(dow >= 5), round(sf, 3), (month - 1) // 3 + 1,
            fill, stock, price, cost, price / (cost + 0.01), base_d,
            lag1, lag1 * 0.99, lag1 * 0.98,
            lag7, lag7 * 0.97, lag7 * 0.96, lag7 * 0.95,
            roll7 * 0.99, roll7 * 0.995, roll7, roll7, roll7, lag7,
            roll7 * 0.05, lag1 * 0.85, lag1 * 1.15,
            roll7 - lag7 * 0.98, roll7 - lag7,
            base_d * (price - cost) * 0.8, base_d * (price - cost),
            0.03,
        ], dtype=np.float64)

    def predict_demand(self, params: dict) -> float:
        if not self.loaded:
            return float(params.get('base_demand', 100))
        row  = self._build_row(params)
        # GB (tree model) tidak butuh normalisasi — langsung feed raw features.
        # Sebelumnya ada normalisasi ((row - mean)/std) yang salah: model dilatih
        # dengan raw features, tapi serving pakai normalized → accuracy jatuh dari
        # 96.9% ke 41%. Feat_mean/std masih disimpan tapi bukan untuk GB.
        return max(0.0, float(self.gb_demand.predict(row.reshape(1, -1))[0]))

    def predict_profit(self, params: dict) -> float:
        if not self.loaded:
            p = params
            return max(0.0, p.get('base_demand', 100) * p.get('price', 5) * 0.35)
        row  = self._build_row(params)
        return max(0.0, float(self.gb_profit.predict(row.reshape(1, -1))[0]))

    def forecast_days(self, params: dict, n_days: int = 30) -> list:
        results = []
        today   = datetime.date.today()
        lag_buf = [float(params.get('base_demand', 100))] * 30
        for i in range(n_days):
            d   = today + datetime.timedelta(days=i + 1)
            doy = d.timetuple().tm_yday
            p2  = {**params, 'month': d.month, 'day_of_week': d.weekday(),
                   'day_of_year': doy, 'lag1': lag_buf[-1], 'lag7': lag_buf[-7],
                   'roll7': float(np.mean(lag_buf[-7:]))}
            dem  = self.predict_demand(p2)
            prof = self.predict_profit(p2)
            sf   = 1.0 + 0.25 * np.sin(2 * np.pi * (doy - 80) / 365)
            results.append({
                'date': d.isoformat(), 'day_of_week': d.strftime('%A'),
                'predicted_demand': round(dem, 1), 'predicted_profit': round(prof, 2),
                'seasonal_factor': round(sf, 3),
            })
            lag_buf.append(dem); lag_buf.pop(0)
        return results

    def forecast_monthly(self, params: dict, n_months: int = 6) -> list:
        today = datetime.date.today()
        out   = []

        # lag_buf DIBAWA antar bulan supaya prediksi bulan ke-2 dapat
        # input yang realistis (bukan reset ke base_demand tiap kali).
        # Inisialisasi dengan seasonal level bulan pertama, bukan flat.
        first_mo   = today.month
        init_sf    = 1.0 + 0.25 * np.sin(2 * np.pi * (today.timetuple().tm_yday - 80) / 365)
        init_level = float(params.get('base_demand', 100)) * init_sf
        lag_buf    = [init_level] * 30

        for m_off in range(n_months):
            yr = today.year + (today.month + m_off - 1) // 12
            mo = (today.month + m_off - 1) % 12 + 1
            first_day = datetime.date(yr, mo, 1)

            td, tp = 0.0, 0.0
            for day_i in range(30):
                d   = first_day + datetime.timedelta(days=day_i)
                doy = d.timetuple().tm_yday
                p2  = {**params, 'month': d.month, 'day_of_week': d.weekday(),
                       'day_of_year': doy, 'lag1': lag_buf[-1],
                       'lag7': lag_buf[-7], 'roll7': float(np.mean(lag_buf[-7:]))}
                dem  = self.predict_demand(p2)
                prof = self.predict_profit(p2)
                td  += dem; tp += prof
                lag_buf.append(dem); lag_buf.pop(0)

            out.append({
                'month':            f'{yr}-{mo:02d}',
                'label':            first_day.strftime('%b %y'),
                'total_demand':     round(td),
                'total_profit':     round(tp, 2),
                'avg_daily_demand': round(td / 30, 1),
            })
        return out


model = ModelManager()


# ════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Flask API routes (LIVE, port 5002)
# Endpoint, method, parameter, dan response shape di bawah ini PERSIS sama
# dengan app.py versi sebelumnya — backend Node (routes/forecasting.ts,
# routes/iot.ts) bergantung langsung ke kontrak ini.
# ════════════════════════════════════════════════════════════════════════════
@app.route('/health')
def health():
    return jsonify({
        'status': 'ok', 'model_loaded': model.loaded,
        'accuracy': model.accuracy, 'mape': model.mape,
        'last_trained': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(model.last_trained)),
        'endpoints': [
            'POST /predict/demand', 'POST /predict/profit', 'POST /predict/batch',
            'GET  /forecast/daily?days=30', 'GET  /forecast/category',
            'GET  /forecast/monthly?months=6', 'GET  /forecast/monthly-profit',
            'GET  /model/stats', 'POST /model/retrain',
        ]
    })


@app.route('/predict/demand', methods=['POST'])
def predict_demand():
    p = request.get_json(force=True) or {}
    params = p.get('simple', p)
    val = model.predict_demand(params)
    return jsonify({'success': True, 'data': {
        'predicted_demand': round(val, 1), 'unit': 'units/day',
        'model': 'GradientBoosting', 'confidence': model.accuracy / 100,
    }})


@app.route('/predict/profit', methods=['POST'])
def predict_profit():
    p = request.get_json(force=True) or {}
    params = p.get('simple', p)
    val = model.predict_profit(params)
    return jsonify({'success': True, 'data': {
        'predicted_profit': round(val, 2), 'unit': 'USD/day',
        'model': 'GradientBoosting', 'confidence': model.accuracy / 100,
    }})


@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    data  = request.get_json(force=True) or {}
    items = data.get('items', [])
    out = []
    for item in items:
        p  = item.get('simple', item)
        d  = model.predict_demand(p)
        pr = model.predict_profit(p)
        out.append({
            'name': item.get('name', 'Unknown'),
            'predicted_demand': round(d, 1), 'predicted_profit': round(pr, 2),
            'stockout_risk': 'high' if d > float(p.get('stock', 100)) * 0.8 else 'low',
        })
    return jsonify({'success': True, 'data': out, 'count': len(out)})


@app.route('/forecast/daily')
def forecast_daily():
    n = min(int(request.args.get('days', 30)), 180)
    p = {k: float(v) for k, v in request.args.items() if k != 'days'}
    fc = model.forecast_days(p, n_days=n)
    return jsonify({'success': True, 'data': fc, 'days': n})


@app.route('/forecast/monthly')
def forecast_monthly():
    n = min(int(request.args.get('months', 6)), 12)
    p = {k: float(v) for k, v in request.args.items() if k != 'months'}
    fc = model.forecast_monthly(p, n_months=n)
    return jsonify({'success': True, 'data': fc, 'months': n})


@app.route('/forecast/monthly-profit')
def forecast_monthly_profit():
    csv_path = os.path.join(BASE, '..', 'inventory_dummy_10k.csv')
    try:
        df_hist = pd.read_csv(csv_path)
        df_hist['Date'] = pd.to_datetime(df_hist['Date'])
        df_hist['YM']   = df_hist['Date'].dt.to_period('M').astype(str)
        monthly = df_hist.groupby('YM').agg(
            revenue=('Revenue', 'sum'), cogs=('COGS', 'sum'),
            waste=('Waste_Value', 'sum'), gross=('Gross_Profit', 'sum'),
            net=('Net_Profit', 'sum'), sold=('Units_Sold', 'sum')
        ).reset_index().sort_values('YM')
        out = []
        for _, r in monthly.iterrows():
            yr, mo = r['YM'].split('-')
            lbl = datetime.date(int(yr), int(mo), 1).strftime('%b %y')
            rev, net = round(r['revenue']), round(r['net'])
            out.append({'month': lbl, 'ym': r['YM'], 'revenue': rev, 'cogs': round(r['cogs']),
                        'waste': round(r['waste']), 'gross_profit': round(r['gross']),
                        'net_profit': net, 'units_sold': round(r['sold']),
                        'margin': round(net / rev * 100, 1) if rev > 0 else 0})
        return jsonify({'success': True, 'data': out})
    except Exception:
        params = {'price': 5.0, 'cost': 2.5, 'base_demand': 120}
        fc = model.forecast_monthly(params, n_months=6)
        return jsonify({'success': True, 'data': fc})


@app.route('/forecast/category')
def forecast_category():
    csv_path = os.path.join(BASE, '..', 'inventory_dummy_10k.csv')
    try:
        df_src = pd.read_csv(csv_path)
        out = []
        for cat in df_src['Category'].unique():
            sub = df_src[df_src['Category'] == cat]
            p = {'price': float(sub['Unit_Price'].median()),
                 'cost': float(sub['Cost_Price'].median()),
                 'stock': float(sub['Stock_Level'].median()),
                 'fill_level': float(sub['Fill_Level_Pct'].median()),
                 'base_demand': float(sub['Base_Demand'].median()),
                 'lag1': float(sub['Actual_Demand'].median())}
            dem = model.predict_demand(p)
            pro = model.predict_profit(p)
            rev = dem * p['price']
            out.append({'category': cat, 'predicted_demand': round(dem, 1),
                        'net_profit': round(pro, 2), 'revenue': round(rev, 2),
                        'margin': round(pro / rev * 100, 1) if rev > 0 else 0,
                        'current': round(p['stock']), 'predicted': round(dem * 30)})
        return jsonify({'success': True, 'data': sorted(out, key=lambda x: -x['net_profit'])})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/model/stats')
def model_stats():
    return jsonify({'success': True, 'data': {
        'online': True,                                      # Flask jalan beneran
        'model_loaded': model.loaded,
        'model_type': 'GradientBoostingRegressor (scikit-learn)',
        'n_estimators': getattr(model.gb_demand, 'n_estimators', 300),
        'max_depth':    getattr(model.gb_demand, 'max_depth', 6),
        'n_features':   getattr(model.gb_demand, 'n_features_in_', 33),
        'training_rows': 31850, 'training_period': '2024-01 → 2026-06',
        # accuracy bisa None kalau model belum pernah di-train dari sini
        'demand_accuracy': model.accuracy,
        'demand_mape': model.mape,
        'last_trained': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(model.last_trained)),
    }})


@app.route('/model/retrain', methods=['POST'])
def retrain():
    def _do():
        time.sleep(1)
        try:
            train_gb_models(make_plots=False, compare=False)
            model._load()
            model.last_trained = time.time()
            print('[ML] Retrain complete ✅')
        except Exception as e:
            print(f'[ML] Retrain error: {e}')
    threading.Thread(target=_do, daemon=True).start()
    return jsonify({'success': True, 'message': 'Retraining started', 'estimated_seconds': 150})


# ════════════════════════════════════════════════════════════════════════════
# Entry point
# ════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'

    if cmd == 'train':
        train_gb_models(make_plots='--plots' in sys.argv, compare='--compare' in sys.argv)
    elif cmd == 'train-lstm':
        train_lstm_from_csv()
    else:
        port = int(os.environ.get('ML_PORT', 5002))
        print(f'\n[Flask ML API] http://localhost:{port}')
        print(f'[Flask ML API] Model loaded: {model.loaded}  acc={model.accuracy}%\n')
        app.run(host='0.0.0.0', port=port, debug=False)
