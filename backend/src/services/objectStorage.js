'use strict';

const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const bucket = process.env.OBJECT_STORAGE_BUCKET || process.env.S3_BUCKET;
const publicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_URL || process.env.S3_PUBLIC_URL;
const configured = Boolean(bucket);
const client = configured
  ? new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    })
  : null;

function createObjectKey(extension, prefix = 'uploads') {
  return `${prefix}/${crypto.randomBytes(16).toString('hex')}${extension}`;
}

async function putObject({ key, body, contentType }) {
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Object storage is not configured (OBJECT_STORAGE_BUCKET is required)');
    }
    return { key, url: `/uploads/${key.split('/').pop()}` };
  }
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return { key, url: await getDownloadUrl(key) };
}

async function getDownloadUrl(key, expiresIn = 900) {
  if (!configured) return `/uploads/${key.split('/').pop()}`;
  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  return getSignedUrl(
    client,
    new (require('@aws-sdk/client-s3').GetObjectCommand)({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

async function deleteObject(key) {
  if (!configured) return false;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

async function listObjects(prefix = 'uploads/') {
  if (!configured) return [];
  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (result.Contents || []).map((item) => ({
    key: item.Key,
    lastModified: item.LastModified,
  }));
}

module.exports = {
  configured,
  bucket,
  createObjectKey,
  putObject,
  getDownloadUrl,
  deleteObject,
  listObjects,
};
