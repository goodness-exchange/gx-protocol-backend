import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Configuration Schema
// ============================================================================

interface CredentialsSchema {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  adminId?: string;
  username?: string;
  role?: string;
  mfaVerified?: boolean;
}

interface ConfigSchema {
  apiUrl: string;
  credentials?: CredentialsSchema;
}

// ============================================================================
// Config Store (Simple JSON file-based)
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.gx-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure config directory exists
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
}

// Default config
const DEFAULT_CONFIG: ConfigSchema = {
  apiUrl: 'https://api.gxcoin.money',
};

// Load config from file
function loadConfig(): ConfigSchema {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<ConfigSchema>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Save config to file
function saveConfig(config: ConfigSchema): void {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// ============================================================================
// API URL Functions
// ============================================================================

export function getApiUrl(): string {
  return loadConfig().apiUrl;
}

export function setApiUrl(url: string): void {
  const config = loadConfig();
  config.apiUrl = url;
  saveConfig(config);
}

// ============================================================================
// Credentials Functions
// ============================================================================

export function getCredentials(): CredentialsSchema | undefined {
  return loadConfig().credentials;
}

export function setCredentials(credentials: CredentialsSchema): void {
  const config = loadConfig();
  config.credentials = credentials;
  saveConfig(config);
}

export function clearCredentials(): void {
  const config = loadConfig();
  delete config.credentials;
  saveConfig(config);
}

export function isLoggedIn(): boolean {
  const creds = getCredentials();
  if (!creds?.accessToken) {
    return false;
  }
  // Check if token is expired
  if (creds.expiresAt && Date.now() > creds.expiresAt) {
    // Token expired, but we have refresh token handling
    return !!creds.refreshToken;
  }
  return true;
}

export function getAccessToken(): string | undefined {
  const creds = getCredentials();
  return creds?.accessToken;
}

export function getRefreshToken(): string | undefined {
  const creds = getCredentials();
  return creds?.refreshToken;
}

// ============================================================================
// Config Path
// ============================================================================

export function getConfigPath(): string {
  return CONFIG_FILE;
}
