from pathlib import Path
import sys

from pypdf import PdfReader


pdf_path = Path(sys.argv[1]).resolve()
reader = PdfReader(str(pdf_path))
texts = [(page.extract_text() or "") for page in reader.pages]
sections = [
    "Executive launch gate",
    "Eight-week launch plan",
    "30 / 60 / 90 day execution view",
    "Master launch checklist",
    "Primary official sources",
]

print(f"PAGES={len(reader.pages)}")
print(f"EMPTY_PAGES={[index + 1 for index, text in enumerate(texts) if len(text.strip()) < 40]}")
print(f"TEXT_CHARS={sum(map(len, texts))}")
print(f"TITLE={reader.metadata.title}")
print(f"SECTIONS={ {section: any(section in text for text in texts) for section in sections} }")
for index, text in enumerate(texts, start=1):
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    print(f"PAGE_{index:02d}_CHARS={len(text)} FIRST={first_line[:100]}")
