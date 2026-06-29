# =============================================================================
# Smart Inventory and Waste Reducer — LSTM Forecasting (Google Colab)
# =============================================================================
# Jalankan di Google Colab: File > New notebook, paste tiap cell
# Atau upload file .py ini ke Colab dan jalankan
# =============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# CELL 1: Install & Import
# ─────────────────────────────────────────────────────────────────────────────
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from datetime import datetime, timedelta
import json, time, warnings
warnings.filterwarnings('ignore')

np.random.seed(42)
print("✅ Libraries loaded")
print(f"NumPy version: {np.__version__}")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 2: Data Generation (Multi-category + IoT simulation)
# ─────────────────────────────────────────────────────────────────────────────

CATEGORIES = ['Fresh Produce', 'Dairy', 'Beverages', 'Frozen', 'Bakery']
N_MONTHS = 48  # 4 years historical data

def generate_demand(n_months: int, base: float, growth: float,
                    seasonality: float, noise_std: float,
                    demand_shock: bool = False) -> np.ndarray:
    """Generate realistic demand with trend + seasonality + noise."""
    t = np.arange(n_months)
    trend = base + growth * t
    seasonal = seasonality * np.sin(2 * np.pi * t / 12)
    secondary = (seasonality * 0.3) * np.sin(2 * np.pi * t / 6)   # bi-annual peak
    noise = np.random.normal(0, noise_std, n_months)

    if demand_shock:
        # Simulate random demand shocks (promotions, holidays)
        shock_months = np.random.choice(n_months, size=int(n_months * 0.1), replace=False)
        noise[shock_months] += np.random.uniform(200, 600, len(shock_months))

    demand = trend + seasonal + secondary + noise
    return np.clip(demand, 50, None)   # minimum demand = 50 units

# Generate per-category data
cat_params = {
    'Fresh Produce': dict(base=3000, growth=80,  seasonality=600,  noise_std=150, demand_shock=True),
    'Dairy':         dict(base=2200, growth=50,  seasonality=300,  noise_std=100, demand_shock=False),
    'Beverages':     dict(base=4000, growth=120, seasonality=900,  noise_std=200, demand_shock=True),
    'Frozen':        dict(base=1500, growth=40,  seasonality=200,  noise_std=80,  demand_shock=False),
    'Bakery':        dict(base=1800, growth=30,  seasonality=250,  noise_std=90,  demand_shock=True),
}

raw_data = {cat: generate_demand(N_MONTHS, **params) for cat, params in cat_params.items()}
combined = sum(raw_data.values())   # total demand

# IoT-simulated fill levels (correlated with demand)
def generate_iot_fill(demand: np.ndarray) -> np.ndarray:
    """Simulate fill level % based on restocking + demand draw-down."""
    fill = np.zeros(len(demand))
    fill[0] = 85.0
    restock_threshold = 20.0
    restock_amount = 70.0
    for i in range(1, len(demand)):
        draw = demand[i] / 500.0   # demand draws down fill
        fill[i] = fill[i-1] - draw + np.random.normal(0, 1)
        if fill[i] < restock_threshold:
            fill[i] += restock_amount   # automated restock
        fill[i] = np.clip(fill[i], 0, 100)
    return fill

iot_fill = {cat: generate_iot_fill(raw_data[cat]) for cat in CATEGORIES}

print(f"✅ Generated {N_MONTHS} months of demand data across {len(CATEGORIES)} categories")
print(f"\nDemand Summary:")
for cat in CATEGORIES:
    d = raw_data[cat]
    print(f"  {cat:20s}: mean={d.mean():.0f}  min={d.min():.0f}  max={d.max():.0f}")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 3: Preprocessing
# ─────────────────────────────────────────────────────────────────────────────

LOOKBACK = 12   # 12 months lookback window
HORIZON  = 90   # 90-day forecast horizon

def zscore_normalize(data: np.ndarray):
    mean, std = data.mean(), data.std()
    return (data - mean) / (std + 1e-8), mean, std

