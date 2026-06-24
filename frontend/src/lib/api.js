export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers['content-type']) headers['content-type'] = 'application/json';

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new CustomEvent('standup:unauthorized'));
    return {};
  }
  if (!response.ok) {
    throw new ApiError(body.error || `request_failed_${response.status}`, {
      status: response.status,
      body,
    });
  }
  return body;
}

export function formatApiError(error) {
  const message = error?.message || 'request_failed';
  return message
    .replace(/^request_failed_/, 'Request failed ')
    .replaceAll('_', ' ');
}
