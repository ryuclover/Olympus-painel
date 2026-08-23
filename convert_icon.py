from PIL import Image
import os

input_path = "logo.png"
output_path = "electron/icon.ico"

if os.path.exists(input_path):
    img = Image.open(input_path)
    # Ensure it's 256x256 as required
    img = img.resize((256, 256), Image.Resampling.LANCZOS)
    img.save(output_path, format='ICO', sizes=[(256, 256)])
    print(f"Icon saved to {output_path}")
else:
    print(f"File {input_path} not found.")
