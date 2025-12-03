# FileServ API Documentation

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /api/auth/login
Login with username and password.

**Request:**
```json
{
  "username": "john",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": 1234567890,
  "user": {
    "id": "uuid",
    "username": "john",
    "email": "john@example.com",
    "is_admin": false,
    "groups": ["developers"],
    "must_change_password": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

#### POST /api/auth/logout
Logout current user (invalidate token).

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

#### POST /api/auth/refresh
Refresh JWT token.

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": 1234567890
}
```

#### GET /api/auth/me
Get current user information.

**Response:**
```json
{
  "id": "uuid",
  "username": "john",
  "is_admin": false
}
```

### User Management (Admin Only)

#### GET /api/users
List all users.

**Response:**
```json
[
  {
    "id": "uuid",
    "username": "john",
    "email": "john@example.com",
    "is_admin": false,
    "groups": ["developers"],
    "must_change_password": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### POST /api/users
Create a new user.

**Request:**
```json
{
  "username": "john",
  "password": "secure_password",
  "email": "john@example.com",
  "is_admin": false,
  "groups": ["developers", "viewers"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "username": "john",
  "email": "john@example.com",
  "is_admin": false,
  "groups": ["developers", "viewers"],
  "must_change_password": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### PUT /api/users/:id
Update a user.

**Request:**
```json
{
  "email": "newemail@example.com",
  "groups": ["developers"],
  "is_admin": false
}
```

**Response:**
```json
{
  "id": "uuid",
  "username": "john",
  "email": "newemail@example.com",
  "is_admin": false,
  "groups": ["developers"],
  "must_change_password": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### DELETE /api/users/:id
Delete a user.

**Response:** 204 No Content

### File Operations

#### GET /api/files?path=/
List files in a directory.

**Query Parameters:**
- `path` - Directory path (default: `/`)

**Response:**
```json
[
  {
    "name": "document.pdf",
    "path": "/documents/document.pdf",
    "size": 1024000,
    "is_dir": false,
    "mod_time": "2024-01-01T00:00:00Z",
    "mode": "-rw-r--r--"
  },
  {
    "name": "folder",
    "path": "/folder",
    "size": 0,
    "is_dir": true,
    "mod_time": "2024-01-01T00:00:00Z",
    "mode": "drwxr-xr-x"
  }
]
```

#### GET /api/files/*path
Download a file or list directory contents.

**Response:** File download or directory listing (JSON)

#### POST /api/files/*path
Upload a file.

**Request:** multipart/form-data with `file` field

**Response:**
```json
{
  "message": "File uploaded successfully",
  "path": "/uploads/file.txt"
}
```

#### DELETE /api/files/*path
Delete a file or directory.

**Response:** 204 No Content

#### PUT /api/files/*path
Rename or move a file.

**Request:**
```json
{
  "new_path": "/new/location/file.txt"
}
```

**Response:**
```json
{
  "message": "File renamed successfully",
  "path": "/new/location/file.txt"
}
```

#### POST /api/folders/*path
Create a new directory.

**Response:**
```json
{
  "message": "Folder created successfully",
  "path": "/new/folder"
}
```

### Permissions (Admin Only)

#### GET /api/permissions
List all permissions.

**Response:**
```json
[
  {
    "id": "uuid",
    "path": "/documents",
    "type": "read",
    "username": "john",
    "group": "",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### POST /api/permissions
Create a new permission.

**Request:**
```json
{
  "path": "/documents",
  "type": "read",
  "username": "john",
  "group": ""
}
```

Permission types: `read`, `write`, `delete`

**Note:** Either `username` or `group` must be specified.

**Response:**
```json
{
  "id": "uuid",
  "path": "/documents",
  "type": "read",
  "username": "john",
  "group": "",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### DELETE /api/permissions/:id
Delete a permission.

**Response:** 204 No Content

### Admin Dashboard

#### GET /api/admin/stats
Get server statistics.

**Response:**
```json
{
  "total_users": 5,
  "total_permissions": 12,
  "total_files": 150,
  "total_size": 1073741824
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `204` - No Content (successful deletion)
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Example Usage with cURL

### Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"john","password":"secure_password"}'
```

### List Files
```bash
TOKEN="your-jwt-token"
curl http://localhost:8080/api/files?path=/ \
  -H "Authorization: Bearer $TOKEN"
```

### Upload File
```bash
TOKEN="your-jwt-token"
curl -X POST http://localhost:8080/api/files/uploads/myfile.txt \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/local/file.txt"
```

### Download File
```bash
TOKEN="your-jwt-token"
curl http://localhost:8080/api/files/uploads/myfile.txt \
  -H "Authorization: Bearer $TOKEN" \
  -o downloaded-file.txt
```

### Create User
```bash
TOKEN="your-jwt-token"
curl -X POST http://localhost:8080/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "is_admin": false,
    "groups": ["users"]
  }'
```

### Create Permission
```bash
TOKEN="your-jwt-token"
curl -X POST http://localhost:8080/api/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/shared",
    "type": "read",
    "group": "users"
  }'
```
