import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Task } from '../../task/entities/task.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @ApiProperty({ description: 'Unique identifier', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User email address', example: 'john@example.com' })
  @Column({ unique: true, length: 255 })
  email: string;

  @ApiProperty({ description: 'Unique username', example: 'johndoe' })
  @Column({ unique: true, length: 100 })
  username: string;

  @Exclude()
  @Column({ length: 255 })
  password: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Column({ length: 100 })
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Doe' })
  @Column({ length: 100 })
  lastName: string;

  @ApiProperty({ description: 'User role', enum: UserRole, example: UserRole.USER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @ApiProperty({ description: 'Account active status', example: true })
  @Column({ default: true })
  isActive: boolean;

  @Exclude()
  @Column({ nullable: true })
  refreshToken: string;

  @OneToMany(() => Task, (task) => task.user, { cascade: true })
  tasks: Task[];

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual property
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
