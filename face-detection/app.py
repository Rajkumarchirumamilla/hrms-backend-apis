# ============================================
# FACE DETECTION SERVICE — Python Flask
# Port: 5001  |  Run: python app.py
# ============================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import math
import time

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'face-detection'})


@app.route('/api/face/detect-face', methods=['POST'])
def detect_face():
    t0 = time.time()
    try:
        data          = request.json
        image_base64  = data.get('image', '')
        circle_center = data.get('circleCenter', {})
        circle_radius = float(data.get('circleRadius', 0))

        # React Native sends its logical screen dimensions
        screen_width  = float(data.get('screenWidth',  390))
        screen_height = float(data.get('screenHeight', 844))

        if not image_base64:
            return jsonify({'success': False, 'error': 'No image',
                            'hasFace': False, 'isFaceCentered': False}), 400

        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]

        img_bytes = base64.b64decode(image_base64)
        nparr     = np.frombuffer(img_bytes, np.uint8)
        img       = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'success': False, 'error': 'Bad image decode',
                            'hasFace': False, 'isFaceCentered': False}), 400

        img_h, img_w = img.shape[:2]

        # ── Grayscale + equalize ──────────────────────────────────────────────
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        # ── Detect faces ──────────────────────────────────────────────────────
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(40, 40),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        # ── Map screen coords → image pixel coords ────────────────────────────
        # React Native logical px  →  image pixel
        # e.g. screen=(390×844), image=(750×1624)
        # circle_center.x=195  →  center_x = (195/390)*750 = 375
        screen_cx = float(circle_center.get('x', screen_width  / 2))
        screen_cy = float(circle_center.get('y', screen_height * 0.4))

        center_x      = int((screen_cx     / screen_width)  * img_w)
        center_y      = int((screen_cy     / screen_height) * img_h)
        mapped_radius = int((circle_radius / screen_width)  * img_w)

        # ── IMPORTANT DEBUG — always printed ─────────────────────────────────
        print("=" * 60)
        print(f"  IMAGE SIZE   : {img_w} x {img_h}")
        print(f"  SCREEN SIZE  : {screen_width} x {screen_height}")
        print(f"  CIRCLE CENTER: screen=({screen_cx:.0f},{screen_cy:.0f})  "
              f"→ image=({center_x},{center_y})")
        print(f"  CIRCLE RADIUS: screen={circle_radius:.0f}  "
              f"→ image={mapped_radius}px")
        print(f"  FACES FOUND  : {len(faces)}")

        result = {
            'success':        True,
            'hasFace':        len(faces) > 0,
            'isFaceCentered': False,
            'isSizeOk':       False,
            'message':        'No face detected',
            'distance':       None,
            'faceSize':       None,
        }

        if len(faces) > 0:
            largest = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = largest

            face_cx = x + w // 2
            face_cy = y + h // 2
            distance = math.sqrt((face_cx - center_x)**2 + (face_cy - center_y)**2)

            face_size  = max(w, h)
            ideal_size = mapped_radius * 1.8

            is_pos_ok  = distance   < (mapped_radius * 0.9) if mapped_radius > 0 else False
            is_size_ok = (ideal_size * 0.10 < face_size < ideal_size * 2.5) if ideal_size > 0 else True
            is_centered = is_pos_ok and is_size_ok

            # Clear guidance message
            if is_centered:
                msg = 'Face is centered'
            elif not is_pos_ok:
                # Tell user which direction to move
                dx = face_cx - center_x
                dy = face_cy - center_y
                if abs(dx) > abs(dy):
                    msg = 'Move face left' if dx > 0 else 'Move face right'
                else:
                    msg = 'Move face up' if dy > 0 else 'Move face down'
            elif face_size < ideal_size * 0.10:
                msg = 'Move closer to camera'
            else:
                msg = 'Move back a little'

            result.update({
                'hasFace':        True,
                'isFaceCentered': bool(is_centered),
                'isSizeOk':       bool(is_size_ok),
                'isPositionOk':   bool(is_pos_ok),
                'message':        msg,
                'distance':       round(float(distance), 1),
                'faceSize':       int(face_size),
            })

            ms = round((time.time() - t0) * 1000, 1)
            status = "✅ CENTERED" if is_centered else "❌ NOT CENTERED"
            print(f"  FACE BOX     : ({x},{y}) {w}x{h}")
            print(f"  FACE CENTER  : ({face_cx},{face_cy})")
            print(f"  DISTANCE     : {distance:.1f}px  (max allowed: {mapped_radius*0.9:.1f}px)")
            print(f"  FACE SIZE    : {face_size}px  (ideal: {ideal_size:.0f}px)")
            print(f"  POS OK       : {is_pos_ok}")
            print(f"  SIZE OK      : {is_size_ok}")
            print(f"  RESULT       : {status}  ({ms}ms)")
        else:
            print("  RESULT       : NO FACE")

        print("=" * 60)
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e),
                        'hasFace': False, 'isFaceCentered': False}), 500


if __name__ == '__main__':
    print("=" * 60)
    print("  FACE DETECTION SERVICE  —  http://0.0.0.0:5001")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=False)