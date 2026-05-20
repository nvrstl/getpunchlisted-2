const STORAGE_KEY = 'punchlister_gmail';

export const GMAIL_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function getGmailConnection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const conn = JSON.parse(raw);
    if (Date.now() > conn.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return conn;
  } catch {
    return null;
  }
}

export function saveGmailConnection({ token, expiresIn, email }) {
  const conn = {
    token,
    email,
    expiresAt: Date.now() + (parseInt(expiresIn, 10) - 60) * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  return conn;
}

export function disconnectGmail() {
  localStorage.removeItem(STORAGE_KEY);
}

export function connectGmail() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set in .env');

  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/gmail.send email profile',
    prompt: 'consent',
  });

  const popup = window.open(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    'gmail-auth',
    'width=520,height=620,left=200,top=100'
  );
  if (!popup) throw new Error('Popup blocked — please allow popups for this site.');

  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'gmail_token') {
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        resolve(e.data);
      }
    };
    window.addEventListener('message', handler);
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Authentication timed out.'));
    }, 300_000);
  });
}

export async function fetchGmailProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Gmail profile');
  return res.json();
}

export async function sendGmail({ token, to, subject, body }) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');

  // Base64url encode
  const raw = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to send email');
  }
  return res.json();
}
