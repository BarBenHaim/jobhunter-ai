import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, DatabaseError } from '../utils/errors';

export abstract class BaseService<T> {
  protected model: string;

  constructor(model: string) {
    this.model = model;
  }

  protected async handleError(error: unknown, operation: string): Promise<never> {
    logger.error(`Error in ${operation}:`, error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to ${operation} ${this.model}`);
  }

  protected logOperation(operation: string, data: any): void {
    logger.info(`${operation} ${this.model}:`, {
      model: this.model,
      operation,
      timestamp: new Date().toISOString(),
    });
  }
}

export class CRUDService<T extends { id: string }> extends BaseService<T> {
  constructor(model: string) {
    super(model);
  }

  protected get db() {
    return (prisma as any)[this.model];
  }

  async findById(id: string): Promise<T | null> {
    try {
      this.logOperation('findById', { id });
      return await this.db.findUnique({ where: { id } });
    } catch (error) {
      return await this.handleError(error, 'findById');
    }
  }

  async findOne(where: Record<string, any>): Promise<T | null> {
    try {
      this.logOperation('findOne', { where });
      return await this.db.findFirst({ where });
    } catch (error) {
      return await this.handleError(error, 'findOne');
    }
  }

  async findMany(
    where?: Record<string, any>,
    options?: { take?: number; skip?: number; orderBy?: Record<string, string> }
  ): Promise<T[]> {
    try {
      this.logOperation('findMany', { where, options });
      return await this.db.findMany({
        where,
        take: options?.take,
        skip: options?.skip,
        orderBy: options?.orderBy,
      });
    } catch (error) {
      return await this.handleError(error, 'findMany');
    }
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    try {
      this.logOperation('create', data);
      return await this.db.create({ data });
    } catch (error) {
      return await this.handleError(error, 'create');
    }
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError(`${this.model} with id ${id} not found`);
      }
      this.logOperation('update', { id, data });
      return await this.db.update({
        where: { id },
        data,
      });
    } catch (error) {
      return await this.handleError(error, 'update');
    }
  }

  async delete(id: string): Promise<T> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError(`${this.model} with id ${id} not found`);
      }
      this.logOperation('delete', { id });
      return await this.db.delete({ where: { id } });
    } catch (error) {
      return await this.handleError(error, 'delete');
    }
  }

  async count(where?: Record<string, any>): Promise<number> {
    try {
      this.logOperation('count', { where });
      return await this.db.count({ where });
    } catch (error) {
      return await this.handleError(error, 'count');
    }
  }

  async exists(where: Record<string, any>): Promise<boolean> {
    try {
      const count = await this.count(where);
      return count > 0;
    } catch (error) {
      return await this.handleError(error, 'exists');
    }
  }
}
