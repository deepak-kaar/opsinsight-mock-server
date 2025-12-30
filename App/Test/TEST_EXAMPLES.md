# GridFS Image Test API Examples

## Base URL
```
http://localhost:8080/test
```

---

## 1. Upload Image

### Using cURL
```bash
curl -X POST http://localhost:8080/test/upload \
  -F "image=@/path/to/your/image.jpg"
```

### Using Postman
1. Method: `POST`
2. URL: `http://localhost:8080/test/upload`
3. Body:
   - Select `form-data`
   - Key: `image` (change type to `File`)
   - Value: Select your image file

### Using JavaScript/Fetch
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

fetch('http://localhost:8080/test/upload', {
    method: 'POST',
    body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

### Response Example
```json
{
  "message": "Image uploaded successfully",
  "data": {
    "fileId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "filename": "test-image.jpg",
    "contentType": "image/jpeg",
    "size": 245678
  }
}
```

---

## 2. Get All Images

### Using cURL
```bash
curl -X GET http://localhost:8080/test/images
```

### Using Postman
1. Method: `GET`
2. URL: `http://localhost:8080/test/images`

### Using JavaScript/Fetch
```javascript
fetch('http://localhost:8080/test/images')
.then(response => response.json())
.then(data => console.log(data));
```

### Response Example
```json
{
  "message": "Images retrieved successfully",
  "count": 2,
  "data": [
    {
      "fileId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "filename": "test-image.jpg",
      "contentType": "image/jpeg",
      "size": 245678,
      "uploadDate": "2025-01-15T10:30:45.123Z",
      "metadata": {
        "uploadDate": "2025-01-15T10:30:45.123Z"
      }
    },
    {
      "fileId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "filename": "sample.png",
      "contentType": "image/png",
      "size": 156789,
      "uploadDate": "2025-01-15T11:20:30.456Z",
      "metadata": {
        "uploadDate": "2025-01-15T11:20:30.456Z"
      }
    }
  ]
}
```

---

## 3. Get Image by ID

### Using cURL
```bash
curl -X GET http://localhost:8080/test/image/65a1b2c3d4e5f6g7h8i9j0k1 \
  --output downloaded-image.jpg
```

### Using Postman
1. Method: `GET`
2. URL: `http://localhost:8080/test/image/{fileId}`
3. Replace `{fileId}` with actual file ID
4. Click "Send and Download" to save the image

### Using Browser
Simply navigate to:
```
http://localhost:8080/test/image/65a1b2c3d4e5f6g7h8i9j0k1
```

### Using JavaScript/Fetch
```javascript
fetch('http://localhost:8080/test/image/65a1b2c3d4e5f6g7h8i9j0k1')
.then(response => response.blob())
.then(blob => {
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    document.body.appendChild(img);
});
```

### Response
Returns the actual image file with appropriate Content-Type header

---

## 4. Get Image Metadata

### Using cURL
```bash
curl -X GET http://localhost:8080/test/metadata/65a1b2c3d4e5f6g7h8i9j0k1
```

### Using Postman
1. Method: `GET`
2. URL: `http://localhost:8080/test/metadata/{fileId}`
3. Replace `{fileId}` with actual file ID

### Using JavaScript/Fetch
```javascript
fetch('http://localhost:8080/test/metadata/65a1b2c3d4e5f6g7h8i9j0k1')
.then(response => response.json())
.then(data => console.log(data));
```

### Response Example
```json
{
  "message": "Metadata retrieved successfully",
  "data": {
    "fileId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "filename": "test-image.jpg",
    "contentType": "image/jpeg",
    "size": 245678,
    "uploadDate": "2025-01-15T10:30:45.123Z",
    "metadata": {
      "uploadDate": "2025-01-15T10:30:45.123Z"
    }
  }
}
```

---

## 5. Delete Image

### Using cURL
```bash
curl -X DELETE http://localhost:8080/test/image/65a1b2c3d4e5f6g7h8i9j0k1
```

### Using Postman
1. Method: `DELETE`
2. URL: `http://localhost:8080/test/image/{fileId}`
3. Replace `{fileId}` with actual file ID

### Using JavaScript/Fetch
```javascript
fetch('http://localhost:8080/test/image/65a1b2c3d4e5f6g7h8i9j0k1', {
    method: 'DELETE'
})
.then(response => response.json())
.then(data => console.log(data));
```

### Response Example
```json
{
  "message": "Image deleted successfully",
  "success": true
}
```

---

## Testing with HTML Page

1. Open `test.html` in your browser
2. Make sure your server is running on `http://localhost:8080`
3. Use the interface to:
   - Upload images
   - View all images in a gallery
   - Get metadata
   - Delete images

---

## Python Example

```python
import requests

# Upload image
with open('path/to/image.jpg', 'rb') as f:
    files = {'image': f}
    response = requests.post('http://localhost:8080/test/upload', files=files)
    print(response.json())
    file_id = response.json()['data']['fileId']

# Get all images
response = requests.get('http://localhost:8080/test/images')
print(response.json())

# Get specific image
response = requests.get(f'http://localhost:8080/test/image/{file_id}')
with open('downloaded_image.jpg', 'wb') as f:
    f.write(response.content)

# Get metadata
response = requests.get(f'http://localhost:8080/test/metadata/{file_id}')
print(response.json())

# Delete image
response = requests.delete(f'http://localhost:8080/test/image/{file_id}')
print(response.json())
```

---

## Node.js Example

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function testGridFS() {
    const baseURL = 'http://localhost:8080/test';

    // Upload image
    const formData = new FormData();
    formData.append('image', fs.createReadStream('path/to/image.jpg'));

    const uploadResponse = await axios.post(`${baseURL}/upload`, formData, {
        headers: formData.getHeaders()
    });
    console.log('Upload:', uploadResponse.data);
    const fileId = uploadResponse.data.data.fileId;

    // Get all images
    const allImages = await axios.get(`${baseURL}/images`);
    console.log('All Images:', allImages.data);

    // Get metadata
    const metadata = await axios.get(`${baseURL}/metadata/${fileId}`);
    console.log('Metadata:', metadata.data);

    // Get image
    const image = await axios.get(`${baseURL}/image/${fileId}`, {
        responseType: 'arraybuffer'
    });
    fs.writeFileSync('downloaded.jpg', image.data);

    // Delete image
    const deleteResponse = await axios.delete(`${baseURL}/image/${fileId}`);
    console.log('Delete:', deleteResponse.data);
}

testGridFS().catch(console.error);
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "No image file provided"
}
```

### 404 Not Found
```json
{
  "error": "Image not found"
}
```

### 500 Server Error
```json
{
  "error": "Error uploading image: ..."
}
```
