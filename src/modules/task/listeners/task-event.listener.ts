import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

interface UserCreatedEvent {
  userId: string;
  email: string;
}

interface TaskCreatedEvent {
  taskId: string;
  title: string;
  userId: string;
}

@Injectable()
export class TaskEventListener {
  private readonly logger = new Logger(TaskEventListener.name);

  @OnEvent('user.created', { async: true })
  async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    this.logger.log(
      `[EVENT] user.created → User ID: ${event.userId} | Email: ${event.email}`,
    );
    // In production: send welcome email, provision workspace, notify admin, etc.
  }

  @OnEvent('task.created', { async: true })
  async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    this.logger.log(
      `[EVENT] task.created → Task ID: ${event.taskId} | Title: "${event.title}" | User: ${event.userId}`,
    );
    // In production: send notification, update analytics, trigger webhooks, etc.
  }
}
