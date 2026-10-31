import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';

/** WebAuthn needs a secure context: https, or localhost. Over http://LAN-IP the browser hides it. */
export const passkeysAvailable = () => window.isSecureContext && browserSupportsWebAuthn();

/** The person closed the system dialog: not an error worth showing. */
export const cancelled = (err: unknown) => err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');

export async function loginWithPasskey() {
  const optionsJSON = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/passkey/login/options');
  const response = await startAuthentication({ optionsJSON });
  await api.post('/api/auth/passkey/login/verify', { response });
}

/** Adds a passkey to the signed-in account, or (with an invite token) signs up with one. */
export async function registerPasskey(name: string, invite?: { token: string; username?: string }) {
  const base = invite ? `/api/auth/invite/${invite.token}/passkey` : '/api/passkeys/register';
  const optionsJSON = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>(`${base}/options`, { username: invite?.username });
  const response = await startRegistration({ optionsJSON });
  await api.post(`${base}/verify`, { response, name });
}

/** A name for this device's passkey, from the browser's platform. */
export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Passkey';
}
