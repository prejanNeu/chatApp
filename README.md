# GuffGaff

A real-time chat application built with Django Channels, featuring WebSocket-based messaging, friend management, and group chat capabilities.

## 🌟 Features

### Real-Time Communication
- **Instant Messaging**: WebSocket-powered real-time message delivery
- **Typing Indicators**: See when others are typing
- **Read Receipts**: Track message read status
- **Online Status**: Real-time user presence indicators
- **Requests Notification**: Real-time notifications for friend requests

### Chat Capabilities
- **Private Chats**: One-on-one conversations with friends
- **Group Chats**: Create and manage group conversations
  - Group admin controls
  - Member management (add/remove members)
  - Custom group icons
- **Message Features**:
  - Text messages
  - File uploads and sharing
  - Image preview support
  - Message editing and deletion
  - Recovery options

### Social Features
- **Friend System**: Send, accept, and manage friend requests
- **User Profiles**: Customizable profiles with avatars
- **Notifications**: Real-time notifications for messages and friend requests

### User Experience
- **Modern UI**: Clean, responsive design with dark mode support
- **Toast Notifications**: Non-intrusive status updates
- **Unread Message Badges**: Visual indicators for unread content
- **Mobile Responsive**: Works seamlessly on all device sizes

## 🛠️ Technology Stack

### Backend
- **Django 5.2.1**: Web framework
- **Django Channels 4.2.2**: WebSocket support
- **Daphne**: ASGI server
- **Redis**: Channel layer backend for WebSocket communication
- **Pillow**: Image processing for avatars and group icons

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **WebSocket API**: Real-time bidirectional communication
- **Modern CSS**: Custom styling with CSS variables for theming

### Infrastructure
- **Docker**: Containerization for easy deployment
- **Docker Compose**: Multi-container orchestration
- **SQLite**: Default database (PostgreSQL-ready)

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Redis server
- pip (Python package manager)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatApp
   ```

2. **Create and activate virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start Redis server**
   ```bash
   redis-server
   ```

5. **Run migrations**
   ```bash
   python manage.py migrate
   ```

6. **Create a superuser (optional)**
   ```bash
   python manage.py createsuperuser
   ```

7. **Run the development server**
   ```bash
   python manage.py runserver
   ```

8. **Access the application**
   - Open your browser and navigate to `http://localhost:8000`
   - Register a new account or login with your superuser credentials

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file with your configuration**
   ```bash
   # Generate a new SECRET_KEY for production
   SECRET_KEY=your-secure-secret-key-here
   DEBUG=False
   ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
   CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   ```

3. **Build and start containers**
   ```bash
   docker-compose up -d --build
   ```

4. **Run migrations (first time only)**
   ```bash
   docker-compose exec web python manage.py migrate
   ```

5. **Create superuser (optional)**
   ```bash
   docker-compose exec web python manage.py createsuperuser
   ```

6. **Access the application**
   - Navigate to `http://localhost:8000`

### Docker Commands

```bash
# View logs
docker-compose logs -f web

# Stop containers
docker-compose down

# Restart containers
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key | Development key (change in production) |
| `DEBUG` | Debug mode | `True` |
| `ALLOWED_HOSTS` | Allowed host headers | `*` |
| `REDIS_HOST` | Redis server host | `127.0.0.1` (or `redis` in Docker) |
| `REDIS_PORT` | Redis server port | `6379` |
| `CSRF_TRUSTED_ORIGINS` | Trusted origins for CSRF | Empty |

### Key Models

- **CustomUser**: Extended user model with avatar and online status
- **ChatRoom**: Base model for all chat rooms
- **PrivateChat**: One-on-one conversations
- **GroupChat**: Multi-user group conversations
- **Message**: Chat messages with file support
- **MessageReadStatus**: Read receipt tracking

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## TODOS:
- [ ] Voice/ Video calls with WebRTC

## 📝 License

This project is open source and available under the MIT License.
