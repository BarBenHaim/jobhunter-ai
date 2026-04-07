import express, { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { costTracker } from '../services/cost-tracker.service';

const router = express.Router();

/**
 * GET /api/costs/today
 * Returns today's API costs summary
 * No authentication required
 */
router.get('/today', asyncHandler(async (req: Request, res: Response) => {
  const costs = costTracker.getTodayCosts();
  res.json({
    success: true,
    data: costs,
  });
}));

/**
 * GET /api/costs/history
 * Returns detailed call history for today
 * No authentication required
 */
router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const history = costTracker.getCallHistory();
  res.json({
    success: true,
    data: history,
  });
}));

/**
 * POST /api/costs/reset
 * Resets cost counters (for testing/development)
 * No authentication required
 */
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  costTracker.resetCounters();
  res.json({
    success: true,
    message: 'Cost counters reset',
  });
}));

export default router;
