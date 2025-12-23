import { db } from '@gx/core-db';

/**
 * Transaction Categories Service
 *
 * Manages user-defined categories for transaction tagging and organization.
 * Categories help users track spending patterns and generate better analytics.
 *
 * Features:
 * - Create custom categories with colors and icons
 * - System-defined default categories
 * - Tag transactions with multiple categories
 * - Category-based analytics
 */

export interface TransactionCategoryDTO {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  isSystem: boolean;
  isIncome: boolean;
  isActive: boolean;
  sortOrder: number;
  transactionCount?: number;
  createdAt: Date;
}

export interface CreateCategoryDTO {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isIncome?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryDTO {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface TransactionTagDTO {
  id: string;
  transactionId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  notes: string | null;
  createdAt: Date;
}

// Default system categories created for new users
const DEFAULT_CATEGORIES = [
  { name: 'Salary', color: '#22C55E', icon: 'banknotes', isIncome: true, sortOrder: 0 },
  { name: 'Freelance', color: '#14B8A6', icon: 'laptop', isIncome: true, sortOrder: 1 },
  { name: 'Investment', color: '#6366F1', icon: 'trending-up', isIncome: true, sortOrder: 2 },
  { name: 'Gift Received', color: '#EC4899', icon: 'gift', isIncome: true, sortOrder: 3 },
  { name: 'Shopping', color: '#F59E0B', icon: 'shopping-cart', isIncome: false, sortOrder: 10 },
  { name: 'Food & Dining', color: '#EF4444', icon: 'utensils', isIncome: false, sortOrder: 11 },
  { name: 'Transportation', color: '#3B82F6', icon: 'car', isIncome: false, sortOrder: 12 },
  { name: 'Bills & Utilities', color: '#8B5CF6', icon: 'file-text', isIncome: false, sortOrder: 13 },
  { name: 'Entertainment', color: '#EC4899', icon: 'film', isIncome: false, sortOrder: 14 },
  { name: 'Healthcare', color: '#06B6D4', icon: 'heart-pulse', isIncome: false, sortOrder: 15 },
  { name: 'Education', color: '#6366F1', icon: 'graduation-cap', isIncome: false, sortOrder: 16 },
  { name: 'Transfer', color: '#64748B', icon: 'arrow-right-left', isIncome: false, sortOrder: 17 },
  { name: 'Other', color: '#6B7280', icon: 'more-horizontal', isIncome: false, sortOrder: 99 },
];

class CategoriesService {
  private readonly tenantId = 'default';

  /**
   * Get all categories for a user
   */
  async getCategories(
    profileId: string,
    includeTransactionCount: boolean = false
  ): Promise<TransactionCategoryDTO[]> {
    const categories = await db.transactionCategory.findMany({
      where: {
        tenantId: this.tenantId,
        profileId,
      },
      include: includeTransactionCount
        ? {
            _count: {
              select: { tags: true },
            },
          }
        : undefined,
      orderBy: [
        { isActive: 'desc' },
        { isIncome: 'desc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      isSystem: cat.isSystem,
      isIncome: cat.isIncome,
      isActive: cat.isActive,
      sortOrder: cat.sortOrder,
      transactionCount: cat._count?.tags,
      createdAt: cat.createdAt,
    }));
  }

  /**
   * Get a single category
   */
  async getCategory(profileId: string, categoryId: string): Promise<TransactionCategoryDTO | null> {
    const category = await db.transactionCategory.findFirst({
      where: {
        id: categoryId,
        tenantId: this.tenantId,
        profileId,
      },
      include: {
        _count: {
          select: { tags: true },
        },
      },
    });

    if (!category) {
      return null;
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      icon: category.icon,
      isSystem: category.isSystem,
      isIncome: category.isIncome,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      transactionCount: category._count.tags,
      createdAt: category.createdAt,
    };
  }

  /**
   * Create a new category
   */
  async createCategory(profileId: string, data: CreateCategoryDTO): Promise<TransactionCategoryDTO> {
    // Check for duplicate name
    const existing = await db.transactionCategory.findFirst({
      where: {
        tenantId: this.tenantId,
        profileId,
        name: data.name,
      },
    });

    if (existing) {
      throw new Error('Category with this name already exists');
    }

    // Get next sort order if not provided
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const maxSort = await db.transactionCategory.aggregate({
        where: {
          tenantId: this.tenantId,
          profileId,
        },
        _max: { sortOrder: true },
      });
      sortOrder = (maxSort._max.sortOrder || 0) + 1;
    }

    const category = await db.transactionCategory.create({
      data: {
        tenantId: this.tenantId,
        profileId,
        name: data.name,
        description: data.description,
        color: data.color || '#6366F1',
        icon: data.icon,
        isIncome: data.isIncome || false,
        isSystem: false,
        sortOrder,
      },
    });

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      icon: category.icon,
      isSystem: category.isSystem,
      isIncome: category.isIncome,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      transactionCount: 0,
      createdAt: category.createdAt,
    };
  }

