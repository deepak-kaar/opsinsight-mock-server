# Live Streaming API - Sample Payloads

This document contains sample payloads and examples for testing the Live Streaming API endpoints.

---

## 1. Upload Live Feed from Camera

**Endpoint:** `POST /liveStreaming/upload`

**Description:** Receives video stream from camera and stores in GridFS

### Sample Payload (JSON)

```json
{
  "cameraId": "CAM001",
  "location": "Plant A - Section 1",
  "mimeType": "video/mp4",
  "resolution": "1920x1080",
  "fps": 30,
  "videoData": "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAA..."
}
```

### Required Fields
- `cameraId` (string): Unique camera identifier
- `videoData` (string): Base64 encoded video data

### Optional Fields
- `location` (string): Camera location/description
- `mimeType` (string): Video MIME type (default: "video/mp4")
- `resolution` (string): Video resolution (e.g., "1920x1080", "1280x720")
- `fps` (number): Frames per second (e.g., 30, 60)

### Sample Response

```json
{
  "success": true,
  "message": "Live feed uploaded successfully",
  "data": {
    "fileId": "507f1f77bcf86cd799439011",
    "filename": "live_feed_CAM001_1698765432000",
    "metadata": {
      "cameraId": "CAM001",
      "location": "Plant A - Section 1",
      "timestamp": "2025-10-26T10:30:32.000Z",
      "mimeType": "video/mp4",
      "resolution": "1920x1080",
      "fps": 30
    }
  }
}
```

### How to Convert Video to Base64 (for testing)

**Using Node.js:**
```javascript
const fs = require('fs');

// Read video file
const videoBuffer = fs.readFileSync('sample-video.mp4');

// Convert to base64
const base64Video = videoBuffer.toString('base64');

console.log(base64Video);
```

**Using Python:**
```python
import base64

# Read video file
with open('sample-video.mp4', 'rb') as video_file:
    video_data = video_file.read()
    base64_video = base64.b64encode(video_data).decode('utf-8')

print(base64_video)
```

### cURL Example

```bash
curl -X POST http://localhost:8080/liveStreaming/upload \
  -H "Content-Type: application/json" \
  -d '{
    "cameraId": "CAM001",
    "location": "Plant A - Section 1",
    "mimeType": "video/mp4",
    "resolution": "1920x1080",
    "fps": 30,
    "videoData": "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAA..."
  }'
```

---

## 2. Stream Live Feed by File ID

**Endpoint:** `GET /liveStreaming/stream/:fileId`

**Description:** Stream video to UI with range support (for video player)

### URL Parameters
- `fileId` (string): GridFS file ID from upload response

### Sample Request

```bash
GET http://localhost:8080/liveStreaming/stream/507f1f77bcf86cd799439011
```

### Sample Response
Returns video stream with appropriate headers:
- `Content-Type`: video/mp4
- `Accept-Ranges`: bytes
- `Content-Length`: [file size]

### HTML5 Video Player Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Live Feed Player</title>
</head>
<body>
  <h1>Camera Feed</h1>
  <video width="800" height="600" controls>
    <source src="http://localhost:8080/liveStreaming/stream/507f1f77bcf86cd799439011" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</body>
</html>
```

### React Component Example

```jsx
import React from 'react';

