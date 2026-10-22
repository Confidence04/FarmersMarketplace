'use strict';

const multer = require('multer');
const FileType = require('file-type');
const objectStorage = require('../services/objectStorage');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const TYPE_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function fileFilter(_req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
  return cb(
    Object.assign(new Error('Only JPEG, PNG, and WebP images are allowed'), {
      code: 'INVALID_TYPE',
    })
  );
}

// Memory storage is deliberate: files are validated before being sent to durable
// object storage, so an instance-local uploads directory is never the source of truth.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

async function verifyUploadedFile(file) {
  if (!file?.buffer) throw Object.assign(new Error('No file uploaded'), { code: 'INVALID_TYPE' });
  const detected = await FileType.fromBuffer(file.buffer);
  const extension = detected && TYPE_EXTENSIONS[detected.mime];
  if (!extension)
    throw Object.assign(new Error('Only JPEG, PNG, and WebP images are allowed'), {
      code: 'INVALID_TYPE',
    });
  file.mimetype = detected.mime;
  file.extension = extension;
  return file;
}

async function storeUploadedFile(file) {
  await verifyUploadedFile(file);
  const key = objectStorage.createObjectKey(file.extension);
  const stored = await objectStorage.putObject({
    key,
    body: file.buffer,
    contentType: file.mimetype,
  });
  file.key = stored.key;
  file.url = stored.url;
  file.filename = key.split('/').pop();
  return file;
}

module.exports = upload;
module.exports.verifyUploadedFile = verifyUploadedFile;
module.exports.storeUploadedFile = storeUploadedFile;
module.exports.ALLOWED_TYPES = ALLOWED_TYPES;
module.exports.TYPE_EXTENSIONS = TYPE_EXTENSIONS;