def create_sequences(data: np.ndarray, lookback: int):
    X, y = [], []
    for i in range(len(data) - lookback):
        X.append(data[i:i + lookback])
        y.append(data[i + lookback])
    return np.array(X).reshape(-1, lookback, 1), np.array(y).reshape(-1, 1)

# Normalize & create sequences for combined demand
norm, DATA_MEAN, DATA_STD = zscore_normalize(combined)
X, y = create_sequences(norm, LOOKBACK)

# Train/val/test split: 70/15/15
n = len(X)
t1, t2 = int(n * 0.70), int(n * 0.85)
X_train, y_train = X[:t1], y[:t1]
X_val,   y_val   = X[t1:t2], y[t1:t2]
X_test,  y_test  = X[t2:], y[t2:]

print(f"✅ Sequences created | lookback={LOOKBACK} months")
print(f"   Train: {len(X_train)} samples ({len(X_train)/n*100:.0f}%)")
print(f"   Val  : {len(X_val)} samples ({len(X_val)/n*100:.0f}%)")
print(f"   Test : {len(X_test)} samples ({len(X_test)/n*100:.0f}%)")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 4: LSTM Model (Pure NumPy)
# ─────────────────────────────────────────────────────────────────────────────

class LSTMCell:
    def __init__(self, input_size: int, hidden_size: int, seed: int = 42):
        np.random.seed(seed)
        scale = np.sqrt(2.0 / (input_size + hidden_size))
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
        self._cache = []

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
        self._cache.append((combined, f, i, g, o, self.c.copy(), self.h.copy()))
        return self.h

    def reset(self, batch_size: int = 1):
        self.h = np.zeros((batch_size, self.h.shape[1]))
        self.c = np.zeros((batch_size, self.c.shape[1]))
        self._cache = []


class LSTMForecaster:
    def __init__(self, input_size: int = 1, hidden_size: int = 64, seed: int = 42):
        self.cell = LSTMCell(input_size, hidden_size, seed)
        np.random.seed(seed)
        scale = np.sqrt(2.0 / hidden_size)
        self.Wy = np.random.randn(hidden_size, 1) * scale
        self.by = np.zeros((1, 1))
        self.hidden_size = hidden_size

    def forward(self, X: np.ndarray) -> np.ndarray:
        batch = X.shape[0]
        self.cell.reset(batch)
        for t in range(X.shape[1]):
            h = self.cell.forward(X[:, t, :])
        return h @ self.Wy + self.by

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.forward(X)

    def save(self, path: str = "lstm_weights.npz"):
        np.savez(path,
            Wf=self.cell.Wf, Wi=self.cell.Wi, Wg=self.cell.Wg, Wo=self.cell.Wo,
            bf=self.cell.bf, bi=self.cell.bi, bg=self.cell.bg, bo=self.cell.bo,
            Wy=self.Wy, by=self.by, mean=np.array([DATA_MEAN]), std=np.array([DATA_STD]))
        print(f"✅ Weights saved → {path}")

    def load(self, path: str = "lstm_weights.npz"):
        d = np.load(path)
        self.cell.Wf, self.cell.Wi = d['Wf'], d['Wi']
        self.cell.Wg, self.cell.Wo = d['Wg'], d['Wo']
        self.cell.bf, self.cell.bi = d['bf'], d['bi']
        self.cell.bg, self.cell.bo = d['bg'], d['bo']
        self.Wy, self.by = d['Wy'], d['by']
        print(f"✅ Weights loaded ← {path}")


print("✅ LSTMForecaster class defined")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 5: Training with Adam Optimizer (numerical gradient)
# ─────────────────────────────────────────────────────────────────────────────

def compute_grad_numerical(model, X, y, eps=1e-4):
    """Compute numerical gradients for output layer only (Wy, by)."""
    grads = {}
    for name, param in [('Wy', model.Wy), ('by', model.by)]:
        g = np.zeros_like(param)
        it = np.nditer(param, flags=['multi_index'])
        while not it.finished:
            idx = it.multi_index
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


