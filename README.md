# OpsInsight-Backend
Operation Insight Backend Codebase - A comprehensive backend system for operational insights and data management.

## Prerequisites
- Node.js (v16 or higher)
- MongoDB Atlas account or local MongoDB instance
- Git

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd OpsInsight-Backend
```

2. Install dependencies:
```bash
npm install
```

## Database Configuration

### MongoDB Atlas Setup
1. Create a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account
2. Create a new cluster
3. Create a database named: `OpsInsight`
4. Get your connection string

### Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=8080

# Database Configuration
DATABASE_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=OpsInsight

# Collection Names
REPORT_COLLECTION=Reports
ENTITY_COLLECTION=Entity
ENTITY_DATA_COLLECTION=Entity Data
FLAG_COLLECTION=Flags
DATAPOINT_COLLECTION=Datapoint
EVENT_COLLECTION=Events
INSTANCE_COLLECTION=Instance
ATTRIBUTE_COLLECTION=Attributes
ORGANIZATION_COLLECTION=Organization
USERS_COLLECTION=Users
APPS_COLLECTION=Apps
CONFIG_COLLECTION=Config
EMAIL_COLLECTION=Email
SCHEDULERJOB_COLLECTION=Scheduler Job
REPORT_IMAGE_COLLECTION=Report Image
WEBSERVICE_COLLECTION=WebService

# Authentication
JWT_SECRET=your-secret-key
CLIENT_ID=opsInsight
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:4200

# Optional: Logging Configuration
SPLUNKPORT=10534
SPLUNKIP=10.1.252.77
```

## Running the Application

### Development Mode
```bash
npm start
```
This will start the server with nodemon for auto-restart on file changes.

### Production Mode
```bash
node server.js
```

## API Documentation

Once the server is running, you can access the Swagger API documentation at:
```
http://localhost:8080/api-docs
```

## Project Structure

```
OpsInsight-Backend/
├── App/
│   ├── Auth/                    # Authentication services
│   ├── CalculationEngine/       # Calculation processing
│   ├── CorrelationEngine/       # Data correlation
│   ├── Datapoint Administration/# Data management
│   ├── Email Administration/    # Email services
│   ├── Logger/                  # Logging services
│   ├── Mongo Administration/    # Database administration
│   ├── Organization Administration/ # User & org management
│   └── ...
├── config/
│   ├── connection.js           # Database connection
│   └── proxy.js               # Proxy configuration
├── services/                   # Shared services
├── middleware/                 # Custom middleware
├── .env                       # Environment variables
├── server.js                  # Main server file
└── package.json              # Dependencies
```

## Key Features

- **MongoDB Administration**: Complete CRUD operations with audit logging
- **Authentication**: JWT-based authentication with OpenID Connect
- **Real-time Communication**: Socket.io for live streaming
- **Email Services**: Automated email notifications
- **PDF Generation**: Dynamic report generation
- **Video Streaming**: Live video streaming capabilities
- **Comprehensive Logging**: Audit trails and security logging
- **API Documentation**: Auto-generated Swagger documentation

## Available Endpoints

- `/mongoAdmin` - MongoDB administration
- `/auth` - Authentication
- `/organization` - Organization management
- `/users` - User management
- `/report` - Report generation
- `/email` - Email services
- `/logger` - Logging services
- `/api-docs` - API documentation

## Development

### Adding New Routes
1. Create route file in appropriate App directory
2. Import and register in `server.js`
3. Follow existing patterns for logging and error handling

### Database Collections
The system uses multiple MongoDB collections for different data types. All collection names are configurable via environment variables.

## Troubleshooting

### Common Issues

1. **Connection Issues**: Verify MongoDB connection string and network access
2. **Port Conflicts**: Change PORT in .env if 8080 is occupied
3. **Missing Dependencies**: Run `npm install` to ensure all packages are installed

### Logs
Check application logs for detailed error information. The system includes comprehensive logging for debugging.

## Contributing

1. Follow existing code patterns
2. Add appropriate logging for new features
3. Update documentation for new endpoints
4. Test thoroughly before committing

## License

ISC License - Kaar Technologies