// Global environment variables required by the email services
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-jwt-signing-min32chars!!'
process.env.NEXTAUTH_URL    = 'http://localhost:3000'
process.env.REDIS_URL       = 'redis://localhost:6379'
process.env.EMAIL_FROM      = 'test@kids018.com'
