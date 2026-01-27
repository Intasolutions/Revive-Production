
try:
    with open('Laboratory.jsx', 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if 'const groupedCharges' in line:
                print(f"Line {i+1}: {line.strip()}")
except Exception as e:
    print(e)
