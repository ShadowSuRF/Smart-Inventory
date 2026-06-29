import numpy as np
import requests
import json
from datetime import datetime

BACKEND_URL = "http://localhost:5001"
LOOKBACK = 12
HIDDEN_SIZE = 64
LEARNING_RATE = 0.001
EPOCHS = 200
HORIZON = 90

np.random.seed(42)

def generate_demand_data(n_months: int = 36) -> np.ndarray:

    t = np.arange(n_months)
    trend = 3000 + 100 * t
    seasonal = 500 * np.sin(2 * np.pi * t / 12)
    noise = np.random.normal(0, 150, n_months)
    return trend + seasonal + noise

def zscore_normalize(data: np.ndarray):
    mean, std = data.mean(), data.std()
    return (data - mean) / (std + 1e-8), mean, std

def create_sequences(data: np.ndarray, lookback: int):
    X, y = [], []
    for i in range(len(data) - lookback):
        X.append(data[i:i + lookback])
        y.append(data[i + lookback])
    return np.array(X).reshape(-1, lookback, 1), np.array(y).reshape(-1, 1)

class LSTMCell:
    def __init__(self, input_size: int, hidden_size: int):
        scale = 0.1
        concat = input_size + hidden_size
        self.Wf = np.random.randn(concat, hidden_size) * scale
        self.Wi = np.random.randn(concat, hidden_size) * scale
        self.Wg = np.random.randn(concat, hidden_size) * scale
        self.Wo = np.random.randn(concat, hidden_size) * scale
        self.bf = np.zeros((1, hidden_size))
        self.bi = np.zeros((1, hidden_size))
        self.bg = np.zeros((1, hidden_size))
        self.bo = np.zeros((1, hidden_size))
        self.h = np.zeros((1, hidden_size))
        self.c = np.zeros((1, hidden_size))
        self._cache = []

    @staticmethod
    def sigmoid(x): return 1 / (1 + np.exp(-np.clip(x, -10, 10)))

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

    def reset(self):
        self.h = np.zeros_like(self.h)
        self.c = np.zeros_like(self.c)
        self._cache = []

class LSTMForecaster:
    def __init__(self, input_size: int = 1, hidden_size: int = HIDDEN_SIZE):
        self.cell = LSTMCell(input_size, hidden_size)
        self.Wy = np.random.randn(hidden_size, 1) * 0.1
        self.by = np.zeros((1, 1))
        self.hidden_size = hidden_size

    def forward(self, X: np.ndarray) -> np.ndarray:

        batch = X.shape[0]
        self.cell.reset()
        self.cell.h = np.zeros((batch, self.hidden_size))
        self.cell.c = np.zeros((batch, self.hidden_size))
        for t in range(X.shape[1]):
            h = self.cell.forward(X[:, t, :])
        return h @ self.Wy + self.by

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.forward(X)

    def save(self, path: str = "lstm_weights.npz"):
        np.savez(path,
            Wf=self.cell.Wf, Wi=self.cell.Wi, Wg=self.cell.Wg, Wo=self.cell.Wo,
            bf=self.cell.bf, bi=self.cell.bi, bg=self.cell.bg, bo=self.cell.bo,
            Wy=self.Wy, by=self.by)
        print(f"[LSTM] Weights saved to {path}")

    def load(self, path: str = "lstm_weights.npz"):
        d = np.load(path)
        self.cell.Wf, self.cell.Wi = d['Wf'], d['Wi']
        self.cell.Wg, self.cell.Wo = d['Wg'], d['Wo']
        self.cell.bf, self.cell.bi = d['bf'], d['bi']
        self.cell.bg, self.cell.bo = d['bg'], d['bo']
        self.Wy, self.by = d['Wy'], d['by']
        print(f"[LSTM] Weights loaded from {path}")

