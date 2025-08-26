# Sistema Controllo Terrario & Serra 🌱🐢

Applicazione full-stack per la gestione automatizzata di serra e terrario con controllo manuale e scene personalizzabili.

## 🚀 Funzionalità

- **Kill Switch Globale** - Arresto di emergenza di tutti i dispositivi
- **Controllo Zone Separate** - Serra e Terrario con gestione indipendente
- **Modalità Manuale** - Controllo diretto delle prese intelligenti
- **Scene Personalizzabili** - Automazioni basate su temperatura e umidità
- **Integrazione Tuya** - Controllo prese intelligenti Antela
- **Sensori Nous E6** - Monitoraggio temperatura e umidità in tempo reale

## 🏗️ Architettura

### Backend (FastAPI)
- **Database**: SQLite per sviluppo, PostgreSQL per produzione
- **API REST** con documentazione automatica OpenAPI/Swagger
- **Provider Tuya** per controllo dispositivi smart
- **Provider Nous E6** per lettura sensori
- **Sistema di sicurezza** con kill switch middleware

### Frontend (React + TypeScript)
- **UI moderna** con Tailwind CSS
- **Componenti reattivi** per controllo dispositivi
- **Dashboard real-time** con dati sensori
- **Gestione stato** con React hooks

## 🛠️ Setup Sviluppo

### Prerequisiti
- Python 3.12+
- Node.js 18+
- Poetry (per gestione dipendenze Python)

### Backend Setup
```bash
cd terrario-serra-backend
poetry install
cp .env.example .env
# Configura le credenziali Tuya nel file .env
poetry run python app/init_db.py
poetry run uvicorn app.main:app --reload --port 8001
```

### Frontend Setup
```bash
cd terrario-serra-frontend
npm install
npm run dev
```

## 🔧 Configurazione

### Variabili Ambiente Backend (.env)
```env
# Database
DATABASE_URL=sqlite:///./terrario_serra.db

# Tuya Integration
TUYA_ACCESS_KEY=your-tuya-access-key
TUYA_SECRET_KEY=your-tuya-secret-key
TUYA_REGION=eu

# Security
SECRET_KEY=your-secret-key
```

### Variabili Ambiente Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:8001
```

## 📱 Utilizzo

1. **Avvia Backend**: `poetry run uvicorn app.main:app --reload --port 8001`
2. **Avvia Frontend**: `npm run dev`
3. **Accedi all'app**: http://localhost:5173

### Interfaccia Utente

- **Kill Switch**: Arresto di emergenza globale
- **Tab Manuale**: Controllo diretto prese per zona
- **Tab Mapping**: Creazione e modifica scene personalizzate
- **Tab Automatico**: Attivazione scene automatiche

## 🔌 Dispositivi Supportati

### Prese Intelligenti Tuya
- **Antela Smart Power Strip** (2A + 1C)
- 4 prese AC + 1 porta USB
- Controllo individuale e di gruppo
- Monitoraggio consumi energetici

### Sensori Ambientali
- **Nous E6** - Temperatura e Umidità
- Un sensore per serra, uno per terrario
- Letture in tempo reale
- Storico dati per analisi

## 🗄️ Database Schema

- **zones** - Zone di controllo (Serra/Terrario)
- **devices** - Dispositivi fisici (prese, sensori)
- **outlets** - Singole prese controllabili
- **sensors** - Sensori ambientali
- **readings** - Letture sensori storiche
- **scenes** - Scene personalizzate
- **scene_rules** - Regole automazione
- **overrides** - Override manuali temporanei

## 🚀 Deploy Produzione

### Render.com
```yaml
# render.yaml
services:
  - type: web
    name: terrario-serra-backend
    env: python
    buildCommand: poetry install
    startCommand: poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT
  
  - type: web
    name: terrario-serra-frontend
    env: static
    buildCommand: npm run build
    staticPublishPath: ./dist
```

## 🔒 Sicurezza

- **Kill Switch Middleware** - Blocca tutte le operazioni quando attivo
- **Validazione Input** - Sanitizzazione dati in ingresso
- **Rate Limiting** - Protezione contro abusi API
- **Audit Logging** - Tracciamento operazioni critiche

## 🧪 Testing

```bash
# Backend tests
cd terrario-serra-backend
poetry run pytest

# Frontend tests
cd terrario-serra-frontend
npm run test
```

## 📚 API Documentation

Una volta avviato il backend, la documentazione API è disponibile su:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

## 🤝 Contribuire

1. Fork del repository
2. Crea branch feature (`git checkout -b feature/nuova-funzionalita`)
3. Commit modifiche (`git commit -am 'Aggiunge nuova funzionalità'`)
4. Push branch (`git push origin feature/nuova-funzionalita`)
5. Crea Pull Request

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per dettagli.

## 🆘 Supporto

Per problemi o domande:
- Apri una Issue su GitHub
- Consulta la documentazione API
- Verifica i log dell'applicazione

---

**Sviluppato con ❤️ per il controllo intelligente di serra e terrario**

<!-- Dummy comment added to verify repository access and lint functionality -->
