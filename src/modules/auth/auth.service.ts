import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../user/entities/user.entity';
import { Task, TaskStatus, TaskPriority } from '../task/entities/task.entity';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import { JwtPayload, TokenPair } from '../common/interfaces';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register a new user with default tasks — wrapped in a transaction
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check for existing email or username
      const existingUser = await queryRunner.manager.findOne(User, {
        where: [{ email: registerDto.email }, { username: registerDto.username }],
      });

      if (existingUser) {
        if (existingUser.email === registerDto.email) {
          throw new ConflictException('An account with this email already exists');
        }
        throw new ConflictException('This username is already taken');
      }

      // Hash password
      const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 12;
      const hashedPassword = await bcrypt.hash(registerDto.password, bcryptRounds);

      // Create user
      const user = queryRunner.manager.create(User, {
        ...registerDto,
        password: hashedPassword,
        role: UserRole.USER,
        isActive: true,
      });

      const savedUser = await queryRunner.manager.save(User, user);

      // Create default onboarding tasks for new user
      const defaultTasks = [
        {
          title: 'Welcome to Task Manager! 🎉',
          description: 'You have successfully registered. Start by creating your first task.',
          status: TaskStatus.TODO,
          priority: TaskPriority.LOW,
          userId: savedUser.id,
        },
        {
          title: 'Complete your profile',
          description: 'Update your profile information to personalize your experience.',
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          userId: savedUser.id,
        },
      ];

      await queryRunner.manager.save(
        Task,
        defaultTasks.map((t) => queryRunner.manager.create(Task, t)),
      );

      await queryRunner.commitTransaction();
      this.logger.log(`New user registered: ${savedUser.email}`);

      // Emit event (fire-and-forget)
      this.eventEmitter.emit('user.created', { userId: savedUser.id, email: savedUser.email });

      // Generate tokens
      const tokens = await this.generateTokens(savedUser);
      await this.saveRefreshToken(savedUser.id, tokens.refreshToken);

      return this.buildAuthResponse(tokens);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Login with email/username and password
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: [{ email: loginDto.email }, { username: loginDto.email }],
      select: ['id', 'email', 'username', 'password', 'role', 'isActive'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return this.buildAuthResponse(tokens);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<AuthResponseDto> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: ['id', 'email', 'role', 'isActive', 'refreshToken'],
    });

    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException('Access denied. Please login again.');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token. Please login again.');
    }

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return this.buildAuthResponse(tokens);
  }

  /**
   * Logout — clear refresh token
   */
  async logout(userId: string): Promise<{ message: string }> {
    await this.dataSource
      .getRepository(User)
      .update(userId, { refreshToken: null });

    return { message: 'Logged out successfully' };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 12;
    const hashedRefreshToken = await bcrypt.hash(refreshToken, bcryptRounds);
    await this.dataSource
      .getRepository(User)
      .update(userId, { refreshToken: hashedRefreshToken });
  }

  private buildAuthResponse(tokens: TokenPair): AuthResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes in seconds
    };
  }
}
