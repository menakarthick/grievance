'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { StaffProfile, ComplaintAssignment, Tenant, NotificationEvent } = require('../../src/models');
const {
  createStaffUser,
  createDepartment,
  createCategory,
  createCitizenWithProfile,
  uniqueSuffix,
  tokenFor,
  ensureComplaintStatuses,
} = require('./helpers/fixtures');

const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const WAV_BUFFER = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(64)]);
const GARBAGE_BUFFER = Buffer.from('this is not an image or audio file');

describe('Complaint module (docs/complaint.yaml, API_SPECIFICATION.md Section 4)', () => {
  let tenant;
  let department;
  let otherDepartment;
  let category;
  let citizen;
  let citizenToken;
  let otherCitizen;
  let otherCitizenToken;
  let officer;
  let officerToken;
  let otherDeptOfficer;
  let deptAdmin;
  let deptAdminToken;
  let otherDeptAdmin;
  let otherDeptAdminToken;
  let corpAdmin;
  let corpAdminToken;

  beforeAll(async () => {
    // A dedicated tenant, rather than the shared getOrCreateTestTenant()
    // fixture ('TEST_AUTH' — used across the Admin/Geo/Auth suites) —
    // needed because docs/complaint.yaml's trackingId path pattern
    // (^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$) only allows letters in the
    // tenant/department segments, stricter than docs/administration.yaml's
    // own department `code` validator ([A-Z0-9]{2,10}, alphanumeric). Using
    // letters-only codes here exercises the documented format faithfully;
    // see the completion report for the cross-document inconsistency this
    // surfaced.
    [tenant] = await Tenant.findOrCreate({
      where: { code: 'CMPLNTTEST' },
      defaults: { name: 'Complaint Module Test Tenant', tenantType: 'ULB', state: 'Test State', status: 'active' },
    });
    await ensureComplaintStatuses(tenant.id);

    department = await createDepartment({ tenantId: tenant.id, code: 'ENGDEPT' });
    otherDepartment = await createDepartment({ tenantId: tenant.id, code: 'SANDEPT' });
    category = await createCategory({ tenantId: tenant.id, departmentId: department.id, defaultPriority: 2 });

    const c1 = await createCitizenWithProfile({ tenantId: tenant.id });
    citizen = c1.user;
    citizenToken = await tokenFor(citizen, ['citizen']);

    const c2 = await createCitizenWithProfile({ tenantId: tenant.id });
    otherCitizen = c2.user;
    otherCitizenToken = await tokenFor(otherCitizen, ['citizen']);

    const o1 = await createStaffUser({ tenantId: tenant.id, userType: 'officer', departmentId: department.id });
    officer = o1.user;
    officerToken = await tokenFor(officer, ['officer']);

    const o2 = await createStaffUser({ tenantId: tenant.id, userType: 'officer', departmentId: otherDepartment.id });
    otherDeptOfficer = o2.user;

    const da1 = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: department.id,
    });
    deptAdmin = da1.user;
    deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);

    const da2 = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: otherDepartment.id,
    });
    otherDeptAdmin = da2.user;
    otherDeptAdminToken = await tokenFor(otherDeptAdmin, ['department_admin']);

    const ca = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdmin = ca.user;
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
  });

  afterAll(async () => {
    // Jest schedules integration test files largest-first when there's no
    // timing cache, which can run this suite before citizenAuth/
    // tokenRefreshLogout. Those rely on auth.service.js#resolveSingleActiveTenant
    // (exactly one active tenant, the documented Phase-1 pilot assumption —
    // see NEXT_TASKS.md's multi-tenant-resolution item). Deactivating this
    // suite's own tenant afterward keeps that invariant true for whichever
    // suite runs next, regardless of file scheduling order.
    await tenant.update({ status: 'suspended' }).catch(() => {});
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  function registerPayload(overrides = {}) {
    return {
      description: 'There is a large pothole on the main road near the bus stop.',
      categoryId: category.id,
      location: { addressText: '12 Main Road' },
      languageCode: 'en',
      ...overrides,
    };
  }

  async function registerComplaint(overrides = {}) {
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send(registerPayload(overrides))
      .expect(202);
    return res.body.data;
  }

  // --- Workflow: full lifecycle ---------------------------------------------
  describe('workflow: full lifecycle', () => {
    test('Registered -> Assigned -> Resolved -> Closed -> Reopened, with timeline at every step', async () => {
      const registered = await registerComplaint();
      expect(registered.trackingId).toMatch(/^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$/);
      expect(registered.statusLabel).toBe('Registered');
      const complaintId = registered.id;

      let timeline = await request(app)
        .get(`/api/v1/complaints/${complaintId}/timeline`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(timeline.body.data).toHaveLength(1);
      expect(timeline.body.data[0].toStatusLabel).toBe('Registered');
      expect(timeline.body.data[0].fromStatusLabel).toBeNull();

      // Officer cannot view before assignment.
      await request(app)
        .get(`/api/v1/complaints/${complaintId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);

      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });

      const created = await request(app)
        .post(`/api/v1/complaints/${complaintId}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id, reason: 'Nearest available officer' })
        .expect(201);
      expect(created.body.data.officerId).toBe(String(officerProfile.id));

      timeline = await request(app)
        .get(`/api/v1/complaints/${complaintId}/timeline`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(timeline.body.data).toHaveLength(2);
      expect(timeline.body.data[0].toStatusLabel).toBe('Assigned');

      // Officer can now view.
      const details = await request(app)
        .get(`/api/v1/complaints/${complaintId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      expect(details.body.data.statusLabel).toBe('Assigned');
      expect(details.body.data.currentOfficer.id).toBe(String(officerProfile.id));

      const resolved = await request(app)
        .post(`/api/v1/complaints/${complaintId}/resolution`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ resolutionNote: 'Pothole has been filled and repaved.' })
        .expect(201);
      expect(resolved.body.data.statusLabel).toBe('Resolved');

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/resolution`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ resolutionNote: 'Second resolution attempt should fail.' })
        .expect(409);

      const closed = await request(app)
        .post(`/api/v1/complaints/${complaintId}/closure`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ closureReasonId: '1', remarks: 'Citizen notified.' })
        .expect(201);
      expect(closed.body.data.statusLabel).toBe('Closed');

      await request(app)
        .patch(`/api/v1/complaints/${complaintId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ severity: 'high' })
        .expect(409);

      const feedback = await request(app)
        .post(`/api/v1/complaints/${complaintId}/feedback`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ rating: 4, comment: 'Resolved quickly, thank you.' })
        .expect(201);
      expect(feedback.body.data.rating).toBe(4);

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/feedback`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ rating: 5 })
        .expect(409);

      const reopened = await request(app)
        .post(`/api/v1/complaints/${complaintId}/reopen`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ reason: 'The pothole has reappeared after one week.' })
        .expect(201);
      expect(reopened.body.data.statusLabel).toBe('Reopened');

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/reopen`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ reason: 'Trying to reopen an already-reopened complaint.' })
        .expect(409);

      timeline = await request(app)
        .get(`/api/v1/complaints/${complaintId}/timeline`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(timeline.body.data.map((e) => e.toStatusLabel)).toEqual([
        'Reopened',
        'Closed',
        'Resolved',
        'Assigned',
        'Registered',
      ]);
    });
  });

  // --- Assignment tests -------------------------------------------------------
  describe('assignment', () => {
    test('reassignment closes the previous assignment and appends a new one', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(201);

      const secondOfficer = await createStaffUser({
        tenantId: tenant.id,
        userType: 'officer',
        departmentId: department.id,
      });
      const secondProfile = await StaffProfile.findOne({ where: { userId: secondOfficer.user.id } });

      const reassigned = await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: secondProfile.id, reason: 'Reassigning to specialist' })
        .expect(201);
      expect(reassigned.body.data.officerId).toBe(String(secondProfile.id));

      const assignments = await ComplaintAssignment.findAll({ where: { complaintId: registered.id } });
      expect(assignments).toHaveLength(2);
      expect(assignments.find((a) => a.officerId === officerProfile.id).unassignedAt).not.toBeNull();
      expect(assignments.find((a) => a.officerId === secondProfile.id).unassignedAt).toBeNull();
    });

    test('assigning an officer outside the complaint department is rejected (422 OFFICER_OUT_OF_SCOPE)', async () => {
      const registered = await registerComplaint();
      const outOfScopeProfile = await StaffProfile.findOne({
        where: { userId: otherDeptOfficer.id },
      });
      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: outOfScopeProfile.id })
        .expect(422);
      expect(res.body.error.code).toBe('OFFICER_OUT_OF_SCOPE');
    });

    test('a Department Admin cannot assign officers on a complaint outside their own department (403)', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${otherDeptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('a closed complaint cannot be (re)assigned (409 COMPLAINT_ALREADY_CLOSED)', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(201);
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/resolution`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ resolutionNote: 'Resolved for closure test.' })
        .expect(201);
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/closure`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ closureReasonId: '1' })
        .expect(201);

      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(409);
      expect(res.body.error.code).toBe('COMPLAINT_ALREADY_CLOSED');
    });

    test('permission: an Officer cannot assign complaints (403)', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ officerId: officerProfile.id })
        .expect(403);
    });
  });

  // --- RBAC tests --------------------------------------------------------------
  describe('RBAC', () => {
    test('a citizen cannot access another citizen\'s complaint (403)', async () => {
      const registered = await registerComplaint();
      const res = await request(app)
        .get(`/api/v1/complaints/${registered.id}`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('a citizen cannot list the officer/admin queue (403)', async () => {
      await request(app).get('/api/v1/complaints').set('Authorization', `Bearer ${citizenToken}`).expect(403);
    });

    test('unauthenticated requests are rejected (401)', async () => {
      await request(app).get('/api/v1/complaints').expect(401);
    });

    test('Corporation Admin can access any complaint in the tenant regardless of department', async () => {
      const registered = await registerComplaint();
      await request(app)
        .get(`/api/v1/complaints/${registered.id}`)
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
    });
  });

  // --- Validation tests ----------------------------------------------------
  describe('validation', () => {
    test('categoryId is required (400)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(registerPayload({ categoryId: undefined }))
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('location requires wardId or addressText (400)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(registerPayload({ location: {} }))
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('description shorter than 10 characters is rejected (400)', async () => {
      await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(registerPayload({ description: 'short' }))
        .expect(400);
    });

    test('invalid languageCode is rejected (400)', async () => {
      await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(registerPayload({ languageCode: 'fr' }))
        .expect(400);
    });

    test('non-existent categoryId is rejected (422 CATEGORY_NOT_FOUND)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(registerPayload({ categoryId: 999999 }))
        .expect(422);
      expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    test('feedback rating out of range is rejected (400)', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(201);
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/resolution`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ resolutionNote: 'Resolved for feedback validation test.' })
        .expect(201);

      await request(app)
        .post(`/api/v1/complaints/${registered.id}/feedback`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ rating: 7 })
        .expect(400);
    });

    test('a malformed tracking ID is rejected (400)', async () => {
      await request(app)
        .get('/api/v1/complaints/track/not-a-valid-id')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(400);
    });
  });

  // --- Tracking tests --------------------------------------------------------
  describe('tracking', () => {
    test('the filing citizen can track by trackingId; another citizen cannot (403); unknown id is 404', async () => {
      const registered = await registerComplaint();

      const own = await request(app)
        .get(`/api/v1/complaints/track/${registered.trackingId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      expect(own.body.data.statusLabel).toBe('Registered');

      await request(app)
        .get(`/api/v1/complaints/track/${registered.trackingId}`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .expect(403);

      const suffix = uniqueSuffix().slice(0, 6).toUpperCase();
      const fakeButWellFormed = `ZZ-ZZ-202601-${suffix.replace(/[^0-9]/g, '1').padStart(6, '0')}`;
      await request(app)
        .get(`/api/v1/complaints/track/${fakeButWellFormed}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(404);
    });
  });

  // --- Attachment tests --------------------------------------------------------
  describe('attachments', () => {
    test('the owning citizen can upload a valid image attachment (202)', async () => {
      const registered = await registerComplaint();
      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/attachments`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', PNG_BUFFER, 'pothole.png')
        .expect(202);
      expect(res.body.data.virusScanStatus).toBe('pending');
    });

    test('a non-image file is rejected by magic-byte inspection (415)', async () => {
      const registered = await registerComplaint();
      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/attachments`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', GARBAGE_BUFFER, 'notes.txt')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    test('a non-owning citizen cannot upload an attachment (403)', async () => {
      const registered = await registerComplaint();
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/attachments`)
        .set('Authorization', `Bearer ${otherCitizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', PNG_BUFFER, 'pothole.png')
        .expect(403);
    });

    test('a complaint may have at most 5 attachments (422 MAX_ATTACHMENTS_EXCEEDED)', async () => {
      const registered = await registerComplaint();
      for (let i = 0; i < 5; i += 1) {
        await request(app)
          .post(`/api/v1/complaints/${registered.id}/attachments`)
          .set('Authorization', `Bearer ${citizenToken}`)
          .field('assetCategory', 'image')
          .attach('file', PNG_BUFFER, `photo-${i}.png`)
          .expect(202);
      }
      const res = await request(app)
        .post(`/api/v1/complaints/${registered.id}/attachments`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .field('assetCategory', 'image')
        .attach('file', PNG_BUFFER, 'photo-6.png')
        .expect(422);
      expect(res.body.error.code).toBe('MAX_ATTACHMENTS_EXCEEDED');
    });
  });

  // --- Voice complaint tests ---------------------------------------------------
  describe('voice complaint (out of scope this phase)', () => {
    test('a well-formed audio file passes validation but is rejected 501 NOT_ENABLED', async () => {
      const res = await request(app)
        .post('/api/v1/complaints/voice')
        .set('Authorization', `Bearer ${citizenToken}`)
        .attach('audioFile', WAV_BUFFER, 'complaint.wav')
        .expect(501);
      expect(res.body.error.code).toBe('NOT_ENABLED');
    });

    test('a non-audio file is rejected before reaching the 501 (415)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints/voice')
        .set('Authorization', `Bearer ${citizenToken}`)
        .attach('audioFile', GARBAGE_BUFFER, 'notes.txt')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    test('a missing audioFile is rejected (400)', async () => {
      await request(app)
        .post('/api/v1/complaints/voice')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(400);
    });
  });

  // --- List / queue scoping ------------------------------------------------
  describe('list — officer/admin queue scoping', () => {
    test('an Officer only sees complaints in their own department', async () => {
      const ownDeptComplaint = await registerComplaint();
      const otherCategory = await createCategory({ tenantId: tenant.id, departmentId: otherDepartment.id });
      const otherDeptComplaint = await registerComplaint({ categoryId: otherCategory.id });

      const res = await request(app)
        .get('/api/v1/complaints')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      const ids = res.body.data.map((c) => c.id);
      expect(ids).toContain(ownDeptComplaint.id);
      expect(ids).not.toContain(otherDeptComplaint.id);
    });

    test('filtering by priority narrows the result set', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .query({ priority: 'high' })
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // --- Update tests -----------------------------------------------------------
  describe('update', () => {
    test('the assigned Officer can correct the priority; SLA recompute runs without error even with no matching rule', async () => {
      const registered = await registerComplaint();
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });
      await request(app)
        .post(`/api/v1/complaints/${registered.id}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(201);

      const res = await request(app)
        .patch(`/api/v1/complaints/${registered.id}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ priority: 'critical' })
        .expect(200);
      expect(res.body.data.priority).toBe('critical');
    });

    test('an unassigned Officer cannot update a complaint (403)', async () => {
      const registered = await registerComplaint();
      await request(app)
        .patch(`/api/v1/complaints/${registered.id}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ priority: 'critical' })
        .expect(403);
    });

    test('a Citizen cannot call Update Complaint (403)', async () => {
      const registered = await registerComplaint();
      await request(app)
        .patch(`/api/v1/complaints/${registered.id}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ priority: 'low' })
        .expect(403);
    });
  });

  // --- Domain events (notification_event rows, for the future Notification
  // module to consume — API_SPECIFICATION.md's "publish internal domain
  // events" contract; no event bus/queue is invented, see
  // src/repositories/complaint.repository.js#publishEvent) --------------------
  describe('domain events', () => {
    test('every lifecycle transition writes a matching notification_event row', async () => {
      const registered = await registerComplaint();
      const complaintId = Number(registered.id);
      const officerProfile = await StaffProfile.findOne({ where: { userId: officer.id } });

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/assignments`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .send({ officerId: officerProfile.id })
        .expect(201);

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/resolution`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ resolutionNote: 'Resolved for the domain-events test.' })
        .expect(201);

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/closure`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ closureReasonId: '1' })
        .expect(201);

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/feedback`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ rating: 5, comment: 'Great work.' })
        .expect(201);

      await request(app)
        .post(`/api/v1/complaints/${complaintId}/reopen`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ reason: 'Issue reappeared, testing the reopen domain event.' })
        .expect(201);

      const events = await NotificationEvent.findAll({ where: { complaintId } });
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          'ComplaintCreated',
          'ComplaintAssigned',
          'ComplaintResolved',
          'ComplaintClosed',
          'CitizenFeedbackReceived',
          'ComplaintReopened',
        ]),
      );
      expect(events.every((e) => e.tenantId === tenant.id)).toBe(true);
    });
  });
});