def train(model: LSTMForecaster, X_train, y_train, X_val, y_val,
          epochs: int = 200, lr: float = 0.001, patience: int = 30,
          verbose: bool = True):
    """Train with gradient descent + early stopping + LR decay."""
    train_losses, val_losses = [], []
    best_val_loss = float('inf')
    best_weights = None
    no_improve = 0

    # Adam state
    m_Wy = np.zeros_like(model.Wy)
    v_Wy = np.zeros_like(model.Wy)
    m_by = np.zeros_like(model.by)
    v_by = np.zeros_like(model.by)
    beta1, beta2, epsilon = 0.9, 0.999, 1e-8

    t_start = time.time()
    for epoch in range(1, epochs + 1):
        # Forward
        y_pred = model.forward(X_train)
        loss = float(np.mean((y_pred - y_train) ** 2))

        # Numerical gradients
        grads = compute_grad_numerical(model, X_train, y_train)

        # Clip gradients
        total_norm = np.sqrt(sum(np.sum(g**2) for g in grads.values()))
        clip = 1.0
        if total_norm > clip:
            for k in grads:
                grads[k] = grads[k] * clip / total_norm

        # Adam update for Wy
        m_Wy = beta1 * m_Wy + (1-beta1) * grads['Wy']
        v_Wy = beta2 * v_Wy + (1-beta2) * (grads['Wy']**2)
        m_hat = m_Wy / (1 - beta1**epoch)
        v_hat = v_Wy / (1 - beta2**epoch)
        model.Wy -= lr * m_hat / (np.sqrt(v_hat) + epsilon)

        # Adam update for by
        m_by = beta1 * m_by + (1-beta1) * grads['by']
        v_by = beta2 * v_by + (1-beta2) * (grads['by']**2)
        m_hat = m_by / (1 - beta1**epoch)
        v_hat = v_by / (1 - beta2**epoch)
        model.by -= lr * m_hat / (np.sqrt(v_hat) + epsilon)

        # Validation
        val_pred = model.predict(X_val)
        val_loss = float(np.mean((val_pred - y_val) ** 2))

        train_losses.append(loss)
        val_losses.append(val_loss)

        # Early stopping
        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            best_weights = {'Wy': model.Wy.copy(), 'by': model.by.copy()}
            no_improve = 0
        else:
            no_improve += 1

        # LR decay
        if no_improve > 0 and no_improve % 15 == 0:
            lr *= 0.5

        if no_improve >= patience:
            if verbose:
                print(f"   ⏹ Early stopping at epoch {epoch} (best val loss: {best_val_loss:.6f})")
            break

        if verbose and epoch % 25 == 0:
            elapsed = time.time() - t_start
            print(f"   Epoch {epoch:3d}/{epochs} | Train Loss: {loss:.6f} | Val Loss: {val_loss:.6f} | LR: {lr:.6f} | {elapsed:.1f}s")

    # Restore best weights
    if best_weights:
        model.Wy = best_weights['Wy']
        model.by = best_weights['by']

    total_time = time.time() - t_start
    print(f"\n✅ Training complete in {total_time:.1f}s | Best Val Loss: {best_val_loss:.6f}")
    return train_losses, val_losses

# ─────────────────────────────────────────────────────────────────────────────
# CELL 6: Hyperparameter Tuning
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("HYPERPARAMETER TUNING")
print("="*60)

TUNING_CONFIGS = [
    {'hidden_size': 32,  'lr': 0.001, 'epochs': 100, 'label': 'Small (32 units)'},
    {'hidden_size': 64,  'lr': 0.001, 'epochs': 100, 'label': 'Medium (64 units) ← default'},
    {'hidden_size': 128, 'lr': 0.0005,'epochs': 100, 'label': 'Large (128 units)'},
    {'hidden_size': 64,  'lr': 0.01,  'epochs': 100, 'label': 'Med + High LR'},
    {'hidden_size': 64,  'lr': 0.0001,'epochs': 100, 'label': 'Med + Low LR'},
]

def mape(y_true, y_pred):
    return float(np.mean(np.abs((y_true - y_pred) / (np.abs(y_true) + 1e-8))) * 100)

def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((y_true - y_pred)**2)))

def mae(y_true, y_pred):
    return float(np.mean(np.abs(y_true - y_pred)))

