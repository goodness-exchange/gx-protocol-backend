import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';

/**
 * Admin Routes
 *
 * Handles administrative operations for user management and KYC review.
 *
 * NOTE: These routes should be protected by admin authentication in production.
 * Currently open for development/testing purposes.
 */

const router = Router();

/**
 * GET /api/v1/admin/users
 * List users with optional status filter
 *
 * @query status - Filter by user status (REGISTERED, PENDING_ADMIN_APPROVAL, ACTIVE, etc.)
 * @query page - Page number (default: 1)
 * @query pageSize - Items per page (default: 20)
 * @returns {users: UserListItem[], total: number, page: number, pageSize: number}
 */
router.get('/users', adminController.listUsers);

/**
 * GET /api/v1/admin/users/:id
 * Get detailed user information for admin review
 *
 * @param id - User profile ID (UUID)
 * @returns {user: UserProfile with KYC and Address relations}
 */
router.get('/users/:id', adminController.getUserDetails);

/**
 * POST /api/v1/admin/users/:id/approve
 * Approve user KYC and activate account
 *
 * @param id - User profile ID (UUID)
 * @body {notes?: string} - Optional admin notes
 * @returns {success: true, message: string}
 */
router.post('/users/:id/approve', adminController.approveUser);

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject user KYC
 *
 * @param id - User profile ID (UUID)
 * @body {reason: string} - Rejection reason (required)
 * @returns {success: true, message: string}
 */
router.post('/users/:id/reject', adminController.rejectUser);

export default router;
