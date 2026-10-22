import { ensureCsrfToken, getAccessToken } from '../api/client';

function readCsrf() {
  const match = document.cookie.split(';').find((c) => c.trim().startsWith('csrf_token='));
  return match ? match.trim().split('=')[1] : null;
}

/**
 * Uploads a blob with XMLHttpRequest so progress can be reported (FE-23).
 * Returns { promise, abort }. The blob is kept by the caller, so a failed
 * upload can be retried without re-cropping.
 */
export function uploadWithProgress(blob, { url = '/api/v1/products/upload-image', field = 'image', onProgress } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    await ensureCsrfToken();
    return new Promise((resolve, reject) => {
      const form = new FormData();
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      form.append(field, blob, `image.${ext}`);
      xhr.open('POST', url);
      xhr.withCredentials = true;
      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      const csrf = readCsrf();
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON body */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(Object.assign(new Error(data.message || data.error || 'Upload failed'), { status: xhr.status }));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { cancelled: true }));
      xhr.send(form);
    });
  })();
  return { promise, abort: () => xhr.abort() };
}