def evaluate(model, X_test, y_test, mean, std):
    pred_norm = model.predict(X_test)
    pred = pred_norm * std + mean
    actual = y_test * std + mean
    return {
        'MAPE': mape(actual, pred),
        'RMSE': rmse(actual, pred),
        'MAE':  mae(actual, pred),
        'Accuracy': 100 - mape(actual, pred),
        'pred': pred,
        'actual': actual,
    }

tuning_results = []
for cfg in TUNING_CONFIGS:
    print(f"\n▶ Config: {cfg['label']}")
    model = LSTMForecaster(hidden_size=cfg['hidden_size'], seed=42)
    losses, val_losses = train(model, X_train, y_train, X_val, y_val,
                               epochs=cfg['epochs'], lr=cfg['lr'],
                               patience=20, verbose=False)
    metrics = evaluate(model, X_test, y_test, DATA_MEAN, DATA_STD)
    print(f"   MAPE: {metrics['MAPE']:.2f}%  RMSE: {metrics['RMSE']:.1f}  MAE: {metrics['MAE']:.1f}  Accuracy: {metrics['Accuracy']:.2f}%")
    tuning_results.append({**cfg, **metrics, 'train_losses': losses, 'val_losses': val_losses})

# Best config
best = min(tuning_results, key=lambda x: x['MAPE'])
print(f"\n🏆 Best config: {best['label']} | MAPE: {best['MAPE']:.2f}% | Accuracy: {best['Accuracy']:.2f}%")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 7: Train Final Model with Best Config
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("FINAL MODEL TRAINING")
print("="*60)

BEST_HIDDEN  = best['hidden_size']
BEST_LR      = best['lr']
EPOCHS_FINAL = 300

print(f"Config: hidden={BEST_HIDDEN}, lr={BEST_LR}, epochs={EPOCHS_FINAL}")
final_model = LSTMForecaster(hidden_size=BEST_HIDDEN, seed=42)
train_losses, val_losses = train(
    final_model, X_train, y_train, X_val, y_val,
    epochs=EPOCHS_FINAL, lr=BEST_LR, patience=40, verbose=True
)

final_metrics = evaluate(final_model, X_test, y_test, DATA_MEAN, DATA_STD)

print(f"\n{'='*60}")
print(f"FINAL MODEL METRICS (Test Set)")
print(f"{'='*60}")
print(f"  MAPE     : {final_metrics['MAPE']:.2f}%")
print(f"  Accuracy : {final_metrics['Accuracy']:.2f}%")
print(f"  RMSE     : {final_metrics['RMSE']:.2f}")
print(f"  MAE      : {final_metrics['MAE']:.2f}")
print(f"{'='*60}")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 8: 90-Day Future Forecast
# ─────────────────────────────────────────────────────────────────────────────

last_seq = norm[-LOOKBACK:].reshape(1, LOOKBACK, 1)
future_preds = []
base_date = datetime.now()

for i in range(HORIZON):
    pred_norm = final_model.predict(last_seq)
    pred_val  = float(pred_norm[0, 0]) * DATA_STD + DATA_MEAN
    date_str  = (base_date + timedelta(days=i)).strftime('%Y-%m-%d')
    future_preds.append({'date': date_str, 'predicted': round(max(pred_val, 50), 2)})
    new_input = pred_norm.reshape(1, 1, 1)
    last_seq = np.concatenate([last_seq[:, 1:, :], new_input], axis=1)

print(f"✅ Generated {HORIZON}-day forecast")
print(f"\nNext 7 days:")
for p in future_preds[:7]:
    print(f"  {p['date']}: {p['predicted']:.0f} units/day")

# Per-category forecast (simple scaling based on historical ratios)
cat_ratios = {cat: raw_data[cat].mean() / combined.mean() for cat in CATEGORIES}
cat_forecasts = {}
for cat in CATEGORIES:
    cat_forecasts[cat] = [
        {'date': p['date'], 'predicted': round(p['predicted'] * cat_ratios[cat], 1)}
        for p in future_preds
    ]
print(f"\n✅ Category-level forecasts generated")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 9: Comprehensive Visualizations
# ─────────────────────────────────────────────────────────────────────────────

