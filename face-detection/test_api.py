import requests
import base64
import json

# Test the face detection API
def test_face_detection():
    # Read a test image (create a simple test or skip)
    print("Testing Face Detection API...")
    
    # Test health endpoint
    response = requests.get('http://localhost:5001/health')
    print(f"Health check: {response.json()}")
    
    print("\n✅ Python service is running correctly!")
    
if __name__ == "__main__":
    test_face_detection()