# NeuroGuessr Backend - Complete Documentation

## 🏗️ **Architecture Overview**

NeuroGuessr is a neuroanatomy educational gaming platform built with **Express.js + TypeScript** backend, **PostgreSQL** database, and **Socket.IO** for real-time multiplayer functionality. The application provides brain atlas-based guessing games with multiple game modes and comprehensive user management.

---

## 📁 **Project Structure**

```
backend/
├── 📁 assets/              # Static assets and resources
├── 📁 interfaces/          # TypeScript type definitions
│   ├── config.interfaces.ts
│   ├── database.interfaces.ts
│   ├── multi.interfaces.ts
│   └── requests.interfaces.ts
├── 📁 middlewares/         # Express middleware functions
│   └── case-transformer.ts
├── 📁 modules/             # Core business logic modules
│   ├── advanced_game.ts    # Advanced game settings
│   ├── altcha.ts          # CAPTCHA verification
│   ├── backend-i18n.ts    # Internationalization
│   ├── config_user.ts     # User configuration
│   ├── database_init.ts   # Database setup & migration
│   ├── email.ts           # Email service
│   ├── game.ts            # Core game logic
│   ├── global_auth.ts     # Global authentication
│   ├── leaderboard.ts     # Leaderboard functionality
│   ├── logging.ts         # Winston logging configuration
│   ├── login.ts           # Authentication & JWT
│   ├── multi.ts           # Multiplayer game logic
│   ├── registration.ts    # User registration & verification
│   ├── socket.io.ts       # Socket.IO configuration
│   ├── stats.ts           # User statistics
│   └── utils.ts           # Utility functions
├── 📄 config.json         # Application configuration
├── 📄 package.json        # Node.js dependencies
├── 📄 server.tsx          # Main Express server
└── 📄 tsconfig.json       # TypeScript configuration
```

---

## ⚙️ **Configuration Management**

### **config.json Structure**
```json
{
  "email": {
    "type": "none",           // Email service type (none|smtp|oauth)
    "server": "",             // SMTP server
    "port": 465,              // SMTP port
    "mail_address": "",       // Sender email
    "mail_password": "",      // Email password
    "clientId": "",           // OAuth client ID
    "clientSecret": "",       // OAuth client secret
    "redirectPath": "",       // OAuth redirect path
    "scope": "https://mail.google.com/"
  },
  "server": {
    "mode": "http",           // http|https
    "port": 3000,             // Server port
    "websocket_port": 3001,   // WebSocket port
    "external_address": "http://localhost:3000",
    "renderingMode": "ssg",   // ssr|ssg|csr
    "globalAuthentication": {
      "enabled": false,       // Global basic auth
      "username": "",
      "password": ""
    }
  },
  "captcha": {
    "activate": true,         // Enable CAPTCHA
    "siteKey": "",           // CAPTCHA site key
    "secretKey": "",         // CAPTCHA secret key
    "proxy": ""              // Proxy for CAPTCHA verification
  },
  "allowAnonymousInMultiplayer": true,
  "addTestUser": true,        // Add test user on startup
  "salt": "...",             // bcrypt salt
  "jwt_secret": "...",       // JWT signing secret
  "altcha_secret": "...",    // ALTCHA CAPTCHA secret
  "pgConnectionString": "postgres://user:pass@localhost:5432/neuroguessr"
}
```

---

## 🗄️ **Database Schema**

### **PostgreSQL Tables**

#### **`users` Table**

#### **`tokens` Table** (Email verification & password reset)

#### **`game_sessions` Table** (Active game sessions)

#### **`game_progress` Table** (Individual region attempts)

#### **`finished_sessions` Table** (Completed games for statistics)

#### **`multi_sessions` Table** (Multiplayer game sessions)

#### **`advanced_game_settings` Table** (Custom game configurations)

---

## 🔐 **Authentication & Security**

### **JWT Token System**
- **Algorithm**: HS256
- **Expiration**: 1 hour
- **Payload**:
  ```json
  {
    "username": "john_doe",
    "email": "john@example.com",
    "firstname": "John",
    "lastname": "Doe",
    "language": "en",
    "admin": false,
    "publishToLeaderboard": true,
    "id": 123,
    "iat": 1234567890,
    "exp": 1234571490
  }
  ```

### **Password Security**
- **Hashing**: bcrypt with configurable salt rounds
- **Password Complexity**: Enforced via `joi-password-complexity`
- **Storage**: Never stored in plain text

