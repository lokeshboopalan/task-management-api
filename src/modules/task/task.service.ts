import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Task } from './entities/task.entity';
import { CreateTaskDto, UpdateTaskDto, TaskFilterDto } from './dto/task.dto';
import { TaskRepository } from './repositories/task.repository';
import { UserRole } from '../user/entities/user.entity';
import { IPaginatedResult } from '../common/interfaces';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  private readonly CACHE_PREFIX = 'tasks';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Get tasks with advanced filtering — cached per unique filter combination
   */
  async findAll(
    filters: TaskFilterDto,
    requestingUser: { id: string; role: string },
  ): Promise<IPaginatedResult<Task>> {
    // Admins can see all tasks, users only see their own
    const userId = requestingUser.role === UserRole.ADMIN ? undefined : requestingUser.id;

    // Build cache key from filters + user context
    const cacheKey = `${this.CACHE_PREFIX}:${userId || 'admin'}:${JSON.stringify(filters)}`;

    const cached = await this.cacheManager.get<IPaginatedResult<Task>>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Cache MISS: ${cacheKey}`);
    const result = await this.taskRepository.findWithFilters(filters, userId);

    await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Get single task — admin can see any, user only their own
   */
  async findOne(
    id: string,
    requestingUser: { id: string; role: string },
  ): Promise<Task> {
    const task = await this.taskRepository.findById(id);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    if (requestingUser.role !== UserRole.ADMIN && task.userId !== requestingUser.id) {
      throw new ForbiddenException('You do not have access to this task');
    }

    return task;
  }

  /**
   * Create a new task for the authenticated user
   */
  async create(
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<Task> {
    const task = await this.taskRepository.create({
      ...createTaskDto,
      userId,
    });

    this.logger.log(`Task created: ${task.id} by user: ${userId}`);

    // Emit event for async listeners
    this.eventEmitter.emit('task.created', {
      taskId: task.id,
      title: task.title,
      userId,
    });

    // Invalidate cached task lists for this user
    await this.invalidateUserCache(userId);

    return task;
  }

  /**
   * Update a task — users can only update their own tasks
   */
  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    requestingUser: { id: string; role: string },
  ): Promise<Task> {
    const task = await this.taskRepository.findById(id);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    if (requestingUser.role !== UserRole.ADMIN && task.userId !== requestingUser.id) {
      throw new ForbiddenException('You can only update your own tasks');
    }

    const updated = await this.taskRepository.update(id, updateTaskDto);

    // Invalidate cache
    await this.invalidateUserCache(task.userId);
    if (requestingUser.role === UserRole.ADMIN) {
      await this.invalidateAdminCache();
    }

    return updated;
  }

  /**
   * Delete a task — users can only delete their own tasks, admins can delete any
   */
  async delete(
    id: string,
    requestingUser: { id: string; role: string },
  ): Promise<{ message: string }> {
    const task = await this.taskRepository.findById(id);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    if (requestingUser.role !== UserRole.ADMIN && task.userId !== requestingUser.id) {
      throw new ForbiddenException('You can only delete your own tasks');
    }

    const ownerId = task.userId;
    await this.taskRepository.delete(id);

    // Invalidate cache
    await this.invalidateUserCache(ownerId);
    if (requestingUser.role === UserRole.ADMIN) {
      await this.invalidateAdminCache();
    }

    this.logger.log(`Task ${id} deleted by user ${requestingUser.id}`);
    return { message: 'Task deleted successfully' };
  }

  // ─── Cache Helpers ─────────────────────────────────────────────────────────

  private async invalidateUserCache(userId: string): Promise<void> {
    // Pattern-based invalidation — delete all cache keys for this user
    // Note: In production with Redis, use SCAN + DEL pattern
    await this.cacheManager.del(`${this.CACHE_PREFIX}:${userId}`);
    this.logger.debug(`Cache invalidated for user: ${userId}`);
  }

  private async invalidateAdminCache(): Promise<void> {
    await this.cacheManager.del(`${this.CACHE_PREFIX}:admin`);
    this.logger.debug('Admin task cache invalidated');
  }
}