def train(model: LSTMForecaster, X_train: np.ndarray, y_train: np.ndarray,
          X_val: np.ndarray, y_val: np.ndarray) -> list:
    losses = []
    lr = LEARNING_RATE

    for epoch in range(EPOCHS):

        y_pred = model.forward(X_train)
        loss = float(np.mean((y_pred - y_train) ** 2))

        eps = 1e-5
        params = [model.Wy, model.by]
        grads = []
        for p in params:
            g = np.zeros_like(p)
            it = np.nditer(p, flags=['multi_index'])
            while not it.finished:
                idx = it.multi_index
                orig = p[idx]
                p[idx] = orig + eps
                loss_plus = float(np.mean((model.forward(X_train) - y_train) ** 2))
                p[idx] = orig - eps
                loss_minus = float(np.mean((model.forward(X_train) - y_train) ** 2))
                p[idx] = orig
                g[idx] = (loss_plus - loss_minus) / (2 * eps)
                it.iternext()
            grads.append(g)

        total_norm = np.sqrt(sum(np.sum(g**2) for g in grads))
        if total_norm > 1.0:
            grads = [g / total_norm for g in grads]

        for p, g in zip(params, grads):
            p -= lr * g

        losses.append(loss)
        if (epoch + 1) % 20 == 0:
            val_pred = model.predict(X_val)
            val_mse = float(np.mean((val_pred - y_val) ** 2))
            print(f"Epoch {epoch+1}/{EPOCHS} | Train Loss: {loss:.4f} | Val Loss: {val_mse:.4f}")

    return losses

def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs((y_true - y_pred) / (np.abs(y_true) + 1e-8))) * 100)

def push_predictions(predictions: list, accuracy: float, mape_val: float):
    try:
        # Login dulu untuk dapat token
        login = requests.post(
            f"{BACKEND_URL}/api/auth/login",
            json={"email": "admin@smartinventory.com", "password": "admin123"},
            timeout=10
        )
        token = login.json()["data"]["token"]

        r = requests.post(
            f"{BACKEND_URL}/api/forecasting/update",
            json={"predictions": predictions, "accuracy": accuracy, "mape": mape_val},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            },
            timeout=10
        )
        print(f"[API] Push response: {r.status_code} — {r.json().get('message', '')}")
    except Exception as e:
        print(f"[API] Failed to push: {e}")

def main():
    print("=" * 60)
    print("Smart Inventory and Waste Reducer — LSTM Forecaster")
    print("=" * 60)

    raw = generate_demand_data(48)
    norm, mean, std = zscore_normalize(raw)
    X, y = create_sequences(norm, LOOKBACK)

    n = len(X)
    t1, t2 = int(n * 0.70), int(n * 0.85)
    X_train, y_train = X[:t1], y[:t1]
    X_val, y_val = X[t1:t2], y[t1:t2]
    X_test, y_test = X[t2:], y[t2:]

    print(f"Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

    model = LSTMForecaster(input_size=1, hidden_size=HIDDEN_SIZE)
    print(f"\nTraining LSTM ({HIDDEN_SIZE} units, {EPOCHS} epochs)…")
    losses = train(model, X_train, y_train, X_val, y_val)

    y_pred_norm = model.predict(X_test)
    y_pred = y_pred_norm * std + mean
    y_actual = y_test * std + mean
    test_mape = mape(y_actual, y_pred)
    accuracy = 100 - test_mape

    print(f"\n{'='*60}")
    print(f"Test MAPE : {test_mape:.2f}%")
    print(f"Accuracy  : {accuracy:.2f}%")
    print(f"{'='*60}")

    last_seq = norm[-LOOKBACK:].reshape(1, LOOKBACK, 1)
    future = []
    from datetime import datetime, timedelta
    base = datetime.now()
    for i in range(HORIZON):
        pred_norm = model.predict(last_seq)
        pred_val = float(pred_norm[0, 0]) * std + mean
        date = (base + timedelta(days=i)).strftime('%Y-%m-%d')
        future.append({'date': date, 'predicted': round(pred_val, 2)})

        new_input = pred_norm.reshape(1, 1, 1)
        last_seq = np.concatenate([last_seq[:, 1:, :], new_input], axis=1)

    print(f"\nGenerated {HORIZON}-day forecast (first 5 days):")
    for f in future[:5]:
        print(f"  {f['date']}: {f['predicted']:.0f} units")

    model.save("lstm_weights.npz")

    push_predictions(future[:30], round(accuracy, 2), round(test_mape, 2))
    print("\nDone!")

if __name__ == "__main__":
    main()
