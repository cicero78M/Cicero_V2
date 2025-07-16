# CICERO_V2
*Last updated: 2026-04-01*

## Description

**Cicero_V2** is an automation system for monitoring, social media attendance, and content analytics (Instagram & TikTok) aimed at organizations and institutions. The backend supports multiple clients, automatically records likes and comments, and sends reports to WhatsApp administrators.

The full architecture is described in [docs/enterprise_architecture.md](docs/enterprise_architecture.md). Scheduled activities are listed in [docs/activity_schedule.md](docs/activity_schedule.md). See [docs/metadata_flow.md](docs/metadata_flow.md) for the metadata flow. Additional guides are available for [server migration](docs/server_migration.md), [RabbitMQ](docs/rabbitmq.md), [Redis](docs/redis.md), [database structure](docs/database_structure.md), [premium subscriptions](docs/premium_subscription.md), [Nginx configuration](docs/reverse_proxy_config.md), [PostgreSQL backups](docs/pg_backup_gdrive.md), [naming conventions](docs/naming_conventions.md), [WhatsApp user registration guide](docs/wa_user_registration.md), and [workflow & usage guide](docs/workflow_usage_guide.md).

## Requirements
- Node.js 20 or newer
- PostgreSQL and Redis (configure `.env` accordingly)
- Run `npm install` before starting

---

## Folder Structure

```
Cicero_V2/
├── app.js                       # Application entry point
├── package.json                 # NPM configuration
├── src/
│   ├── config/                  # Environment and Redis config
│   ├── db/                      # Database adapters
│   ├── controller/              # Express controllers
│   ├── model/                   # Database models
│   ├── cron/                    # Scheduled jobs
│   ├── handler/                 # WhatsApp menu logic
│   ├── service/                 # Business services
│   ├── repository/              # Query helpers
│   ├── utils/                   # Utility functions
│   ├── routes/                  # Express routers
│   └── middleware/              # Global middleware
└── tests/                       # Jest tests
```

---

## API Overview

The API exposes endpoints for managing clients and users, fetching Instagram and TikTok data, handling OAuth callbacks, and providing dashboard statistics. Endpoints are also available for premium subscription management. Detailed documentation for each route is available in the source code comments.

## Deployment & Environment

1. **Clone and install dependencies**
    ```bash
    git clone <repo-url>
    cd Cicero_V2
    npm install
    ```
2. **Copy `.env.example` to `.env`** and update the values:
    ```ini
    PORT=3000
    DB_USER=cicero
    DB_HOST=localhost
    DB_NAME=cicero_db
    DB_PASS=secret
    DB_PORT=5432
    DB_DRIVER=postgres
    ADMIN_WHATSAPP=628xxxxxx@c.us,628yyyyyy@c.us
    CLIENT_OPERATOR=628123456789
    NEXT_PUBLIC_API_URL=http://localhost:3000/api
    NEXT_PUBLIC_ADMIN_WHATSAPP=628xxxxxx@c.us
    NEXT_PUBLIC_CLIENT_OPERATOR=628123456789
    RAPIDAPI_KEY=xxxx
    REDIS_URL=redis://localhost:6379
    SECRET_KEY=your-secret
    JWT_SECRET=your-jwt-secret
    AMQP_URL=amqp://localhost
    ```
3. **Set up Redis**
    ```bash
    sudo apt-get install redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    ```
4. **Initialize the database** using scripts in `sql/schema.sql`.
5. **Start the application**
    ```bash
    npm start
    ```
    Or with PM2:
    ```bash
    pm2 start app.js --name cicero_v2
    ```
6. **Lint & Test**
    ```bash
    npm run lint
    npm test
    ```

---

## Database Backup

Example commands for backing up and restoring the database:

```bash
pg_dump -U <dbuser> -h <host> -d <dbname> > cicero_backup.sql
psql -U <dbuser> -h <host> -d <dbname> < cicero_backup.sql
```

---

## Troubleshooting

- **DB connection errors** – check `DATABASE_URL` and PostgreSQL status.
- **WhatsApp not connected** – rescan the QR code and check the session folder.
- **External API errors** – verify `RAPIDAPI_KEY` and check application logs.
- **Cron jobs not running** – confirm `node-cron` is active and verify timezone settings.

---

## Security Notes

- Do not upload `.env` to a public repository.
- All POST/PUT endpoints perform strict validation.
- Only admins from the environment variables can trigger manual WhatsApp commands.
- Back up the database regularly and test recovery procedures.

---

## Scaling & Monitoring

- Use PM2 clusters and separate processes if load is high.
- Monitor database health, cron jobs, and WhatsApp logs.
- Add indexes to frequently queried fields.
- Cache Instagram and TikTok profiles in Redis (`profileCacheService.js`) to improve response times.

## High Volume Queue (RabbitMQ)

- Use RabbitMQ to process large jobs asynchronously.
- Configure the connection URL in `AMQP_URL`.
- The queue service is found in `src/service/rabbitMQService.js` with `publishToQueue` and `consumeQueue` functions.

---

## License

See the LICENSE file in this repository.

## Contributors & Support

Contact the repository admin for access, issues, or additional contributors.

---

> This documentation is automatically generated based on code analysis and development history.
