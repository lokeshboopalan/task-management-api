import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../entities/task.entity';
import { TaskFilterDto } from '../dto/task.dto';
import { IPaginatedResult } from '../../common/interfaces';

@Injectable()
export class TaskRepository {
  constructor(
    @InjectRepository(Task)
    private readonly repository: Repository<Task>,
  ) {}

  /**
   * Advanced filtering with QueryBuilder — supports search, status, priority,
   * pagination, and dynamic sorting
   */
  async findWithFilters(
    filters: TaskFilterDto,
    userId?: string,
  ): Promise<IPaginatedResult<Task>> {
    const {
      status,
      priority,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filters;

    const qb = this.repository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .select([
        'task.id',
        'task.title',
        'task.description',
        'task.status',
        'task.priority',
        'task.dueDate',
        'task.createdAt',
        'task.updatedAt',
        'task.userId',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
        'user.email',
      ]);

    // Scope to specific user (non-admins only see their tasks)
    if (userId) {
      qb.where('task.userId = :userId', { userId });
    }

    // Filter by status
    if (status) {
      qb.andWhere('task.status = :status', { status });
    }

    // Filter by priority
    if (priority) {
      qb.andWhere('task.priority = :priority', { priority });
    }

    // Full-text search on title and description
    if (search) {
      qb.andWhere(
        '(LOWER(task.title) LIKE :search OR LOWER(task.description) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    // Sorting
    const allowedSortFields = ['createdAt', 'updatedAt', 'title', 'status', 'priority', 'dueDate'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`task.${safeSortBy}`, safeSortOrder);

    // Pagination
    const offset = (page - 1) * limit;
    qb.skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Task | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByIdAndUser(id: string, userId: string): Promise<Task | null> {
    return this.repository.findOne({
      where: { id, userId },
    });
  }

  async create(data: Partial<Task>): Promise<Task> {
    const task = this.repository.create(data);
    return this.repository.save(task);
  }

  async update(id: string, data: Partial<Task>): Promise<Task | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async countByUser(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }
}
