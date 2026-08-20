from pathlib import Path
from PIL import Image, ImageDraw


source = Path("tmp/pdfs/render_v3")
output = Path("tmp/pdfs/contact_v3")
output.mkdir(parents=True, exist_ok=True)
pages = sorted(source.glob("page-*.png"))
thumb_width = 660
gap = 28
label_height = 40
per_sheet = 4

for sheet_index in range(0, len(pages), per_sheet):
    group = pages[sheet_index:sheet_index + per_sheet]
    thumbs = []
    for page in group:
        image = Image.open(page).convert("RGB")
        height = round(image.height * thumb_width / image.width)
        image = image.resize((thumb_width, height), Image.Resampling.LANCZOS)
        thumbs.append((page, image))

    cell_height = max(image.height for _, image in thumbs) + label_height
    canvas = Image.new("RGB", (thumb_width * 2 + gap * 3, cell_height * 2 + gap * 3), "#D9DED9")
    draw = ImageDraw.Draw(canvas)
    for position, (page, image) in enumerate(thumbs):
        col = position % 2
        row = position // 2
        x = gap + col * (thumb_width + gap)
        y = gap + row * (cell_height + gap)
        canvas.paste(image, (x, y + label_height))
        page_num = int(page.stem.split("-")[-1])
        draw.text((x, y + 8), f"PAGE {page_num}", fill="#183E34")

    target = output / f"contact-{sheet_index // per_sheet + 1}.png"
    canvas.save(target, quality=92)
    print(target)