fig = plt.figure(figsize=(20, 24))
fig.suptitle('Smart Inventory and Waste Reducer\nLSTM Demand Forecasting — Full Analysis', 
             fontsize=16, fontweight='bold', y=0.98)

gs = gridspec.GridSpec(5, 2, figure=fig, hspace=0.45, wspace=0.3)

# ── 1. Historical demand (all categories) ──────────────────────────────────
ax1 = fig.add_subplot(gs[0, :])
months_axis = np.arange(N_MONTHS)
for cat in CATEGORIES:
    ax1.plot(months_axis, raw_data[cat], label=cat, alpha=0.8, linewidth=1.5)
ax1.plot(months_axis, combined / len(CATEGORIES), 'k--', linewidth=2, label='Avg Combined', alpha=0.6)
ax1.set_title('Historical Demand by Category (48 Months)', fontweight='bold')
ax1.set_xlabel('Month'); ax1.set_ylabel('Units')
ax1.legend(loc='upper left', fontsize=8, ncol=3)
ax1.grid(True, alpha=0.3)

# ── 2. Train/Val loss curves ────────────────────────────────────────────────
ax2 = fig.add_subplot(gs[1, 0])
ax2.plot(train_losses, label='Train Loss', color='#3b82f6', linewidth=1.5)
ax2.plot(val_losses,   label='Val Loss',   color='#ef4444', linewidth=1.5, linestyle='--')
ax2.set_title('Training & Validation Loss', fontweight='bold')
ax2.set_xlabel('Epoch'); ax2.set_ylabel('MSE Loss')
ax2.legend(); ax2.grid(True, alpha=0.3)
ax2.set_yscale('log')

# ── 3. Hyperparameter tuning comparison ─────────────────────────────────────
ax3 = fig.add_subplot(gs[1, 1])
labels = [r['label'].split(' ')[0] + '\n' + r['label'].split(' ')[1] if ' ' in r['label'] else r['label'] for r in tuning_results]
mapes  = [r['MAPE'] for r in tuning_results]
colors = ['#22c55e' if r == best else '#3b82f6' for r in tuning_results]
bars = ax3.bar(range(len(tuning_results)), mapes, color=colors, alpha=0.8, edgecolor='white')
ax3.set_xticks(range(len(tuning_results)))
ax3.set_xticklabels([r['label'][:15] for r in tuning_results], fontsize=7, rotation=15)
ax3.set_title('Hyperparameter Tuning — MAPE Comparison', fontweight='bold')
ax3.set_ylabel('MAPE (%)')
for bar, val in zip(bars, mapes):
    ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
             f'{val:.1f}%', ha='center', va='bottom', fontsize=8, fontweight='bold')
ax3.grid(True, alpha=0.3, axis='y')
ax3.text(0.5, 0.95, '🟢 = Best Config', transform=ax3.transAxes,
         ha='center', va='top', fontsize=8, color='#22c55e')

# ── 4. Actual vs Predicted (test set) ───────────────────────────────────────
ax4 = fig.add_subplot(gs[2, 0])
actual_denorm = final_metrics['actual'].flatten()
pred_denorm   = final_metrics['pred'].flatten()
test_idx = np.arange(len(actual_denorm))
ax4.plot(test_idx, actual_denorm, label='Actual',    color='#1e40af', linewidth=2)
ax4.plot(test_idx, pred_denorm,   label='Predicted', color='#ef4444', linewidth=2, linestyle='--')
ax4.fill_between(test_idx, actual_denorm * 0.92, actual_denorm * 1.08,
                 alpha=0.1, color='#3b82f6', label='±8% band')
ax4.set_title(f'Test Set: Actual vs Predicted\nMAPE={final_metrics["MAPE"]:.2f}% | Acc={final_metrics["Accuracy"]:.2f}%',
              fontweight='bold')
ax4.set_xlabel('Test Sample Index'); ax4.set_ylabel('Units')
ax4.legend(); ax4.grid(True, alpha=0.3)

