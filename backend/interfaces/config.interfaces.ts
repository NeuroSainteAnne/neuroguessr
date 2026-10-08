export interface EmailConfig {
    type: string;
    server?: string;
    port?: number;
    mail_address: string;
    mail_password?: string;
    proxy?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    redirectPath?: string;
    scope?: string;
}

export interface GlobalAuthenticationConfig {
    enabled: boolean;
    username: string;
    password: string;
}

export interface ServerConfig {
    mode: string;
    port: number;
    websocket_port: number;
    external_address: string;
    serverKey: string;
    serverCert: string;
    globalAuthentication: GlobalAuthenticationConfig;
    renderingMode: string;
}

export interface CaptchaConfig {
    activate: boolean;
    siteKey: string;
    secretKey: string;
    proxy: string;
}

export interface Config {
    email: EmailConfig;
    server: ServerConfig;
    addTestUser: boolean;
    captcha: CaptchaConfig;
    allowAnonymousInMultiplayer: boolean;
    activateMultiplayerBot?: boolean;
    salt: string;
    jwt_secret: string;
    pgConnectionString: string;
    altcha_secret: string;
}

export function assertConfig(raw: unknown): asserts raw is Config {
    if (typeof raw !== 'object' || raw === null)
        throw new Error('config.json must be a JSON object');
    const c = raw as Record<string, unknown>;

    // Top-level primitives
    for (const key of ['salt', 'jwt_secret', 'pgConnectionString', 'altcha_secret'] as const) {
        if (typeof c[key] !== 'string' || !(c[key] as string))
            throw new Error(`config.json: "${key}" must be a non-empty string`);
    }
    for (const key of ['addTestUser', 'allowAnonymousInMultiplayer'] as const) {
        if (typeof c[key] !== 'boolean')
            throw new Error(`config.json: "${key}" must be a boolean`);
    }
    if (c.activateMultiplayerBot !== undefined && typeof c.activateMultiplayerBot !== 'boolean')
        throw new Error('config.json: "activateMultiplayerBot" must be a boolean if present');

    // server
    if (typeof c.server !== 'object' || c.server === null)
        throw new Error('config.json: "server" must be an object');
    const s = c.server as Record<string, unknown>;
    for (const key of ['mode', 'external_address', 'serverKey', 'serverCert', 'renderingMode'] as const) {
        if (typeof s[key] !== 'string')
            throw new Error(`config.json: "server.${key}" must be a string`);
    }
    for (const key of ['port', 'websocket_port'] as const) {
        if (typeof s[key] !== 'number')
            throw new Error(`config.json: "server.${key}" must be a number`);
    }
    if (typeof s.globalAuthentication !== 'object' || s.globalAuthentication === null)
        throw new Error('config.json: "server.globalAuthentication" must be an object');
    const ga = s.globalAuthentication as Record<string, unknown>;
    if (typeof ga.enabled !== 'boolean')
        throw new Error('config.json: "server.globalAuthentication.enabled" must be a boolean');
    if (typeof ga.username !== 'string')
        throw new Error('config.json: "server.globalAuthentication.username" must be a string');
    if (typeof ga.password !== 'string')
        throw new Error('config.json: "server.globalAuthentication.password" must be a string');

    // email
    if (typeof c.email !== 'object' || c.email === null)
        throw new Error('config.json: "email" must be an object');
    const e = c.email as Record<string, unknown>;
    if (typeof e.type !== 'string')
        throw new Error('config.json: "email.type" must be a string');
    if (typeof e.mail_address !== 'string')
        throw new Error('config.json: "email.mail_address" must be a string');

    // captcha
    if (typeof c.captcha !== 'object' || c.captcha === null)
        throw new Error('config.json: "captcha" must be an object');
    const cap = c.captcha as Record<string, unknown>;
    if (typeof cap.activate !== 'boolean')
        throw new Error('config.json: "captcha.activate" must be a boolean');
    for (const key of ['siteKey', 'secretKey', 'proxy'] as const) {
        if (typeof cap[key] !== 'string')
            throw new Error(`config.json: "captcha.${key}" must be a string`);
    }
}