### **Rate Limiting**
```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 minutes
  max: 5,                      // 5 attempts per window
  message: 'Too many authentication attempts'
});
```

### **CAPTCHA Integration**
- **Service**: ALTCHA (alternative to reCAPTCHA)
- **Verification**: Server-side validation
- **Proxy Support**: Configurable proxy for external verification

---

## 🎮 **Game System Architecture**

### **Game Modes**

#### **1. Practice Mode**
- **Objective**: Learn brain regions without time pressure
- **Features**: 
  - Unlimited attempts per region
  - Highlighting after 3 failed attempts
  - No scoring system
  - Educational feedback

#### **2. Time Attack Mode**
- **Objective**: Score maximum points in limited time (100 seconds)
- **Scoring**: 
  - Base: 50 points per correct region
  - Penalty: Distance-based scoring for incorrect clicks
  - Bonus: Time remaining × 1 point per second
  - Blind Mode: 1.5× multiplier
- **Maximum Score**: 1,900 points (18 regions × 50 + 100 bonus)

#### **3. Streak Mode**
- **Objective**: Maintain longest correct streak
- **Features**:
  - Streak resets on incorrect answer > 50mm distance
  - Bonus: +5 points every 5 correct answers
  - Game ends after 3 consecutive far errors
  - Streak preservation for close mistakes

### **Atlas System**
The game supports multiple brain atlases loaded from NIfTI files

### **Brain Region Processing**

---

## 🌐 **Multiplayer System**

### **Real-Time Architecture**
- **Technology**: Socket.IO with WebSocket/polling fallback
- **Session Management**: In-memory game state with PostgreSQL persistence
- **Anonymous Support**: Configurable anonymous player participation

### **Multiplayer Game Flow**
1. **Lobby Creation**: Host creates session with custom parameters
2. **Player Joining**: Real-time lobby updates via Socket.IO
3. **Game Commands**: Structured command system for game progression
4. **Scoring System**: Real-time score updates and leaderboards
5. **Game Completion**: Final results and statistics

### **Game Commands Structure**
```typescript
interface GameCommand {
    action: "load-atlas" | "guess";
    atlas?: string;
    regionId?: number;
    duration: number;           // Command duration in seconds
    blindMode?: boolean;
}
```

---

## 📊 **Statistics & Analytics**

### **User Statistics**
- **Performance Metrics**: Average scores, best scores, completion times
- **Game Analysis**: Per-mode statistics, accuracy rates, quit reasons
- **Progress Tracking**: Historical performance trends
- **Atlas Usage**: Most played atlases and preferences

### **Leaderboard System**

---

## 🔌 **API Endpoints**

### **Authentication Endpoints**
```
POST /api/login                    # User login
POST /api/refresh-token            # JWT token refresh
GET  /api/user-info                # Get user profile
POST /api/register                 # User registration
POST /api/verify-email             # Email verification
POST /api/password-recovery        # Password reset request
POST /api/reset-password           # Password reset
```

### **Game Endpoints**
```
POST /api/start-game-session       # Initialize game session
POST /api/get-next-region          # Get next brain region
POST /api/validate-region          # Submit region guess
POST /api/cloture-game-session     # End game session
```

### **Statistics Endpoints**
```
POST /api/get-stats                # User statistics
POST /api/get-leaderboard          # Global leaderboard
POST /api/get-most-used-atlases    # Atlas usage statistics
```

### **Multiplayer Endpoints**
```
POST /api/create-multiplayer-session  # Create multiplayer lobby
GET  /api/multi/public-lobbies         # List public lobbies
```

### **Advanced Features**
```
POST /api/advanced-game/save           # Save custom game settings
POST /api/advanced-game/settings-list # List user's custom settings
GET  /api/advanced-game/check-name     # Validate setting name
```

---

## 🔧 **Middleware & Utilities**

### **Case Transformation Middleware**
Automatically converts between snake_case (database) and camelCase (frontend):
```typescript
app.use(transformResponseToCamelCase);
```

### **Global Authentication Middleware**
Optional basic HTTP authentication for entire application:

### **Enhanced Logging System**
Comprehensive logging with Winston featuring:
- **Structured Metadata**: User context, performance metrics, error classification
- **Security Audit Trail**: Authentication attempts, IP tracking
- **Performance Monitoring**: Request duration, database query times
- **Business Intelligence**: Game metrics, user behavior analytics

---

## 📧 **Email System**