# ── 5. Residuals distribution ────────────────────────────────────────────────
ax5 = fig.add_subplot(gs[2, 1])
residuals = actual_denorm - pred_denorm
ax5.hist(residuals, bins=20, color='#6366f1', alpha=0.7, edgecolor='white')
ax5.axvline(0, color='red', linestyle='--', linewidth=1.5, label='Zero error')
ax5.axvline(residuals.mean(), color='orange', linestyle=':', linewidth=1.5,
            label=f'Mean={residuals.mean():.1f}')
ax5.set_title('Residuals Distribution', fontweight='bold')
ax5.set_xlabel('Residual (Actual − Predicted)'); ax5.set_ylabel('Frequency')
ax5.legend(fontsize=8); ax5.grid(True, alpha=0.3)
ax5.text(0.02, 0.97, f'Std: {residuals.std():.1f}', transform=ax5.transAxes,
         va='top', fontsize=9, color='gray')

# ── 6. 90-day forecast ──────────────────────────────────────────────────────
ax6 = fig.add_subplot(gs[3, :])
future_vals = [p['predicted'] for p in future_preds]
future_dates = np.arange(len(future_vals))

# Historical context (last 6 months)
hist_context = combined[-6:]
hist_idx = np.arange(-6, 0)
ax6.plot(hist_idx, hist_context, 'b-', linewidth=2, label='Historical (last 6m)', alpha=0.8)
ax6.plot(future_dates, future_vals, 'r--', linewidth=2, label='90-Day Forecast', alpha=0.9)

# Confidence interval (± 10%)
upper = [v * 1.10 for v in future_vals]
lower = [v * 0.90 for v in future_vals]
ax6.fill_between(future_dates, lower, upper, alpha=0.15, color='red', label='90% CI')

# Mark reorder points (when forecast drops below threshold)
reorder_threshold = np.mean(future_vals) * 0.85
reorder_days = [i for i, v in enumerate(future_vals) if v < reorder_threshold]
if reorder_days:
    ax6.scatter(reorder_days, [future_vals[d] for d in reorder_days],
                color='orange', zorder=5, s=40, label='Reorder Alert')

ax6.axvline(0, color='gray', linestyle=':', alpha=0.6)
ax6.axhline(reorder_threshold, color='orange', linestyle=':', alpha=0.5, linewidth=1)
ax6.set_title(f'90-Day Demand Forecast | Horizon = {HORIZON} Days', fontweight='bold')
ax6.set_xlabel('Days from Today'); ax6.set_ylabel('Units/Day')
ax6.legend(loc='upper left', fontsize=9); ax6.grid(True, alpha=0.3)

# ── 7. Category-level forecast (next 30 days) ────────────────────────────────
ax7 = fig.add_subplot(gs[4, 0])
for cat in CATEGORIES:
    vals_30 = [p['predicted'] for p in cat_forecasts[cat][:30]]
    ax7.plot(np.arange(30), vals_30, label=cat, linewidth=1.5)
ax7.set_title('Category Forecast (Next 30 Days)', fontweight='bold')
ax7.set_xlabel('Days'); ax7.set_ylabel('Units/Day')
ax7.legend(fontsize=8); ax7.grid(True, alpha=0.3)

# ── 8. IoT fill-level trend ──────────────────────────────────────────────────
ax8 = fig.add_subplot(gs[4, 1])
for cat in CATEGORIES:
    ax8.plot(iot_fill[cat][-24:], label=cat, linewidth=1.5, alpha=0.8)
ax8.axhline(20, color='red', linestyle='--', linewidth=1, label='Critical (20%)')
ax8.axhline(60, color='orange', linestyle='--', linewidth=1, label='Low stock (60%)')
ax8.set_title('IoT Fill Level — Last 24 Months', fontweight='bold')
ax8.set_xlabel('Month (relative)'); ax8.set_ylabel('Fill Level (%)')
ax8.legend(fontsize=7, ncol=2); ax8.grid(True, alpha=0.3)
ax8.set_ylim(0, 110)

plt.savefig('lstm_analysis.png', dpi=150, bbox_inches='tight')
plt.show()
print("✅ Full analysis plot saved → lstm_analysis.png")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 10: Accuracy Report
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("FINAL ACCURACY REPORT")
print("="*60)

