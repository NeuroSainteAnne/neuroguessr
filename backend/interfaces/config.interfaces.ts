export interface EmailConfig {
    type: string;
    server?: string;
    port?: number;
    mail_address: string;
    mail_password?: string;
    proxy?: string;
    clientId?: string;
    clientSecret?: string;
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
    salt: string;
    jwt_secret: string;
    pgConnectionString: string;
}
