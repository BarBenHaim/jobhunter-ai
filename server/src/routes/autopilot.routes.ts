import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  runAutoPilot,
  getAutoPilotStatus,
  getAutoPilotRuns,
  getAutoPilotLog,
  getApprovalQueue,
  approveApplication,
  rejectApplication,
  approveAll,
  updateAutoPilotConfig,
} from '../services/autopilot.service';
import logger from '../utils/logger';

const router = Router();
router.use(authMiddleware);

// GET /api/autopilot/status — current state, last run, pending count
router.get('/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await getAutoPilotStatus(req.userId!);
  res.json({ success: true, data: status });
}));

// PATCH /api/autopilot/config — update configuration
router.patch('/config', asyncHandler(async (req: AuthRequest, res: Response) => {
  const config = await updateAutoPilotConfig(req.userId!, req.body);
  res.json({ success: true, data: config });
}));

// POST /api/autopilot/start — manually trigger a run
router.post('/start', asyncHandler(async (req: AuthRequest, res: Response) => {
  logger.info(`[AutoPilot] Manual trigger by user ${req.userId}`);
  // Run async — don't wait for completion
  const resultPromise = runAutoPilot(req.userId!, 'MANUAL');

  // Wait a bit to see if it starts ok, then return
  const result = await Promise.race([
    resultPromise,
    new Promise(resolve => setTimeout(() => resolve({ started: true }), 2000)),
  ]);

  if ((result as any).skipped) {
    return res.json({ success: true, data: result });
  }

  res.json({ success: true, data: { started: true, ...(result as any) } });

  // If the full result hasn't resolved yet, it continues in background
  resultPromise.catch(err => {
    logger.error(`[AutoPilot] Background run failed for user ${req.userId}`, err);
  });
}));

// POST /api/autopilot/stop — cancel active run + disable
router.post('/stop', asyncHandler(async (req: AuthRequest, res: Response) => {
  const config = await updateAutoPilotConfig(req.userId!, { enabled: false });
  res.json({ success: true, data: { config, message: 'AutoPilot disabled' } });
}));

// POST /api/autopilot/pause — pause until date
router.post('/pause', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { until } = req.body;
  const pausedUntil = until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const config = await updateAutoPilotConfig(req.userId!, { pausedUntil });
  res.json({ success: true, data: config });
}));

// GET /api/autopilot/runs — list runs
router.get('/runs', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;
  const data = await getAutoPilotRuns(req.userId!, limit, offset);
  res.json({ success: true, data });
}));

// GET /api/autopilot/log — activity feed
router.get('/log', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const eventType = req.query.eventType as string | undefined;
  const data = await getAutoPilotLog(req.userId!, limit, offset, eventType);
  res.json({ success: true, data });
}));

// GET /api/autopilot/queue — approval queue
router.get('/queue', asyncHandler(async (req: AuthRequest, res: Response) => {
  const queue = await getApprovalQueue(req.userId!);
  res.json({ success: true, data: queue });
}));

// POST /api/autopilot/queue/:id/approve
router.post('/queue/:id/approve', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await approveApplication(req.params.id, req.userId!);
  res.json({ success: true, data: result });
}));

// POST /api/autopilot/queue/:id/reject
router.post('/queue/:id/reject', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await rejectApplication(req.params.id, req.userId!, req.body.reason);
  res.json({ success: true, data: result });
}));

// POST /api/autopilot/queue/approve-all
router.post('/queue/approve-all', asyncHandler(async (req: AuthRequest, res: Response) => {
  const minScore = req.body.minScore || 0;
  const result = await approveAll(req.userId!, minScore);
  res.json({ success: true, data: result });
}));

export default router;
