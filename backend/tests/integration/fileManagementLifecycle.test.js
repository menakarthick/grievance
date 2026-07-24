'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { Tenant, FileAsset, ComplaintCategory } = require('../../src/models');
const {
  createStaffUser,
  createDepartment,
  createCitizenWithProfile,
  tokenFor,
  ensureComplaintStatuses,
} = require('./helpers/fixtures');

const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(64, 2)]);
const GARBAGE_BUFFER = Buffer.from('not a real file at all');

describe('File Management module (docs/file-management.yaml, 11-File-Management-APIs.md)', () => {
  let tenant;
  let department;
  let citizen;
  let citizenToken;
  let otherCitizen;
  let otherCitizenToken;
  let corpAdminToken;

  beforeAll(async () => {
    [tenant] = await Tenant.findOrCreate({
      where: { code: 'FILETEST' },
      defaults: { name: 'File Management Test Tenant', tenantType: 'ULB', state: 'Test State', status: 'active' },
    });
    await ensureComplaintStatuses(tenant.id);
    department = await createDepartment({ tenantId: tenant.id, code: 'ENGDEPT' });

    const c1 = await createCitizenWithProfile({ tenantId: tenant.id });
    citizen = c1.user;
    citizenToken = await tokenFor(citizen, ['citizen']);

    const c2 = await createCitizenWithProfile({ tenantId: tenant.id });
    otherCitizen = c2.user;
    otherCitizenToken = await tokenFor(otherCitizen, ['citizen']);

    const ca = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(ca.user, ['corporation_admin']);
  });

  afterAll(async () => {
    // Same fix as complaintLifecycle.test.js/notificationLifecycle.test.js.
    await tenant.update({ status: 'suspended' }).catch(() => {});
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  async function createTestComplaint(overrides = {}) {
    const category = await ComplaintCategory.create({
      tenantId: tenant.id,
      departmentId: department.id,
      name: `Category ${Date.now()}-${Math.random()}`,
      defaultPriority: 2,
      isActive: true,
    });
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        description: 'There is a large pothole on the main road near the bus stop.',
        categoryId: category.id,
        location: { addressText: '12 Main Road' },
        languageCode: 'en',
        ...overrides,
      })
      .expect(202);
    return res.body.data;
  }

  // --- 11.1 Upload -------------------------------------------------------------
  describe('upload', () => {
    test('a citizen can upload an image linked to their own complaint', async () => {
      const complaint = await createTestComplaint();
      const res = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      expect(res.body.data.virusScanStatus).toBe('pending');
      expect(res.body.data.lifecycleState).toBe('quarantine');
      expect(res.body.data.assetCategory).toBe('image');
    });

    test('a citizen cannot upload a file linked to another citizen\'s complaint (403)', async () => {
      const complaint = await createTestComplaint();
      await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(403);
    });

    test('a non-matching magic-byte file is rejected (415)', async () => {
      const complaint = await createTestComplaint();
      const res = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', GARBAGE_BUFFER, 'fake.png')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    test('an invalid assetCategory is rejected (400)', async () => {
      const complaint = await createTestComplaint();
      await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'not_a_real_category')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(400);
    });

    test('a genuine PDF uploads successfully under the document category', async () => {
      const complaint = await createTestComplaint();
      const res = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'document')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PDF_BUFFER, 'evidence.pdf')
        .expect(202);
      expect(res.body.data.mimeType).toBe('application/pdf');
    });

    test('unauthenticated requests are rejected (401)', async () => {
      await request(app)
        .post('/api/v1/files')
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', 1)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(401);
    });
  });

  // --- Complaint integration ("must use this File Management service") -------
  describe('Complaint integration', () => {
    test('Complaint\'s own attachment endpoint creates a real file_asset through the File Management pipeline', async () => {
      const complaint = await createTestComplaint();
      const res = await request(app)
        .post(`/api/v1/complaints/${complaint.id}/attachments`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', PNG_BUFFER, 'pothole.png')
        .expect(202);

      const fileAssetId = res.body.data.fileAssetId;
      const fileAsset = await FileAsset.findByPk(fileAssetId);
      expect(fileAsset).not.toBeNull();
      expect(fileAsset.linkedEntityType).toBe('complaint');
      // linked_entity_id is BIGINT.UNSIGNED (mysql2 returns it as a string)
      // and complaint.id is Complaint's own DTO-shaped string id — compare
      // as strings on both sides.
      expect(String(fileAsset.linkedEntityId)).toBe(complaint.id);
      expect(fileAsset.virusScanStatus).toBe('clean'); // the placeholder hook ran
      expect(fileAsset.lifecycleState).toBe('hot');

      // The same file is now reachable through File Management's own
      // download/metadata endpoints, not just Complaint's.
      const download = await request(app)
        .get(`/api/v1/files/${fileAssetId}/download`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('Accept', 'application/json')
        .expect(200);
      expect(download.body.data.downloadUrl).toContain('/files/download-token/');
    });
  });

  // --- 11.2 Download -------------------------------------------------------
  describe('download', () => {
    async function uploadAndReturn(user, token, complaintId) {
      const res = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${token}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaintId)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      return res.body.data.fileAssetId;
    }

    test('the owner gets a signed download URL, and the token actually streams the original bytes', async () => {
      const complaint = await createTestComplaint();
      const fileAssetId = await uploadAndReturn(citizen, citizenToken, complaint.id);

      const ack = await request(app)
        .get(`/api/v1/files/${fileAssetId}/download`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('Accept', 'application/json')
        .expect(200);
      expect(ack.body.data.downloadUrl).toBeTruthy();
      expect(new Date(ack.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const token = ack.body.data.downloadUrl.split('/download-token/')[1];
      const streamed = await request(app).get(`/api/v1/files/download-token/${token}`).expect(200);
      expect(Buffer.compare(streamed.body, PNG_BUFFER)).toBe(0);
    });

    test('a non-owning citizen cannot get a download URL (403)', async () => {
      const complaint = await createTestComplaint();
      const fileAssetId = await uploadAndReturn(citizen, citizenToken, complaint.id);
      await request(app)
        .get(`/api/v1/files/${fileAssetId}/download`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(403);
    });

    test('an invalid/tampered download token is rejected (404)', async () => {
      await request(app).get('/api/v1/files/download-token/not-a-real-token').expect(404);
    });

    test('a quarantined file cannot be downloaded (410)', async () => {
      const complaint = await createTestComplaint();
      const fileAssetId = await uploadAndReturn(citizen, citizenToken, complaint.id);
      await FileAsset.update({ lifecycleState: 'quarantine', virusScanStatus: 'pending' }, { where: { id: fileAssetId } });
      const res = await request(app)
        .get(`/api/v1/files/${fileAssetId}/download`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(410);
      expect(res.body.error.code).toBe('FILE_QUARANTINED');
    });
  });

  // --- 11.4 Metadata -----------------------------------------------------------
  describe('metadata', () => {
    test('get/update metadata; tags are rejected (no backing column), assetCategory is honored', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const meta = await request(app)
        .get(`/api/v1/files/${fileAssetId}/metadata`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(meta.body.data.tags).toEqual([]);
      expect(meta.body.data.virusScanStatus).toBe('clean');

      const tagsRejected = await request(app)
        .patch(`/api/v1/files/${fileAssetId}/metadata`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ tags: ['evidence'] })
        .expect(400);
      expect(tagsRejected.body.error.code).toBe('VALIDATION_ERROR');

      const updated = await request(app)
        .patch(`/api/v1/files/${fileAssetId}/metadata`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ assetCategory: 'document' })
        .expect(200);
      expect(updated.body.data.assetCategory).toBe('document');
    });
  });

  // --- 11.5 Versioning (degraded — no file_asset_metadata table) -------------
  describe('versioning', () => {
    test('a file reports itself as its own sole, current version', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const versions = await request(app)
        .get(`/api/v1/files/${fileAssetId}/versions`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(versions.body.data).toHaveLength(1);
      expect(versions.body.data[0].isCurrent).toBe(true);

      const version = await request(app)
        .get(`/api/v1/files/${fileAssetId}/versions/${fileAssetId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(version.body.data.versionNumber).toBe(1);

      const restore = await request(app)
        .post(`/api/v1/files/${fileAssetId}/versions/${fileAssetId}/restore`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(409);
      expect(restore.body.error.code).toBe('VERSION_ALREADY_CURRENT');
    });
  });

  // --- 11.6 Sharing / 11.7 Access (resource_share doesn't exist yet) --------
  describe('sharing and access', () => {
    test('share-link creation degrades to 501 (resource_share is proposed, not approved)', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const res = await request(app)
        .post(`/api/v1/files/${fileAssetId}/share-links`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ expiresAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(501);
      expect(res.body.error.code).toBe('NOT_ENABLED');
    });

    test('the access list reports the real owner, computed (not stored)', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const access = await request(app)
        .get(`/api/v1/files/${fileAssetId}/access`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(access.body.data.some((e) => e.accessBasis === 'owner')).toBe(true);
    });
  });

  // --- 11.11 Search --------------------------------------------------------
  describe('search', () => {
    test('search scopes results to files the caller can access', async () => {
      const complaint = await createTestComplaint();
      await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);

      const ownResults = await request(app)
        .get('/api/v1/files/search')
        .query({ linkedEntityType: 'complaint', linkedEntityId: complaint.id })
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(ownResults.body.data.length).toBeGreaterThanOrEqual(1);

      const otherResults = await request(app)
        .get('/api/v1/files/search')
        .query({ linkedEntityType: 'complaint', linkedEntityId: complaint.id })
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(200);
      expect(otherResults.body.data).toHaveLength(0);
    });
  });

  // --- 11.12 Archive & Restore ------------------------------------------------
  describe('archive and restore', () => {
    test('Corporation Admin can archive a hot file, list it, and restore it', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const archived = await request(app)
        .post(`/api/v1/files/${fileAssetId}/archive`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(archived.body.data.lifecycleState).toBe('archived');

      const list = await request(app)
        .get('/api/v1/files/archived')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(list.body.data.some((f) => f.fileAssetId === String(fileAssetId))).toBe(true);

      const restored = await request(app)
        .post(`/api/v1/files/${fileAssetId}/restore`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(restored.body.data.lifecycleState).toBe('hot');
    });

    test('a citizen cannot archive a file (403)', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      await request(app)
        .post(`/api/v1/files/${uploadRes.body.data.fileAssetId}/archive`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(403);
    });
  });

  // --- 11.13 Delete (soft delete) --------------------------------------------
  describe('delete', () => {
    test('the owner can soft-delete a file; it disappears from normal reads but the row survives', async () => {
      // linkedEntityType deliberately not 'complaint' here — a lone
      // complaint attachment on an open complaint is the *protected*
      // scenario, covered by its own test below; this test is for plain
      // delete behavior on an otherwise-unprotected file.
      const uploadRes = await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'officer_evidence')
        .field('linkedEntityId', '1')
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      const fileAssetId = uploadRes.body.data.fileAssetId;

      const deleted = await request(app)
        .delete(`/api/v1/files/${fileAssetId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(deleted.body.data.deletedAt).toBeTruthy();

      await request(app)
        .get(`/api/v1/files/${fileAssetId}/metadata`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(404);

      const row = await FileAsset.findByPk(fileAssetId);
      expect(row).not.toBeNull();
      expect(row.deletedBy).not.toBeNull();
    });

    test('the sole attachment on an open complaint is protected from deletion (409)', async () => {
      const complaint = await createTestComplaint();
      const uploadRes = await request(app)
        .post(`/api/v1/complaints/${complaint.id}/attachments`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);

      const res = await request(app)
        .delete(`/api/v1/files/${uploadRes.body.data.fileAssetId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(409);
      expect(res.body.error.code).toBe('FILE_PROTECTED');
    });
  });

  // --- 11.14 Storage Usage ----------------------------------------------------
  describe('storage usage', () => {
    test('Corporation Admin can read storage usage summary and by-category breakdown', async () => {
      const complaint = await createTestComplaint();
      await request(app)
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .field('linkedEntityType', 'complaint')
        .field('linkedEntityId', complaint.id)
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);

      const summary = await request(app)
        .get('/api/v1/files/storage-usage')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(summary.body.data.totalBytesUsed).toBeGreaterThan(0);

      const byCategory = await request(app)
        .get('/api/v1/files/storage-usage/by-category')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(byCategory.body.data.some((r) => r.assetCategory === 'image')).toBe(true);
    });

    test('an Officer cannot read storage usage (403)', async () => {
      const officer = await createStaffUser({ tenantId: tenant.id, userType: 'officer', departmentId: department.id });
      const officerToken = await tokenFor(officer.user, ['officer']);
      await request(app).get('/api/v1/files/storage-usage').set('Authorization', `Bearer ${officerToken}`).expect(403);
    });
  });

  // --- 11.1.2/11.1.3 Multipart -------------------------------------------------
  describe('multipart upload', () => {
    test('initiate then complete runs the file through the standard validation pipeline', async () => {
      const complaint = await createTestComplaint();
      const initiated = await request(app)
        .post('/api/v1/files/multipart')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          fileName: 'evidence.png',
          mimeType: 'image/png',
          totalSizeBytes: PNG_BUFFER.length,
          assetCategory: 'image',
          linkedEntityType: 'complaint',
          linkedEntityId: complaint.id,
        })
        .expect(201);
      expect(initiated.body.data.multipartUploadId).toBeTruthy();

      const completed = await request(app)
        .post(`/api/v1/files/multipart/${initiated.body.data.multipartUploadId}/complete`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('chunkChecksums', JSON.stringify(['abc']))
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      expect(completed.body.data.virusScanStatus).toBe('pending');

      // Idempotent: completing again returns the same fileAssetId.
      const completedAgain = await request(app)
        .post(`/api/v1/files/multipart/${initiated.body.data.multipartUploadId}/complete`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('chunkChecksums', JSON.stringify(['abc']))
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(202);
      expect(completedAgain.body.data.fileAssetId).toBe(completed.body.data.fileAssetId);
    });

    test('completing an unknown session 404s', async () => {
      await request(app)
        .post('/api/v1/files/multipart/not-a-real-session/complete')
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('chunkChecksums', JSON.stringify([]))
        .attach('file', PNG_BUFFER, 'evidence.png')
        .expect(404);
    });
  });
});