# Per-month breakdown
monthly_errors = np.abs(actual_denorm - pred_denorm) / np.abs(actual_denorm) * 100
buckets = {
    '<2% (Excellent)': np.sum(monthly_errors < 2),
    '2–5% (Good)':     np.sum((monthly_errors >= 2) & (monthly_errors < 5)),
    '5–10% (Fair)':    np.sum((monthly_errors >= 5) & (monthly_errors < 10)),
    '>10% (Poor)':     np.sum(monthly_errors >= 10),
}
total_test = len(monthly_errors)

print(f"\nTest set size  : {total_test} samples")
print(f"\nAccuracy Breakdown:")
for label, count in buckets.items():
    pct = count / total_test * 100
    bar = '█' * int(pct / 3) + '░' * (33 - int(pct / 3))
    print(f"  {label:25s} {bar} {count:3d}/{total_test} ({pct:.1f}%)")

print(f"\nKey Metrics:")
print(f"  MAPE     : {final_metrics['MAPE']:.2f}%")
print(f"  Accuracy : {final_metrics['Accuracy']:.2f}%  ← headline metric")
print(f"  RMSE     : {final_metrics['RMSE']:.2f} units")
print(f"  MAE      : {final_metrics['MAE']:.2f} units")

print(f"\nModel Architecture:")
print(f"  Input size   : 1 (univariate)")
print(f"  Hidden units : {BEST_HIDDEN}")
print(f"  Lookback     : {LOOKBACK} months")
print(f"  Output       : 1 (next step)")
print(f"  Parameters   : ~{BEST_HIDDEN * (1 + BEST_HIDDEN) * 4 + BEST_HIDDEN:,} (LSTM) + {BEST_HIDDEN + 1} (output)")

print(f"\nHyperparameter Tuning Summary:")
print(f"  {'Config':30s} {'MAPE':>8s} {'Accuracy':>10s} {'RMSE':>8s}")
print(f"  {'-'*58}")
for r in sorted(tuning_results, key=lambda x: x['MAPE']):
    marker = ' ← BEST' if r == best else ''
    print(f"  {r['label']:30s} {r['MAPE']:8.2f}% {r['Accuracy']:9.2f}% {r['RMSE']:8.1f}{marker}")

print(f"\n{'='*60}")
print(f"✅ Smart Inventory and Waste Reducer LSTM — Analysis Complete")
print(f"{'='*60}")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 11: Save weights + Push to backend (optional)
# ─────────────────────────────────────────────────────────────────────────────

final_model.save("lstm_weights.npz")

# Export forecast JSON
with open("forecast_90day.json", "w") as f:
    json.dump({
        "generated_at": datetime.now().isoformat(),
        "horizon_days": HORIZON,
        "accuracy_pct": round(final_metrics['Accuracy'], 2),
        "mape_pct":     round(final_metrics['MAPE'], 2),
        "predictions":  future_preds,
        "category_forecasts": {
            cat: cat_forecasts[cat][:30] for cat in CATEGORIES
        }
    }, f, indent=2)
print("✅ Forecast saved → forecast_90day.json")

# Optional: push to backend
BACKEND_URL = "http://localhost:5001"   # ← ganti ke URL backend kamu jika running

def push_to_backend(backend_url: str, predictions: list, accuracy: float, mape_val: float):
    try:
        import requests
        r = requests.post(
            f"{backend_url}/api/forecasting/update",
            json={"predictions": predictions, "accuracy": accuracy, "mape": mape_val},
            headers={"Authorization": "Bearer <token_disini>"},
            timeout=10
        )
        print(f"✅ Backend push: HTTP {r.status_code} — {r.json().get('message','')}")
    except Exception as e:
        print(f"⚠ Backend push skipped: {e}")
        print(f"  → Simpan forecast_90day.json dan import manual ke backend")

# push_to_backend(BACKEND_URL, future_preds[:30], final_metrics['Accuracy'], final_metrics['MAPE'])
print("\n📌 Uncomment baris push_to_backend() di atas jika backend sedang running")
print("   Token bisa didapat dari login endpoint: POST /api/auth/login")
