import { AppDataSource } from '../data-source';
import * as bcrypt from 'bcrypt';

async function seed() {
  await AppDataSource.initialize();
  console.log('📦 Database connection initialized');

  const userRepository = AppDataSource.getRepository('users');

  // Check if admin exists
  const existingAdmin = await userRepository.findOne({
    where: { email: 'admin@taskmanager.com' },
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists, skipping seed');
    await AppDataSource.destroy();
    return;
  }

  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  const hashedPassword = await bcrypt.hash('Admin@123456', bcryptRounds);

  // Create admin user
  const admin = userRepository.create({
    email: 'admin@taskmanager.com',
    username: 'admin',
    password: hashedPassword,
    firstName: 'System',
    lastName: 'Administrator',
    role: 'admin',
    isActive: true,
  });

  await userRepository.save(admin);
  console.log('✅ Admin user created successfully');
  console.log('   Email: admin@taskmanager.com');
  console.log('   Password: Admin@123456');

  // Create a demo user
  const demoPassword = await bcrypt.hash('Demo@123456', bcryptRounds);
  const demoUser = userRepository.create({
    email: 'demo@taskmanager.com',
    username: 'demouser',
    password: demoPassword,
    firstName: 'Demo',
    lastName: 'User',
    role: 'user',
    isActive: true,
  });

  await userRepository.save(demoUser);
  console.log('✅ Demo user created successfully');
  console.log('   Email: demo@taskmanager.com');
  console.log('   Password: Demo@123456');

  // Create sample tasks for demo user
  const taskRepository = AppDataSource.getRepository('tasks');

  const sampleTasks = [
    {
      title: 'Setup project environment',
      description: 'Install dependencies and configure the development environment',
      status: 'done',
      priority: 'high',
      userId: demoUser.id,
    },
    {
      title: 'Design database schema',
      description: 'Create ERD and define all table relationships',
      status: 'done',
      priority: 'high',
      userId: demoUser.id,
    },
    {
      title: 'Implement authentication module',
      description: 'JWT authentication with refresh tokens',
      status: 'in_progress',
      priority: 'urgent',
      userId: demoUser.id,
    },
    {
      title: 'Write unit tests',
      description: 'Add test coverage for all services',
      status: 'todo',
      priority: 'medium',
      userId: demoUser.id,
    },
    {
      title: 'Deploy to production',
      description: 'Configure CI/CD pipeline and deploy',
      status: 'todo',
      priority: 'low',
      userId: demoUser.id,
    },
  ];

  await taskRepository.save(sampleTasks.map((t) => taskRepository.create(t)));
  console.log('✅ Sample tasks created for demo user');

  await AppDataSource.destroy();
  console.log('🎉 Seed completed successfully!');
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
