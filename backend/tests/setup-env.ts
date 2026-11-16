import path from 'node:path';
import os from 'node:os';

// Tests run against a separate database. Override with TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL || 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'taskflow-test-uploads');
process.env.MAX_UPLOAD_MB = '1';
process.env.ALLOW_SIGNUP = 'true';
process.env.CRON_SECRET = 'test-cron-secret';