### **Email Service Types**
- **None**: Disabled (development mode)
- **SMTP**: Direct SMTP server connection
- **OAuth**: Gmail OAuth2 integration

### **Email Templates**
- **Registration Verification**: Welcome email with verification link
- **Password Reset**: Secure password reset with time-limited tokens
- **Internationalization**: Multi-language support (EN/FR)

---

## 🌍 **Internationalization (i18n)**

### **Supported Languages**
- **French (fr)**: Default language
- **English (en)**: Secondary language

### **Backend i18n Features**
- **Email Templates**: Localized email content
- **Error Messages**: Translated validation errors
- **Dynamic Loading**: Runtime language switching

---

## ⚡ **Performance Optimizations**

### **Database Optimizations**
- **Connection Pooling**: PostgreSQL connection pool (max 20 connections)
- **Prepared Statements**: Optimized query execution
- **Indexed Queries**: Strategic database indexing
- **Cleanup Tasks**: Automated removal of expired tokens and old sessions

### **Memory Management**
- **In-Memory Game State**: Active multiplayer sessions cached in memory
- **Atlas Caching**: Pre-loaded brain atlas data for fast access
- **Token Cleanup**: Periodic cleanup of expired authentication tokens

### **Caching Strategy**
- **Static Assets**: Express static file serving with caching headers
- **Atlas Data**: Pre-processed brain atlas regions and centers
- **User Sessions**: Efficient session token validation

---

## 🚀 **Deployment Configuration**

### **Rendering Modes**
- **SSR (Server-Side Rendering)**: Dynamic page generation
- **SSG (Static Site Generation)**: Pre-built static pages
- **CSR (Client-Side Rendering)**: SPA mode

### **SSL/HTTPS Support**

### **Environment Configuration**
- **Development**: Local database, disabled email, test users
- **Production**: PostgreSQL, email service

---

## 🛡️ **Security Features**

### **Input Validation**
- **Joi Schemas**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries with `postgres` library
- **XSS Prevention**: Input sanitization and output encoding

### **Authentication Security**
- **JWT Secret**: Configurable signing secret
- **Token Expiration**: Short-lived tokens (1 hour)
- **Rate Limiting**: Login attempt throttling
- **Password Complexity**: Enforced strong passwords

### **Database Security**
- **User Permissions**: Least privilege database access
- **Connection Security**: Encrypted database connections
- **Data Validation**: Server-side validation for all inputs

---

## 📈 **Monitoring & Observability**

### **Comprehensive Logging**
- **Request Tracking**: HTTP request/response logging with timing
- **Authentication Events**: Login attempts, token refreshes, failures
- **Game Analytics**: Session starts, completions, performance metrics
- **Error Tracking**: Detailed error logs with stack traces
- **Security Events**: Failed authentication, suspicious activity

### **Health Monitoring**
- **Database Connectivity**: Connection pool monitoring
- **Memory Usage**: Game session memory tracking
- **Performance Metrics**: Response time tracking
- **Error Rates**: Failed request monitoring

---

## 🔄 **Data Flow Architecture**

### **Game Session Lifecycle**
1. **Authentication**: JWT token validation
2. **Session Creation**: Generate secure session token
3. **Atlas Loading**: Load brain atlas data
4. **Region Selection**: Random region assignment
5. **User Interaction**: Process click coordinates
6. **Validation**: Check against atlas voxel data
7. **Scoring**: Calculate points based on accuracy/timing
8. **Session Management**: Update progress, handle timeouts
9. **Completion**: Finalize session, save statistics

### **Multiplayer Data Flow**
1. **Lobby Creation**: Initialize multiplayer session
2. **Real-Time Communication**: Socket.IO event handling
3. **Game Synchronization**: Coordinated game state management
4. **Score Broadcasting**: Real-time score updates
5. **Result Aggregation**: Final scoring and rankings

---

## 🧪 **Development Features**

### **Test User System**

Automatically creates test user for development

### **Debug Configuration**
- **Database Debug**: SQL query logging
- **Request Logging**: Detailed HTTP request tracking
- **Error Stack Traces**: Full error context in development

---

## 🏁 **Getting Started**

### **Prerequisites**
- Node.js 22+
- PostgreSQL 10+

### **Installation**
```bash
# Install dependencies
npm install

# Setup database
createdb neuroguessr

# Configure application
cp config-example.json config.json
# Edit config.json with your settings

# Start development server
npm run dev
```
