# CICERO_V2
*Last updated: 2025-08-19*

## Description

**Cicero_V2** is an automation system for monitoring, social media attendance, and content analytics (Instagram & TikTok) aimed at organizations and institutions. The backend supports multiple clients, automatically records likes and comments, and sends reports to WhatsApp administrators.

The web dashboard lives in a separate Next.js repository, [Cicero_Web](https://github.com/cicero78M/Cicero_Web), which communicates with this API. Refer to [docs/combined_overview.md](docs/combined_overview.md) for how the repositories interact.

The full architecture is described in [docs/enterprise_architecture.md](docs/enterprise_architecture.md). Scheduled activities are listed in [docs/activity_schedule.md](docs/activity_schedule.md). See [docs/metadata_flow.md](docs/metadata_flow.md) for the metadata flow. Additional guides are available for [server migration](docs/server_migration.md), [RabbitMQ](docs/rabbitmq.md), [Redis](docs/redis.md), [database structure](docs/database_structure.md), [premium subscriptions](docs/premium_subscription.md), [Nginx configuration](docs/reverse_proxy_config.md), [PostgreSQL backups](docs/pg_backup_gdrive.md), [naming conventions](docs/naming_conventions.md), [Login API guide](docs/login_api.md), [WhatsApp user registration guide](docs/wa_user_registration.md), [workflow & usage guide](docs/workflow_usage_guide.md), and [analytics & feedback page design](docs/analyticsFeedbackPage.md).

## Requirements
- Node.js 20 or newer
- PostgreSQL and Redis (configure `.env` accordingly)
- Run `npm install` before starting

---

## Folder Structure

```
``` 
Cicero_V2/
├── app.js                       # Backend API entry point
├── wa-bot.js                    # WhatsApp bot & cron entry
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

When a request requires data for a particular client, include the client's identifier as a query parameter:

```
GET /api/analytics?client_id=demo_client
```

This allows operators to scope responses to the correct client.

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
    ADMIN_WHATSAPP=628xxxxxx,628yyyyyy
    CLIENT_OPERATOR=628123456789
    NEXT_PUBLIC_API_URL=http://localhost:3000/api
    NEXT_PUBLIC_ADMIN_WHATSAPP=628xxxxxx@c.us
    NEXT_PUBLIC_CLIENT_OPERATOR=628123456789
    RAPIDAPI_KEY=xxxx
    REDIS_URL=redis://localhost:6379
    ALLOW_DUPLICATE_REQUESTS=false
    SECRET_KEY=your-secret
    JWT_SECRET=your-jwt-secret
    AMQP_URL=amqp://localhost
    GOOGLE_CONTACT_SCOPE=https://www.googleapis.com/auth/contacts
    GOOGLE_SERVICE_ACCOUNT=/path/to/service-account.json
    GOOGLE_IMPERSONATE_EMAIL=admin@example.com
    BACKUP_DIR=./backups
    GOOGLE_DRIVE_FOLDER_ID=your-drive-folder-id
    ```
   `ADMIN_WHATSAPP` accepts numbers with or without the `@c.us` suffix. When the suffix is omitted, the application automatically appends it.
   `GOOGLE_SERVICE_ACCOUNT` may be set to a JSON string or a path to a JSON file. If the value starts with `/` or ends with `.json`, the application reads the file; otherwise it parses the variable directly as JSON. `GOOGLE_IMPERSONATE_EMAIL` should be set to the Workspace user to impersonate when performing contact operations.

3. **Set up Redis**
    ```bash
    sudo apt-get install redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    ```
4. **Set up RabbitMQ**
   ```bash
   sudo apt-get install rabbitmq-server
   sudo systemctl enable rabbitmq-server
   sudo systemctl start rabbitmq-server
   ```
5. **Initialize the database** using scripts in `sql/schema.sql`.
6. **Start the services**
    ```bash
    npm start       # backend API
    npm run start:wa  # WhatsApp bot & cron workers
    ```
    Or with PM2:
    ```bash
    pm2 start app.js --name cicero_v2
    pm2 start wa-bot.js --name wa_bot
    ```
7. **Lint & Test**
    ```bash
    npm run lint
    npm test
    ```

---

## Google Contacts Integration

The application can synchronize Google Workspace contacts using the People API. Configure the integration as follows:

1. **Enable the People API** in your Google Cloud project.
2. **Create a service account** and enable **Domain-wide delegation**.
3. **Grant domain-wide delegation** in the Google Admin console:
   - Note the service account's client ID.
   - Under **Security → API controls → Domain-wide delegation**, add a new client with that client ID and the scope defined in `GOOGLE_CONTACT_SCOPE`.
4. **Set environment variables**:
   - `GOOGLE_SERVICE_ACCOUNT` – JSON key or file path for the service account.
   - `GOOGLE_CONTACT_SCOPE` – OAuth scope for contacts, e.g. `https://www.googleapis.com/auth/contacts`.
   - `GOOGLE_IMPERSONATE_EMAIL` – Workspace user email to impersonate when accessing contacts.
   - `BACKUP_DIR` – temporary folder for local database dumps.
   - `GOOGLE_DRIVE_FOLDER_ID` – Google Drive folder ID to receive backups.

For detailed setup and usage examples, see [`docs/google_contacts_integration.md`](docs/google_contacts_integration.md).

---

## Database Backup

Example commands for backing up and restoring the database:

```bash
pg_dump -U <dbuser> -h <host> -d <dbname> > cicero_backup.sql
psql -U <dbuser> -h <host> -d <dbname> < cicero_backup.sql
```

A cron job (`src/cron/cronDbBackup.js`) runs daily at **02:00** (Asia/Jakarta), storing dumps in `BACKUP_DIR` and uploading them to the Drive folder defined by `GOOGLE_DRIVE_FOLDER_ID`.

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

## Request Deduplication

The middleware in [`src/middleware/dedupRequestMiddleware.js`](src/middleware/dedupRequestMiddleware.js) hashes non-GET requests and caches them in Redis for five minutes. Identical requests sent again within that window receive an HTTP 429 response. Set `ALLOW_DUPLICATE_REQUESTS=true` to bypass this protection during development.

---

## Scaling & Monitoring

- Use PM2 clusters and separate processes if load is high.
- Monitor database health, cron jobs, and WhatsApp logs.
- Add indexes to frequently queried fields.
- Cache Instagram and TikTok profiles in Redis (`profileCacheService.js`) to improve response times.

## High Volume Queue (RabbitMQ)

- Use RabbitMQ to process large jobs asynchronously.
- Configure the connection URL in `AMQP_URL`.
- Implement helper functions (e.g. `publishToQueue` and `consumeQueue`) as needed for your project.

---

## License

See the LICENSE file in this repository.

## Contributors & Support

Contact the repository admin for access, issues, or additional contributors.

---

> This documentation is automatically generated based on code analysis and development history.
