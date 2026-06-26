import urllib.request
import random
import re
import concurrent.futures
import json

# List of 100+ Project Gutenberg book IDs for classic English novels
book_ids = [
    1342, 11, 84, 1661, 2701, 98, 46, 345, 174, 1260, 76, 1400, 158, 16, 25344, 730, 120, 55, 2814, 4300, 141, 5200, 161, 205, 2542, 844, 45, 12, 36, 1184, 514, 219, 160, 27827, 244, 74, 3207, 43, 2097, 100, 1404, 35, 3825, 41445, 2554, 766, 135, 1952, 2852, 1250, 42324, 2600, 119, 28054, 829, 1399, 1497, 863, 16389, 15399, 215, 3600, 2000, 43453, 500, 1080, 521, 236, 1232, 10, 1727, 308, 996, 541, 203, 14838, 1524, 824, 5230, 121, 140, 153, 164, 8800, 580, 20203, 1934, 1322, 1327, 31100, 786, 34114, 23, 2147, 2148, 2149, 2150, 2151, 15, 17, 18, 19, 20, 21, 22
]

# Ensure uniqueness and get first 100
book_ids = list(set(book_ids))[:100]

def get_quote(book_id):
    try:
        url = f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            text = response.read().decode('utf-8', errors='ignore')
            
        start = text.find("*** START OF THE PROJECT")
        if start == -1:
            start = text.find("*** START OF THIS PROJECT")
        end = text.find("*** END OF THE PROJECT")
        if end == -1:
            end = text.find("*** END OF THIS PROJECT")
            
        header = text[:start] if start != -1 else text[:2000]
        if start != -1 and end != -1:
            text = text[start:end]
            
        title_match = re.search(r"Title:\s*([^\r\n]+)", header)
        author_match = re.search(r"Author:\s*([^\r\n]+)", header)
        title = title_match.group(1).strip() if title_match else f"Book {book_id}"
        author = author_match.group(1).strip() if author_match else "Unknown"
        
        # Clean up Gutenberg titles
        title = re.sub(r' \s+.*', '', title)
        source = f"{author}, {title}"
        
        paragraphs = re.split(r'\r?\n\r?\n', text)
        valid_paras = []
        for p in paragraphs:
            p = re.sub(r'\s+', ' ', p).strip()
            words = p.split()
            # Requirement: around 35 words.
            if 35 <= len(words) <= 50:
                # Basic checks to ensure it's a valid sentence
                if re.match(r'^[A-Z"\'“]', p) and p.endswith(('.', '!', '?', '"', '\'', '”')):
                    if not p.isupper() and "Chapter" not in p and "CHAPTER" not in p and "Gutenberg" not in p:
                        valid_paras.append(p)
                    
        if valid_paras:
            # Pick a random valid paragraph from this book
            return {"text": random.choice(valid_paras), "source": source}
    except Exception as e:
        print(f"Error fetching {book_id}: {e}")
    return None

quotes = []
print(f"Fetching {len(book_ids)} books concurrently...")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    results = executor.map(get_quote, book_ids)
    for res in results:
        if res:
            quotes.append(res)
            
print(f"Successfully fetched {len(quotes)} quotes.")

# Format as a JavaScript module
js_content = "export const quotes = " + json.dumps(quotes, ensure_ascii=False, indent=4) + ";\n"

import os
os.makedirs('/Users/chenjingting/Developer/typerace/js', exist_ok=True)
with open('/Users/chenjingting/Developer/typerace/js/quotes.js', 'w', encoding='utf-8') as f:
    f.write(js_content)
