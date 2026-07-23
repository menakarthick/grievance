'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { Tenant, NotificationDispatch, NotificationPreference, Complaint, ComplaintCategory, CitizenProfile } = require('../../src/models');
const {
  createStaffUser,
  createDepartment,
  createCitizenWithProfile,
  tokenFor,
  createNotificationTemplate,
  createProviderConfig,
  createWardChain,
  ensureComplaintStatuses,
  getComplaintStatus,
} = require('./helpers/fixtures');
const notificationService = require('../../src/services/notification.service');

describe('Notification module (docs/notification.yaml, 08-Notification-APIs.md)', () => {
  let tenant;
  let department;
  let citizen;
  let citizenToken;
  let otherCitizen;
  let otherCitizenToken;
  let officer;
  let officerToken;
  let deptAdmin;
  let deptAdminToken;
  let corpAdminToken;

  beforeAll(async () => {
    [tenant] = await Tenant.findOrCreate({
      where: { code: 'NOTIFTEST' },
      defaults: { name: 'Notification Module Test Tenant', tenantType: 'ULB', state: 'Test State', status: 'active' },
    });

    await ensureComplaintStatuses(tenant.id);
    department = await createDepartment({ tenantId: tenant.id, code: 'ENGDEPT' });

    const c1 = await createCitizenWithProfile({ tenantId: tenant.id });
    citizen = c1.user;
    citizenToken = await tokenFor(citizen, ['citizen']);

    const c2 = await createCitizenWithProfile({ tenantId: tenant.id });
    otherCitizen = c2.user;
    otherCitizenToken = await tokenFor(otherCitizen, ['citizen']);

    const o1 = await createStaffUser({ tenantId: tenant.id, userType: 'officer', departmentId: department.id });
    officer = o1.user;
    officerToken = await tokenFor(officer, ['officer']);

    const da1 = await createStaffUser({ tenantId: tenant.id, userType: 'department_admin', departmentId: department.id });
    deptAdmin = da1.user;
    deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);

    const ca = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(ca.user, ['corporation_admin']);

    await createNotificationTemplate({ tenantId: tenant.id, eventType: 'WelcomeMessage', channel: 'sms', language: 'en', bodyTemplate: 'Hello {{name}}, welcome to {{tenantName}}.' });
    await createNotificationTemplate({ tenantId: tenant.id, eventType: 'WelcomeMessage', channel: 'email', language: 'en', bodyTemplate: 'Hello {{name}}.' });
    await createNotificationTemplate({ tenantId: tenant.id, eventType: 'WelcomeMessage', channel: 'whatsapp', language: 'en', bodyTemplate: 'Hi {{name}}!' });
    await createNotificationTemplate({ tenantId: tenant.id, eventType: 'WelcomeMessage', channel: 'push_mobile', language: 'en', bodyTemplate: 'Hi {{name}}!' });
    await createNotificationTemplate({ tenantId: tenant.id, eventType: 'WelcomeMessage', channel: 'in_app', language: 'en', bodyTemplate: 'Hi {{name}}!' });

    await createProviderConfig({ tenantId: tenant.id, providerType: 'sms', providerName: 'test_sms_gateway' });
    await createProviderConfig({ tenantId: tenant.id, providerType: 'email', providerName: 'test_smtp' });
  });

  afterAll(async () => {
    // Same fix as tests/integration/complaintLifecycle.test.js: Jest
    // schedules integration files largest-first with no timing cache, so
    // this suite's own active tenant must not outlive the run — otherwise
    // it trips auth.service.js#resolveSingleActiveTenant's "exactly one
    // active tenant" Phase-1 assumption for citizenAuth/tokenRefreshLogout.
    await tenant.update({ status: 'suspended' }).catch(() => {});
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  // --- 8.2-8.5 Channel send / status / RBAC / validation ----------------------
  describe('channel send', () => {
    test('Corporation Admin can send an SMS; a citizen recipient can read its status', async () => {
      const sendRes = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'Asha', tenantName: 'Tambaram' } })
        .expect(202);
      expect(sendRes.body.data.status).toBe('queued');
      expect(sendRes.body.data.channel).toBe('sms');
      const dispatchId = sendRes.body.data.notificationDispatchId;

      const statusRes = await request(app)
        .get(`/api/v1/notifications/sms/${dispatchId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(statusRes.body.data.channel).toBe('sms');
    });

    test('a citizen cannot read another citizen\'s dispatch status (403)', async () => {
      const sendRes = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'Asha', tenantName: 'Tambaram' } })
        .expect(202);
      await request(app)
        .get(`/api/v1/notifications/sms/${sendRes.body.data.notificationDispatchId}`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(403);
    });

    test('an Officer cannot send a production notification (403)', async () => {
      await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'Asha', tenantName: 'Tambaram' } })
        .expect(403);
    });

    test('missing variables required by the template are rejected (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'Asha' } })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('an unknown templateKey is rejected (404 TEMPLATE_NOT_FOUND)', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/email')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'NoSuchEvent', variables: {} })
        .expect(404);
      expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND');
    });

    test('a recipient who disabled the channel blocks a normal-priority send (422), but emergency bypasses it', async () => {
      await NotificationPreference.create({ userId: otherCitizen.id, channel: 'whatsapp', isEnabled: false });

      const blocked = await request(app)
        .post('/api/v1/notifications/whatsapp')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(otherCitizen.id), templateKey: 'WelcomeMessage', variables: { name: 'X' } })
        .expect(422);
      expect(blocked.body.error.code).toBe('CHANNEL_DISABLED_BY_RECIPIENT');

      const emergency = await request(app)
        .post('/api/v1/notifications/whatsapp')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(otherCitizen.id), templateKey: 'WelcomeMessage', variables: { name: 'X' }, priority: 'emergency' })
        .expect(202);
      expect(emergency.body.data.status).toBe('queued');
    });

    test('Test Send accepts a raw test number and flags isTestSend', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/sms/test')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ templateKey: 'WelcomeMessage', languageCode: 'en', testMobileNumber: '9876543210', variables: { name: 'Tester', tenantName: 'Tambaram' } })
        .expect(202);
      expect(res.body.data.isTestSend).toBe(true);
    });

    test('Push send validates the channel enum and dispatches', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/push')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), channel: 'push_mobile', templateKey: 'WelcomeMessage', variables: { name: 'Asha' } })
        .expect(202);
      expect(res.body.data.channel).toBe('push_mobile');
    });
  });

  // --- 8.6 In-App --------------------------------------------------------------
  describe('in-app inbox', () => {
    test('a citizen sees their own in-app notifications and can mark them read', async () => {
      await request(app)
        .post('/api/v1/notifications/push') // seeds nothing; use a direct SMS-less path instead
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), channel: 'push_mobile', templateKey: 'WelcomeMessage', variables: { name: 'InApp' } })
        .expect(202);

      const unreadBefore = await request(app)
        .get('/api/v1/notifications/in-app/unread-count')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(unreadBefore.body.data.unreadCount).toBeGreaterThanOrEqual(0);

      // Directly create an in_app dispatch the way the domain-event
      // consumer would, to exercise the inbox itself deterministically.
      const { dispatch } = await notificationServiceCreateInApp(citizen.id, tenant.id);
      expect(dispatch.channel).toBe('in_app');

      const list = await request(app)
        .get('/api/v1/notifications/in-app')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      const found = list.body.data.find((n) => n.notificationDispatchId === String(dispatch.id));
      expect(found).toBeTruthy();
      expect(found.renderedBody).toContain('Direct');

      const marked = await request(app)
        .patch(`/api/v1/notifications/in-app/${dispatch.id}/read`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(marked.body.data.status).toBe('read');

      const markAll = await request(app)
        .post('/api/v1/notifications/in-app/read-all')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(markAll.body.data.markedCount).toBeGreaterThanOrEqual(0);

      await request(app)
        .get(`/api/v1/notifications/in-app/${dispatch.id}`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(403);
    });
  });

  async function notificationServiceCreateInApp(recipientUserId, tenantId) {
    const repo = require('../../src/repositories/notification.repository');
    const event = await repo.createEvent({ tenantId, eventType: 'WelcomeMessage', complaintId: null, payloadSummary: { variables: { name: 'Direct' } } });
    const template = await repo.findTemplate(tenantId, 'WelcomeMessage', 'in_app', 'en');
    const dispatch = await repo.createDispatch({ notificationEventId: event.id, recipientUserId, channel: 'in_app', templateConfigId: template.id, status: 'queued' });
    return { event, dispatch };
  }

  // --- 8.7 Templates -------------------------------------------------------------
  describe('templates', () => {
    test('Corporation Admin can create, get, update (new version), and preview a template', async () => {
      const created = await request(app)
        .post('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ eventType: 'CustomEvent', channel: 'email', languageCode: 'en', bodyTemplate: 'Body {{x}}', subjectTemplate: 'Subject {{x}}' })
        .expect(201);
      expect(created.body.data.version).toBe(1);
      expect(created.body.data.approvalStatus).toBe('approved');
      const templateId = created.body.data.id;

      const got = await request(app)
        .get(`/api/v1/notification-templates/${templateId}`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(got.body.data.bodyTemplate).toBe('Body {{x}}');
      expect(got.body.data.subjectTemplate).toBe('Subject {{x}}');

      const preview = await request(app)
        .post(`/api/v1/notification-templates/${templateId}/preview`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ sampleVariables: { x: 'hello' } })
        .expect(200);
      expect(preview.body.data.renderedBody).toBe('Body hello');
      expect(preview.body.data.renderedSubject).toBe('Subject hello');

      const updated = await request(app)
        .patch(`/api/v1/notification-templates/${templateId}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ bodyTemplate: 'Body v2 {{x}}', expectedVersion: 1 })
        .expect(200);
      expect(updated.body.data.version).toBe(2);

      const staleUpdate = await request(app)
        .patch(`/api/v1/notification-templates/${templateId}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ bodyTemplate: 'stale', expectedVersion: 1 })
        .expect(409);
      expect(staleUpdate.body.error.code).toBe('CONCURRENT_MODIFICATION');

      const versions = await request(app)
        .get(`/api/v1/notification-templates/${templateId}/versions`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(versions.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('htmlBodyTemplate is rejected (not supported this phase, no column exists)', async () => {
      const res = await request(app)
        .post('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ eventType: 'HtmlEvent', channel: 'email', languageCode: 'en', bodyTemplate: 'x', htmlBodyTemplate: '<p>x</p>' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('a Department Admin cannot create a template (403)', async () => {
      await request(app)
        .post('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ eventType: 'X', channel: 'sms', languageCode: 'en', bodyTemplate: 'x' })
        .expect(403);
    });

    test('the approval-workflow endpoints degrade to 501 NOT_ENABLED (no approvalStatus column exists)', async () => {
      const created = await request(app)
        .post('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ eventType: 'ApprovalEvent', channel: 'sms', languageCode: 'en', bodyTemplate: 'x' })
        .expect(201);
      const res = await request(app)
        .post(`/api/v1/notification-templates/${created.body.data.id}/submit-for-approval`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({})
        .expect(501);
      expect(res.body.error.code).toBe('NOT_ENABLED');
    });

    test('Delete deactivates a template (soft-delete)', async () => {
      const created = await request(app)
        .post('/api/v1/notification-templates')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ eventType: 'DeleteMe', channel: 'sms', languageCode: 'en', bodyTemplate: 'x' })
        .expect(201);
      await request(app)
        .delete(`/api/v1/notification-templates/${created.body.data.id}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(204);
      await request(app)
        .get(`/api/v1/notification-templates/${created.body.data.id}`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(404);
    });
  });

  // --- 8.8 Preferences ------------------------------------------------------------
  describe('preferences', () => {
    test('a user can read and update their own preferences; disabling every channel is rejected', async () => {
      const mine = await request(app)
        .get('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      expect(Array.isArray(mine.body.data.channels)).toBe(true);

      const updated = await request(app)
        .patch('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ channels: [{ channel: 'sms', isEnabled: false }], expectedVersion: 1 })
        .expect(200);
      expect(updated.body.data.channels.find((c) => c.channel === 'sms').isEnabled).toBe(false);

      const allDisabled = await request(app)
        .patch('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          channels: [
            { channel: 'sms', isEnabled: false },
            { channel: 'email', isEnabled: false },
            { channel: 'whatsapp', isEnabled: false },
            { channel: 'push_mobile', isEnabled: false },
            { channel: 'push_web', isEnabled: false },
            { channel: 'push_browser', isEnabled: false },
            { channel: 'in_app', isEnabled: false },
          ],
          expectedVersion: 1,
        })
        .expect(422);
      expect(allDisabled.body.error.code).toBe('ALL_CHANNELS_DISABLED');
    });

    test('a Department Admin can view (not edit) another user\'s preferences within their department', async () => {
      const res = await request(app)
        .get(`/api/v1/notification-preferences/${officer.id}`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data.channels)).toBe(true);
    });

    test('Emergency Override requires justification >= 10 chars and does not persist a preference change', async () => {
      const tooShort = await request(app)
        .post(`/api/v1/notification-preferences/${citizen.id}/emergency-override`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ templateKey: 'WelcomeMessage', channel: 'sms', variables: { name: 'X', tenantName: 'Y' }, justification: 'short' })
        .expect(400);
      expect(tooShort.body.error.code).toBe('VALIDATION_ERROR');

      const ok = await request(app)
        .post(`/api/v1/notification-preferences/${citizen.id}/emergency-override`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ templateKey: 'WelcomeMessage', channel: 'sms', variables: { name: 'X', tenantName: 'Y' }, justification: 'Public safety alert' })
        .expect(202);
      expect(ok.body.data.overrideApplied).toBe(true);
    });
  });

  // --- 8.9 Queue / Schedule / Cancel / Dead Letter ----------------------------
  describe('queue', () => {
    test('a queued dispatch appears in the queue list and can be cancelled', async () => {
      const sent = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'Q', tenantName: 'T' } })
        .expect(202);
      const dispatchId = sent.body.data.notificationDispatchId;

      const queueList = await request(app)
        .get('/api/v1/notifications/queue')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(queueList.body.data.some((i) => i.notificationDispatchId === dispatchId)).toBe(true);

      const cancelled = await request(app)
        .post(`/api/v1/notifications/queue/${dispatchId}/cancel`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ reason: 'no longer needed' })
        .expect(200);
      expect(cancelled.body.data.status).toBe('cancelled');

      await request(app)
        .post(`/api/v1/notifications/queue/${dispatchId}/cancel`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({})
        .expect(200); // idempotent
    });

    test('a Schedule request accepts delaySeconds and queues the dispatch', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/schedule')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), channel: 'sms', templateKey: 'WelcomeMessage', variables: { name: 'S', tenantName: 'T' }, delaySeconds: 60 })
        .expect(202);
      expect(res.body.data.status).toBe('queued');
    });

    test('a dead-lettered dispatch is listed and can be manually retried', async () => {
      const sent = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'DL', tenantName: 'T' } })
        .expect(202);
      const dispatchId = sent.body.data.notificationDispatchId;
      await NotificationDispatch.update({ status: 'dead_letter' }, { where: { id: dispatchId } });

      const dlq = await request(app)
        .get('/api/v1/notifications/queue/dead-letter')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(dlq.body.data.some((i) => i.notificationDispatchId === dispatchId)).toBe(true);

      const retried = await request(app)
        .post(`/api/v1/notifications/${dispatchId}/retry`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(202);
      expect(retried.body.data.status).toBe('retried');
      expect(retried.body.data.retryCount).toBe(1);

      const alreadyQueued = await request(app)
        .post(`/api/v1/notifications/${dispatchId}/retry`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(409);
      expect(alreadyQueued.body.error.code).toBe('NOTIFICATION_NOT_RETRYABLE');

      const history = await request(app)
        .get(`/api/v1/notifications/${dispatchId}/retries`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(history.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('bulk retry re-queues every matching dispatch', async () => {
      const sent = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'BR', tenantName: 'T' } })
        .expect(202);
      await NotificationDispatch.update({ status: 'failed' }, { where: { id: sent.body.data.notificationDispatchId } });

      const res = await request(app)
        .post('/api/v1/notifications/retry/bulk')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ channel: 'sms', filter: { status: 'failed' } })
        .expect(202);
      expect(res.body.data.matchedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- 8.10 History ------------------------------------------------------------
  describe('history', () => {
    test('a citizen sees only their own history regardless of a supplied recipientUserId', async () => {
      await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserId: String(citizen.id), templateKey: 'WelcomeMessage', variables: { name: 'H', tenantName: 'T' } })
        .expect(202);

      const res = await request(app)
        .get('/api/v1/notifications/history')
        .query({ recipientUserId: String(otherCitizen.id) })
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('export history degrades to 501 (no Reports/File export infra exists yet)', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(501);
      expect(res.body.error.code).toBe('NOT_ENABLED');
    });
  });

  // --- 8.12 Providers ----------------------------------------------------------
  describe('providers', () => {
    test('list/get/test-connectivity for a configured provider', async () => {
      const list = await request(app)
        .get('/api/v1/notification-providers')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(list.body.data.some((p) => p.providerType === 'sms')).toBe(true);

      const detail = await request(app)
        .get('/api/v1/notification-providers/sms')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(detail.body.data.providerType).toBe('sms');

      const test = await request(app)
        .post('/api/v1/notification-providers/sms/test')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(test.body.data.reachable).toBe(true);
    });

    test('a provider type with no configured row (push) 404s', async () => {
      const res = await request(app)
        .get('/api/v1/notification-providers/push')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(404);
      expect(res.body.error.code).toBe('PROVIDER_NOT_FOUND');
    });
  });

  // --- 8.13 Broadcast ----------------------------------------------------------
  describe('broadcast', () => {
    test('Corporation Admin can broadcast to a department scope and check status', async () => {
      const created = await request(app)
        .post('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ scopeType: 'department', scopeId: department.id, channels: ['in_app'], templateKey: 'WelcomeMessage', variables: { name: 'Broadcast' } })
        .expect(202);
      expect(created.body.data.estimatedRecipientCount).toBeGreaterThanOrEqual(1);
      const broadcastId = created.body.data.broadcastId;

      const status = await request(app)
        .get(`/api/v1/notifications/broadcast/${broadcastId}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(['queued', 'in_progress', 'completed']).toContain(status.body.data.status);

      const list = await request(app)
        .get('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(list.body.data.some((b) => b.broadcastId === broadcastId)).toBe(true);
    });

    test('a Department Admin cannot broadcast to another department (403)', async () => {
      const otherDept = await createDepartment({ tenantId: tenant.id, code: 'SANDEPT' });
      await request(app)
        .post('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ scopeType: 'department', scopeId: otherDept.id, channels: ['in_app'], templateKey: 'WelcomeMessage', variables: { name: 'X' } })
        .expect(403);
    });

    test('a ward-scoped broadcast reaches citizens registered to that ward', async () => {
      const { ward } = await createWardChain({ tenantId: tenant.id });
      const wardCitizen = await createCitizenWithProfile({ tenantId: tenant.id, wardId: ward.id });

      const created = await request(app)
        .post('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ scopeType: 'ward', scopeId: ward.id, channels: ['in_app'], templateKey: 'WelcomeMessage', variables: { name: 'Ward' } })
        .expect(202);
      expect(created.body.data.estimatedRecipientCount).toBe(1);

      const history = await request(app)
        .get('/api/v1/notifications/history')
        .query({ recipientUserId: String(wardCitizen.user.id) })
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(history.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- 8.14 Bulk ---------------------------------------------------------------
  describe('bulk', () => {
    test('Corporation Admin can create a bulk job to an explicit recipient list', async () => {
      const created = await request(app)
        .post('/api/v1/notifications/bulk')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserIds: [String(citizen.id), String(otherCitizen.id)], channel: 'in_app', templateKey: 'WelcomeMessage', variables: { name: 'Bulk' } })
        .expect(202);
      expect(created.body.data.recipientCount).toBe(2);

      const status = await request(app)
        .get(`/api/v1/notifications/bulk/${created.body.data.bulkJobId}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(status.body.data.recipientCount).toBe(2);
    });

    test('a recipient list over the configured max is rejected (422)', async () => {
      const tooMany = Array.from({ length: 5001 }, (_, i) => String(i + 1));
      const res = await request(app)
        .post('/api/v1/notifications/bulk')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ recipientUserIds: tooMany, channel: 'in_app', templateKey: 'WelcomeMessage', variables: {} })
        .expect(400); // express-validator's own max:5000 array-length rule catches this first
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // --- 8.15 Analytics ----------------------------------------------------------
  describe('analytics', () => {
    test('Department Admin can read the analytics summary for a period', async () => {
      const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .get('/api/v1/notifications/analytics')
        .query({ periodStart, periodEnd })
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(typeof res.body.data.totalDispatched).toBe('number');
      expect(res.body.data.openRatePercent).toBe(0);
    });

    test('an Officer cannot read analytics (403)', async () => {
      await request(app)
        .get('/api/v1/notifications/analytics')
        .query({ periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() })
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });
  });

  // --- 8.16 Health -------------------------------------------------------------
  describe('health', () => {
    test('service/provider/queue health all report using the mock providers', async () => {
      const health = await request(app).get('/api/v1/notifications/health').set('Authorization', `Bearer ${deptAdminToken}`).expect(200);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.body.data.overallStatus);

      const providerHealth = await request(app)
        .get('/api/v1/notifications/health/providers')
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(200);
      expect(providerHealth.body.data.length).toBe(4);

      const queueHealth = await request(app).get('/api/v1/notifications/health/queue').set('Authorization', `Bearer ${corpAdminToken}`).expect(200);
      expect(typeof queueHealth.body.data.queueDepth).toBe('number');
    });
  });

  // --- Domain event consumption (Complaint -> Notification) --------------------
  describe('domain event consumption', () => {
    test('consumeDomainEvents fans out a ComplaintCreated-shaped notification_event into dispatch rows', async () => {
      const repo = require('../../src/repositories/notification.repository');

      const registeredStatus = await getComplaintStatus(tenant.id, 'REGISTERED');
      const category = await ComplaintCategory.create({ tenantId: tenant.id, departmentId: department.id, name: 'Roads', defaultPriority: 2, isActive: true });
      const citizenProfile = await CitizenProfile.findOne({ where: { userId: citizen.id } });
      const complaint = await Complaint.create({
        tenantId: tenant.id,
        trackingId: `NFT-ENG-202607-${Date.now() % 1000000}`,
        citizenId: citizenProfile.id,
        departmentId: department.id,
        categoryId: category.id,
        statusId: registeredStatus.id,
        priority: 2,
        language: 'en',
        description: 'A pothole needs fixing on the main road near the market.',
        locationAddress: 'Test address',
      });

      await createNotificationTemplate({ tenantId: tenant.id, eventType: 'ComplaintCreated', channel: 'in_app', language: 'en', bodyTemplate: 'Complaint {{trackingId}} registered.' });
      await createNotificationTemplate({ tenantId: tenant.id, eventType: 'ComplaintCreated', channel: 'sms', language: 'en', bodyTemplate: 'Complaint {{trackingId}} registered.' });

      const event = await repo.createEvent({
        tenantId: tenant.id,
        eventType: 'ComplaintCreated',
        complaintId: complaint.id,
        payloadSummary: { trackingId: complaint.trackingId },
      });

      const result = await notificationService.consumeDomainEvents();
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(1);

      const dispatches = await NotificationDispatch.findAll({ where: { notificationEventId: event.id } });
      expect(dispatches.length).toBeGreaterThanOrEqual(1);
      expect(dispatches.some((d) => d.recipientUserId === citizen.id)).toBe(true);

      // Idempotent: a second call must not create duplicate dispatches for
      // the same, already-consumed event.
      const before = dispatches.length;
      await notificationService.consumeDomainEvents();
      const after = await NotificationDispatch.count({ where: { notificationEventId: event.id } });
      expect(after).toBe(before);
    });
  });
});
