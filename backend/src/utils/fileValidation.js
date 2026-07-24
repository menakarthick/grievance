'use strict';

// Extension allow-list + magic-byte MIME verification (SRS §8.2,
// docs/components/requestBodies.yaml#/FileUploadMultipart: "the client-
// declared Content-Type is never trusted alone"). No new dependency — the
// small, fixed set of signatures needed for the image types this module
// accepts is cheaper and more auditable than pulling in a file-type
// detection library for three signatures.
const IMAGE_SIGNATURES = [
  { mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'], magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', extensions: ['.png'], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    mimeType: 'image/webp',
    extensions: ['.webp'],
    magic: [0x52, 0x49, 0x46, 0x46], // 'RIFF'; bytes 8-11 are 'WEBP', checked separately below
  },
];

function bufferStartsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

function detectImageMimeType(buffer) {
  for (const signature of IMAGE_SIGNATURES) {
    if (bufferStartsWith(buffer, signature.magic)) {
      if (signature.mimeType === 'image/webp') {
        const webpTag = buffer.subarray(8, 12).toString('ascii');
        if (webpTag !== 'WEBP') continue;
      }
      return signature.mimeType;
    }
  }
  return null;
}

function extensionMatchesMimeType(filename, mimeType) {
  const signature = IMAGE_SIGNATURES.find((s) => s.mimeType === mimeType);
  if (!signature) return false;
  const lower = filename.toLowerCase();
  return signature.extensions.some((ext) => lower.endsWith(ext));
}

// Voice complaint audio (API_SPECIFICATION.md §4.2, SRS §8.2): WAV/MP3/OGG.
// WAV/OGG are RIFF/Ogg container magic bytes; MP3 has no single fixed magic
// number (files may start with an ID3v2 tag or a raw frame-sync byte
// pattern), so both are checked.
function detectAudioMimeType(buffer) {
  if (bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46])) {
    // 'RIFF'; bytes 8-11 must be 'WAVE'.
    if (buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
    return null;
  }
  if (bufferStartsWith(buffer, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg'; // 'OggS'
  if (bufferStartsWith(buffer, [0x49, 0x44, 0x33])) return 'audio/mpeg'; // 'ID3'
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg'; // MPEG frame sync
  return null;
}

// Document category (File Management module, docs/11-File-Management-APIs.md
// §11.1.1) — src/database/constants.js#FILE_ASSET_CATEGORIES only approves
// 'document' (not the doc's broader "PDF/Office document" illustrative
// list), so only PDF's own magic bytes are checked here; a real Office
// document (docx/xlsx, ZIP-container-based) is out of scope until that
// category list is extended.
function detectDocumentMimeType(buffer) {
  if (bufferStartsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // '%PDF'
  return null;
}

module.exports = { detectImageMimeType, detectAudioMimeType, detectDocumentMimeType, extensionMatchesMimeType };