  /**
   * Update a category
   */
  async updateCategory(
    profileId: string,
    categoryId: string,
    data: UpdateCategoryDTO
  ): Promise<TransactionCategoryDTO> {
    const category = await db.transactionCategory.findFirst({
      where: {
        id: categoryId,
        tenantId: this.tenantId,
        profileId,
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Check for duplicate name if name is being changed
    if (data.name && data.name !== category.name) {
      const existing = await db.transactionCategory.findFirst({
        where: {
          tenantId: this.tenantId,
          profileId,
          name: data.name,
          id: { not: categoryId },
        },
      });

      if (existing) {
        throw new Error('Category with this name already exists');
      }
    }

    const updated = await db.transactionCategory.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        description: data.description,
        color: data.color,
        icon: data.icon,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
      include: {
        _count: {
          select: { tags: true },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      icon: updated.icon,
      isSystem: updated.isSystem,
      isIncome: updated.isIncome,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      transactionCount: updated._count.tags,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Delete a category (only non-system categories)
   */
  async deleteCategory(profileId: string, categoryId: string): Promise<void> {
    const category = await db.transactionCategory.findFirst({
      where: {
        id: categoryId,
        tenantId: this.tenantId,
        profileId,
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    if (category.isSystem) {
      throw new Error('Cannot delete system category');
    }

    // Delete all associated tags first (cascade should handle, but be explicit)
    await db.transactionTag.deleteMany({
      where: { categoryId },
    });

    await db.transactionCategory.delete({
      where: { id: categoryId },
    });
  }

  /**
   * Tag a transaction with a category
   */
  async tagTransaction(
    profileId: string,
    transactionId: string,
    categoryId: string,
    notes?: string
  ): Promise<TransactionTagDTO> {
    // Verify category belongs to user
    const category = await db.transactionCategory.findFirst({
      where: {
        id: categoryId,
        tenantId: this.tenantId,
        profileId,
        isActive: true,
      },
    });

    if (!category) {
      throw new Error('Category not found or not active');
    }

    // Verify transaction exists and belongs to user's wallet
    const transaction = await db.transaction.findFirst({
      where: {
        offTxId: transactionId,
        wallet: {
          profileId,
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found or access denied');
    }

    // Check if already tagged with this category
    const existingTag = await db.transactionTag.findFirst({
      where: {
        tenantId: this.tenantId,
        transactionId,
        categoryId,
      },
    });

    if (existingTag) {
      throw new Error('Transaction already tagged with this category');
    }

    const tag = await db.transactionTag.create({
      data: {
        tenantId: this.tenantId,
        transactionId,
        categoryId,
        notes,
      },
    });

    return {
      id: tag.id,
      transactionId: tag.transactionId,
      categoryId: tag.categoryId,
      categoryName: category.name,
      categoryColor: category.color,
      notes: tag.notes,
      createdAt: tag.createdAt,
    };
  }

  /**
   * Remove a tag from a transaction
   */
  async untagTransaction(profileId: string, tagId: string): Promise<void> {
    const tag = await db.transactionTag.findFirst({
      where: {
        id: tagId,
      },
      include: {
        category: true,
      },
    });

    if (!tag || tag.category.profileId !== profileId) {
      throw new Error('Tag not found or access denied');
    }

    await db.transactionTag.delete({
      where: { id: tagId },
    });
  }

  /**
   * Get all tags for a transaction
   */
  async getTransactionTags(transactionId: string): Promise<TransactionTagDTO[]> {
    const tags = await db.transactionTag.findMany({
      where: { transactionId },
      include: {
        category: {
          select: {
            name: true,
            color: true,
          },
        },
      },
    });

    return tags.map((tag) => ({
      id: tag.id,
      transactionId: tag.transactionId,
      categoryId: tag.categoryId,
      categoryName: tag.category.name,
      categoryColor: tag.category.color,
      notes: tag.notes,
      createdAt: tag.createdAt,
    }));
  }

  /**
   * Get transactions by category
   */
  async getTransactionsByCategory(
    profileId: string,
    categoryId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: Array<{
      transactionId: string;
      type: string;
      amount: number;
      counterparty: string | null;
      timestamp: Date;
      notes: string | null;
    }>;
    total: number;
  }> {
    // Verify category belongs to user
    const category = await db.transactionCategory.findFirst({
      where: {
        id: categoryId,
        tenantId: this.tenantId,
        profileId,
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    const [tags, total] = await Promise.all([
      db.transactionTag.findMany({
        where: { categoryId },
        include: {
          transaction: true,
        },
        orderBy: {
          transaction: {
            timestamp: 'desc',
          },
        },
        take: limit,
        skip: offset,
      }),
      db.transactionTag.count({
        where: { categoryId },
      }),
    ]);

    return {
      transactions: tags.map((tag) => ({
        transactionId: tag.transaction.offTxId,
        type: tag.transaction.type,
        amount: Number(tag.transaction.amount),
        counterparty: tag.transaction.counterparty,
        timestamp: tag.transaction.timestamp,
        notes: tag.notes,
      })),
      total,
    };
  }

  /**
   * Initialize default categories for a new user
   */
  async initializeDefaultCategories(profileId: string): Promise<void> {
    // Check if user already has categories
    const existingCount = await db.transactionCategory.count({
      where: {
        tenantId: this.tenantId,
        profileId,
      },
    });

    if (existingCount > 0) {
      return; // Already initialized
    }

    // Create default categories
    await db.transactionCategory.createMany({
      data: DEFAULT_CATEGORIES.map((cat) => ({
        tenantId: this.tenantId,
        profileId,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        isIncome: cat.isIncome,
        isSystem: true,
        isActive: true,
        sortOrder: cat.sortOrder,
      })),
    });
  }

  /**
   * Get category spending summary for a period
   */
  async getCategorySpendingSummary(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<
    Array<{
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      isIncome: boolean;
      totalAmount: number;
      transactionCount: number;
    }>
  > {
    // Get all transactions in the period
    const transactions = await db.transaction.findMany({
      where: {
        wallet: {
          profileId,
        },
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    // Aggregate by category
    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        isIncome: boolean;
        totalAmount: number;
        transactionCount: number;
      }
    >();

    for (const tx of transactions) {
      for (const tag of tx.tags) {
        const existing = categoryMap.get(tag.categoryId);
        if (existing) {
          existing.totalAmount += Number(tx.amount);
          existing.transactionCount += 1;
        } else {
          categoryMap.set(tag.categoryId, {
            categoryId: tag.categoryId,
            categoryName: tag.category.name,
            categoryColor: tag.category.color,
            isIncome: tag.category.isIncome,
            totalAmount: Number(tx.amount),
            transactionCount: 1,
          });
        }
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }
}

export const categoriesService = new CategoriesService();
