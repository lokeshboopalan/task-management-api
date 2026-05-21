import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserRepository } from './repositories/user.repository';
import { IPaginatedResult } from '../common/interfaces';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}

  async findAll(page = 1, limit = 10): Promise<IPaginatedResult<User>> {
    const [data, total] = await this.userRepository.findAll(page, limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findByEmail(createUserDto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 12;
    const hashedPassword = await bcrypt.hash(createUserDto.password, bcryptRounds);

    const user = await this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    this.logger.log(`Admin created user: ${user.email}`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, requestingUserId: string, requestingUserRole: string): Promise<User> {
    const user = await this.findById(id);

    // Regular users can only update their own profile
    if (requestingUserRole !== 'admin' && id !== requestingUserId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const updated = await this.userRepository.update(id, updateUserDto);
    this.logger.log(`User ${id} updated by ${requestingUserId}`);
    return updated;
  }

  async deactivate(id: string): Promise<{ message: string }> {
    await this.findById(id); // Ensure user exists
    await this.userRepository.softDelete(id);
    this.logger.log(`User ${id} deactivated`);
    return { message: 'User deactivated successfully' };
  }

  async delete(id: string): Promise<{ message: string }> {
    await this.findById(id); // Ensure user exists
    await this.userRepository.hardDelete(id);
    this.logger.log(`User ${id} permanently deleted`);
    return { message: 'User permanently deleted' };
  }
}