const LiveFeedPlayer = ({ fileId }) => {
  const videoUrl = `http://localhost:8080/liveStreaming/stream/${fileId}`;

  return (
    <div>
      <h2>Live Camera Feed</h2>
      <video
        width="800"
        height="600"
        controls
        src={videoUrl}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default LiveFeedPlayer;
```

### cURL Example (Download)

```bash
curl -X GET http://localhost:8080/liveStreaming/stream/507f1f77bcf86cd799439011 \
  --output downloaded-feed.mp4
```

---

## 3. Get All Feeds for a Specific Camera

**Endpoint:** `GET /liveStreaming/camera/:cameraId`

**Description:** Retrieve all video feeds from a specific camera

### URL Parameters
- `cameraId` (string): Camera identifier

### Sample Request

```bash
GET http://localhost:8080/liveStreaming/camera/CAM001
```

### Sample Response

```json
{
  "success": true,
  "cameraId": "CAM001",
  "count": 3,
  "data": [
    {
      "fileId": "507f1f77bcf86cd799439011",
      "filename": "live_feed_CAM001_1698765432000",
      "cameraId": "CAM001",
      "location": "Plant A - Section 1",
      "timestamp": "2025-10-26T10:30:32.000Z",
      "uploadDate": "2025-10-26T10:30:35.000Z",
      "size": 5242880,
      "mimeType": "video/mp4"
    },
    {
      "fileId": "507f1f77bcf86cd799439012",
      "filename": "live_feed_CAM001_1698762000000",
      "cameraId": "CAM001",
      "location": "Plant A - Section 1",
      "timestamp": "2025-10-26T09:20:00.000Z",
      "uploadDate": "2025-10-26T09:20:03.000Z",
      "size": 4194304,
      "mimeType": "video/mp4"
    }
  ]
}
```

### cURL Example

```bash
curl -X GET http://localhost:8080/liveStreaming/camera/CAM001
```

---

## 4. Get Latest Feed for a Camera

**Endpoint:** `GET /liveStreaming/camera/:cameraId/latest`

**Description:** Retrieve the most recent video feed from a camera

### URL Parameters
- `cameraId` (string): Camera identifier

### Sample Request

```bash
GET http://localhost:8080/liveStreaming/camera/CAM001/latest
```

### Sample Response

```json
{
  "success": true,
  "data": {
    "fileId": "507f1f77bcf86cd799439011",
    "filename": "live_feed_CAM001_1698765432000",
    "cameraId": "CAM001",
    "location": "Plant A - Section 1",
    "timestamp": "2025-10-26T10:30:32.000Z",
    "uploadDate": "2025-10-26T10:30:35.000Z",
    "size": 5242880,
    "mimeType": "video/mp4"
  }
}
```

### Sample Response (No Feed Found)

```json
{
  "error": "No feed found for this camera"
}
```

### cURL Example

```bash
curl -X GET http://localhost:8080/liveStreaming/camera/CAM001/latest
```

---

## 5. Get All Live Feeds with Pagination

**Endpoint:** `GET /liveStreaming/feeds`

**Description:** Retrieve all video feeds with pagination support

### Query Parameters
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 10)

### Sample Request

```bash
GET http://localhost:8080/liveStreaming/feeds?page=1&limit=10
```

### Sample Response

```json
{
  "success": true,
  "data": {
    "feeds": [
      {
        "fileId": "507f1f77bcf86cd799439011",
        "filename": "live_feed_CAM001_1698765432000",
        "cameraId": "CAM001",
        "location": "Plant A - Section 1",
        "timestamp": "2025-10-26T10:30:32.000Z",
        "uploadDate": "2025-10-26T10:30:35.000Z",
        "size": 5242880,
        "mimeType": "video/mp4"
      },
      {
        "fileId": "507f1f77bcf86cd799439012",
        "filename": "live_feed_CAM002_1698763200000",
        "cameraId": "CAM002",
        "location": "Plant B - Entrance",
        "timestamp": "2025-10-26T10:00:00.000Z",
        "uploadDate": "2025-10-26T10:00:05.000Z",
        "size": 3145728,
        "mimeType": "video/mp4"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 47,
      "itemsPerPage": 10
    }
  }
}
```

### cURL Examples

```bash
# Get first page (default)
curl -X GET http://localhost:8080/liveStreaming/feeds

# Get page 2 with 20 items
curl -X GET "http://localhost:8080/liveStreaming/feeds?page=2&limit=20"

# Get page 3 with 5 items
curl -X GET "http://localhost:8080/liveStreaming/feeds?page=3&limit=5"
```

---

## 6. Delete a Specific Live Feed

**Endpoint:** `DELETE /liveStreaming/delete/:fileId`

**Description:** Remove a video feed from GridFS by file ID

### URL Parameters
- `fileId` (string): GridFS file ID to delete

### Sample Request

```bash
DELETE http://localhost:8080/liveStreaming/delete/507f1f77bcf86cd799439011
```

### Sample Response

```json
{
  "success": true,
  "message": "Live feed deleted successfully"
}
```

### cURL Example

```bash
curl -X DELETE http://localhost:8080/liveStreaming/delete/507f1f77bcf86cd799439011
```

---

## 7. Delete Old Live Feeds (Cleanup)

**Endpoint:** `DELETE /liveStreaming/cleanup`

**Description:** Remove feeds older than specified days

### Query Parameters
- `days` (integer, optional): Delete feeds older than this many days (default: 7)

### Sample Request

```bash
DELETE http://localhost:8080/liveStreaming/cleanup?days=7
```

### Sample Response

```json
{
  "success": true,
  "message": "Deleted 15 old live feeds",
  "deletedCount": 15
}
```

### cURL Examples

```bash
# Delete feeds older than 7 days (default)
curl -X DELETE http://localhost:8080/liveStreaming/cleanup

# Delete feeds older than 30 days
curl -X DELETE "http://localhost:8080/liveStreaming/cleanup?days=30"

# Delete feeds older than 1 day
curl -X DELETE "http://localhost:8080/liveStreaming/cleanup?days=1"
```

---

## 8. Health Check

**Endpoint:** `GET /liveStreaming/health`

**Description:** Check if the live streaming service is running

### Sample Request

```bash
GET http://localhost:8080/liveStreaming/health
```

### Sample Response

```json
{
  "status": "OK",
  "message": "Live streaming service is running"
}
```

### cURL Example

```bash
curl -X GET http://localhost:8080/liveStreaming/health
```

---

## Complete Testing Workflow

### 1. Upload a Video Feed

```bash
# First, convert a video to base64 (using Node.js)
node -e "console.log(require('fs').readFileSync('sample.mp4').toString('base64'))" > video.txt

# Then upload it
curl -X POST http://localhost:8080/liveStreaming/upload \
  -H "Content-Type: application/json" \
  -d "{
    \"cameraId\": \"CAM001\",
    \"location\": \"Plant A - Section 1\",
    \"mimeType\": \"video/mp4\",
    \"resolution\": \"1920x1080\",
    \"fps\": 30,
    \"videoData\": \"$(cat video.txt)\"
  }"
```

### 2. Get the Latest Feed

```bash
curl -X GET http://localhost:8080/liveStreaming/camera/CAM001/latest
```

### 3. Stream the Video (Use Browser)

Open in browser:
```
http://localhost:8080/liveStreaming/stream/[fileId-from-step-2]
```

### 4. List All Feeds

```bash
curl -X GET "http://localhost:8080/liveStreaming/feeds?page=1&limit=10"
```

### 5. Cleanup Old Feeds

```bash
curl -X DELETE "http://localhost:8080/liveStreaming/cleanup?days=7"
```

---

## Postman Collection

Import this JSON into Postman for easy testing:

```json
{
  "info": {
    "name": "Live Streaming API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Upload Live Feed",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"cameraId\": \"CAM001\",\n  \"location\": \"Plant A - Section 1\",\n  \"mimeType\": \"video/mp4\",\n  \"resolution\": \"1920x1080\",\n  \"fps\": 30,\n  \"videoData\": \"AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAA...\"\n}"
        },
        "url": {
          "raw": "http://localhost:8080/liveStreaming/upload",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8080",
          "path": ["liveStreaming", "upload"]
        }
      }
    },
    {
      "name": "Get Latest Feed",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:8080/liveStreaming/camera/CAM001/latest",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8080",
          "path": ["liveStreaming", "camera", "CAM001", "latest"]
        }
      }
    },
    {
      "name": "Stream Video",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:8080/liveStreaming/stream/:fileId",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8080",
          "path": ["liveStreaming", "stream", ":fileId"]
        }
      }
    },
    {
      "name": "Get All Feeds",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:8080/liveStreaming/feeds?page=1&limit=10",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8080",
          "path": ["liveStreaming", "feeds"],
          "query": [
            {"key": "page", "value": "1"},
            {"key": "limit", "value": "10"}
          ]
        }
      }
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "cameraId and videoData are required"
}
```

### 404 Not Found
```json
{
  "error": "Live feed not found"
}
```

### 500 Server Error
```json
{
  "error": "Error uploading live feed: [error message]"
}
```
