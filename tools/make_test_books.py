"""Generate small Japanese test EPUBs (original text, no copyright concerns).

Book 1 mimics a commercial Japanese EPUB3 (電書協-style layout, vertical-rl CSS,
ruby, SVG-wrapped cover, nav + NCX). Book 2 is an older EPUB2-style package
(NCX only, no nav, horizontal CSS, an inline illustration).

Ruby is written in the source text as 漢字《かな》.
"""
import os
import re
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "test-books")
SAMPLE_DIR = os.path.join(ROOT, "public", "samples")
MINCHO = "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc"

BOOK1 = {
    "id": "urn:uuid:5a1e0c2e-shiori-sample-ame",
    "title": "雨の図書館",
    "author": "栞 編集部",
    "chapters": [
        ("第一章　水曜日の午後", """
その図書館は、駅から歩いて十五分ほどの坂の上にあった。坂の途中には古い洋菓子店と、いつ見てもシャッターの下りたままの時計屋があって、雨の日になるとそのシャッターは濡れた魚の腹のように鈍く光った。
僕がその図書館に通うようになったのは、大学を休学してから三か月ほど経った頃のことだ。休学したことに特別な理由があったわけではない。ある朝目を覚ますと、講義に出る理由がひとつ残らずどこかへ行ってしまっていた。まるで夜のうちに誰かが部屋に忍び込み、引き出しの中身をそっくり持ち去ったみたいに。
図書館の二階の窓際には、誰も座らない席がひとつあった。背もたれの布が少しだけ擦り切れていて、窓の外には大きな欅《けやき》の木が見えた。僕はいつもその席に座り、読むともなく本のページをめくった。本の内容はほとんど頭に入らなかった。それでも、紙をめくる音を聞いていると、自分がまだどこかにつながっているような気がした。
水曜日の午後には決まって雨が降った。少なくとも、僕の記憶の中ではそうなっている。
「その本、面白い？」
ある水曜日、隣の席から声がした。顔を上げると、紺色のカーディガンを着た女の子が、頬杖《ほおづえ》をついてこちらを見ていた。年は僕と同じくらいか、少し下に見えた。
「どうかな」と僕は言った。「まだ三ページしか読んでいないんだ。一時間かけて」
「一時間で三ページ」と彼女は言って、少し考えるような顔をした。「それはつまり、とても面白いか、まったく面白くないかのどちらかね」
「たぶん、そのどちらでもないんだと思う」
彼女は小さく笑った。笑うと、右の頬にだけ浅いえくぼができた。
「私はね、読み終わらない本が好きなの」と彼女は言った。「読み終わってしまうと、その本とはもう他人になってしまう気がするから」
窓の外では、雨が欅の葉を一枚一枚確かめるように叩いていた。
"""),
        ("第二章　読み終わらない本", """
彼女の名前は、三度目に会ったときにようやく知った。ミサキ、と彼女は名乗った。漢字は教えてくれなかった。
「名前なんて、音だけで十分よ」と彼女は言った。「漢字をつけると、急に意味を背負わされるでしょう。それが少し窮屈《きゅうくつ》なの」
ミサキはいつも同じ本を読んでいた。表紙の角が丸くなった、古い翻訳小説だった。作者の名前は擦れていて読み取れなかった。彼女はその本を三ページ読んでは閉じ、窓の外を眺め、また最初のページに戻った。
「どうして最初に戻るの？」と僕は尋ねた。
「最後まで行かないように」と彼女は答えた。「それに、同じ文章でも、読むたびに少しずつ違って見えるのよ。今日の雨と先週の雨が違うように」
僕にはその理屈がよくわからなかった。わからなかったけれど、わからないなりに、それは正しいことのように思えた。世の中には説明されればされるほど遠ざかっていくものがあって、彼女の言葉はたぶんその種類に属していた。
僕らは水曜日の午後になると、二階の窓際に並んで座った。言葉を交わすのはほんの数分で、残りの時間はそれぞれの本に向かっていた。いや、正確に言えば、本に向かっているふりをしていた。
ある日、彼女は鞄から一枚の栞《しおり》を取り出して、僕の本に挟んだ。薄い真鍮《しんちゅう》でできた栞で、表面には細い線で鳥の絵が彫られていた。
「あげる」と彼女は言った。「あなたはたぶん、どこまで読んだか忘れてしまう人だから」
「そうかもしれない」と僕は認めた。「でも、君は栞を使わないの？」
「私には必要ないの。私はいつも最初に戻るから」
その夜、アパートに帰ってから、僕は栞を電気スタンドの光にかざしてみた。鳥は翼を半分だけ広げていて、飛び立とうとしているのか、それとも降りてきたところなのか、どちらとも言えなかった。
"""),
        ("第三章　晴れた水曜日", """
六月の終わりに、珍しく晴れた水曜日があった。
空は洗いたてのシーツのように白く乾いていて、坂の上の図書館は、いつもより少しだけ小さく見えた。僕は二階へ上がり、いつもの席に向かった。
ミサキはいなかった。
隣の席には、彼女がいつも読んでいた古い翻訳小説が一冊、ぽつんと置かれていた。手に取ると、最後のページに小さな紙切れが挟まっていた。
『最後まで読んでみることにしました。思っていたより、悪くない結末でした』
それだけだった。署名も、日付もなかった。
僕は長いあいだ、その紙切れを眺めていた。窓の外では欅の葉が風に揺れていたが、雨の音はしなかった。雨の音がしない図書館は、まるで知らない場所のようだった。
それ以来、ミサキには一度も会っていない。水曜日の午後に図書館へ行っても、隣の席はいつも空いている。僕は相変わらず窓際に座り、相変わらず一時間に三ページのペースで本を読んでいる。ただ、ひとつだけ変わったことがある。
今の僕は、真鍮の栞を使っている。どこまで読んだかを忘れないように。そして、いつか最後のページにたどり着けるように。
秋になって、僕は大学に戻った。
"""),
    ],
}

BOOK2 = {
    "id": "urn:uuid:7c3f9b10-shiori-sample-kaidan",
    "title": "夜の階段",
    "author": "栞 編集部",
    "chapters": [
        ("第一話　十三段目", """
僕の住んでいたアパートには、階段が十二段しかなかった。それは確かなことだった。引っ越してきた日に、重い段ボール箱を抱えながら数えたのだから間違いない。
ところが、ある晩遅く、終電で帰ってきて階段を上っていると、十三段目に足が触れた。
[[image]]
僕はその場に立ち止まり、暗がりの中で足元を見下ろした。蛍光灯は例によって切れかけていて、ジジ、と虫の羽音のような音を立てていた。十三段目は、ほかの段と何ひとつ変わらないように見えた。同じ灰色のコンクリートで、同じように角が少し欠けていた。
気のせいだろう、と僕は思った。疲れているのだ。残業続きで、数を数える能力が一時的に失われているに違いない。
翌朝、明るい光の下で数え直してみると、階段はやはり十二段だった。
それ以来、僕は夜遅く帰るたびに段を数えるようになった。十二段の夜もあれば、十三段の夜もあった。規則性は見つからなかった。月の満ち欠けとも、曜日とも、その日の気分とも関係がなさそうだった。
ただ、十三段目がある夜には、決まって遠くで誰かがピアノを弾いていた。曲名は思い出せないが、どこかで一度聴いたことのある、短い旋律《せんりつ》の繰り返しだった。
"""),
        ("第二話　ピアノの部屋", """
「十三段目？」と管理人の老人は言って、眼鏡の奥で目を細めた。「さあねえ。このアパートに住んで四十年になるが、そんな話は聞いたことがないな」
老人は、そう言いながらも、どこか懐かしそうな顔をした。僕はそれを見逃さなかった。
「ピアノの音は？　夜中に誰かが弾いているのを聞いたことはありませんか」
老人はしばらく黙っていた。それから、ゆっくりと首を振った。
「このアパートにピアノはないよ。昔はあったがね。二階の角部屋に、音大を目指していた娘さんが住んでいた。もう三十年以上も前の話だ」
「その人は、今は？」
「さあ」と老人は言った。「ある日、書き置きひとつ残さずにいなくなった。家賃はきちんと前払いしてあったから、誰も困りはしなかったがね」
その夜、僕は終電を待たずに帰った。階段の前に立つと、十三段目があった。そして、二階の角部屋から、あの旋律が聞こえていた。
僕は十三段目に足をかけた。コンクリートは、思っていたよりもずっと温かかった。
"""),
    ],
}


def ruby(text):
    return re.sub(r"([一-龥々]+)《(.+?)》", r"<ruby>\1<rt>\2</rt></ruby>", text)


def paragraphs(body, image_tag=""):
    out = []
    for line in body.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "[[image]]":
            out.append(image_tag)
        elif line.startswith("「") or line.startswith("『"):
            out.append(f"<p>{ruby(line)}</p>")
        else:
            out.append(f"<p>　{ruby(line)}</p>")
    return "\n".join(out)


def xhtml(title, body, css_href, lang="ja", html_class="vrtl"):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" class="{html_class}">
<head>
<meta charset="UTF-8"/>
<title>{title}</title>
<link rel="stylesheet" type="text/css" href="{css_href}"/>
</head>
<body class="p-text">
{body}
</body>
</html>
"""


def make_cover(path, title, color_bg, color_fg):
    w, h = 600, 900
    img = Image.new("RGB", (w, h), color_bg)
    d = ImageDraw.Draw(img)
    d.rectangle([28, 28, w - 28, h - 28], outline=color_fg, width=2)
    font = ImageFont.truetype(MINCHO, 76)
    small = ImageFont.truetype(MINCHO, 30)
    x = w // 2 + 60
    y = 150
    for ch in title:
        bbox = d.textbbox((0, 0), ch, font=font)
        d.text((x - (bbox[2] - bbox[0]) // 2, y), ch, font=font, fill=color_fg)
        y += 96
    y = 520
    for ch in "栞編集部":
        bbox = d.textbbox((0, 0), ch, font=small)
        d.text((w // 2 - 120 - (bbox[2] - bbox[0]) // 2, y), ch, font=small, fill=color_fg)
        y += 40
    img.save(path, "JPEG", quality=88)


def make_stairs(path):
    w, h = 800, 520
    img = Image.new("RGB", (w, h), (246, 243, 236))
    d = ImageDraw.Draw(img)
    for i in range(13):
        x0 = 80 + i * 50
        y0 = h - 60 - i * 32
        d.line([(x0, y0), (x0 + 50, y0)], fill=(60, 60, 60), width=3)
        d.line([(x0 + 50, y0), (x0 + 50, y0 - 32)], fill=(60, 60, 60), width=3)
    d.ellipse([w - 150, 40, w - 80, 110], outline=(60, 60, 60), width=3)
    img.save(path, "PNG")


def write_zip(path, files):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in files:
            z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)


CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="item/standard.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
"""

VERTICAL_CSS = """@charset "UTF-8";
html { -epub-writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; writing-mode: vertical-rl; }
body { margin: 0; padding: 0; font-family: serif-ja, serif; line-height: 1.75; text-align: justify; }
p { margin: 0; }
h2 { font-size: 1.3em; margin: 0 0 2em 0; font-weight: bold; }
ruby > rt { font-size: 0.5em; }
.tcy { -epub-text-combine: horizontal; text-combine-upright: all; }
.p-cover { margin: 0; padding: 0; text-align: center; }
.titlepage h1 { font-size: 2em; margin-top: 3em; }
.titlepage .author { margin-top: 2em; }
"""

HORIZONTAL_CSS = """@charset "UTF-8";
body { margin: 1em; font-family: serif; line-height: 1.8; color: #000000; }
h2 { font-size: 1.2em; border-bottom: 1px solid #999999; padding-bottom: 0.3em; }
p { margin: 0; text-indent: 0; }
div.illust { text-align: center; margin: 1em 0; }
div.illust img { width: 90%; }
"""


def build_book1(dst):
    b = BOOK1
    tmp = os.path.join(OUT_DIR, "_cover1.jpg")
    make_cover(tmp, b["title"], (234, 229, 216), (44, 52, 64))
    cover = open(tmp, "rb").read()
    os.remove(tmp)

    files = [("META-INF/container.xml", CONTAINER), ("item/style/book-style.css", VERTICAL_CSS),
             ("item/image/cover.jpg", cover)]

    cover_page = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
<head><meta charset="UTF-8"/><title>{b['title']}</title>
<meta name="viewport" content="width=600, height=900"/></head>
<body epub:type="cover" class="p-cover">
<div class="main">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 600 900">
<image width="600" height="900" xlink:href="../image/cover.jpg"/>
</svg>
</div>
</body>
</html>
"""
    files.append(("item/xhtml/p-cover.xhtml", cover_page))
    title_body = f'<div class="titlepage"><h1>{b["title"]}</h1><p class="author">{b["author"]}</p></div>'
    files.append(("item/xhtml/p-titlepage.xhtml", xhtml(b["title"], title_body, "../style/book-style.css")))

    spine, manifest, nav_items, ncx_points = [], [], [], []
    for i, (heading, body) in enumerate(b["chapters"], 1):
        name = f"p-{i:03d}.xhtml"
        content = f'<h2 id="toc-{i:03d}">{heading}</h2>\n' + paragraphs(body)
        files.append((f"item/xhtml/{name}", xhtml(heading, content, "../style/book-style.css")))
        manifest.append(f'<item media-type="application/xhtml+xml" id="p-{i:03d}" href="xhtml/{name}"/>')
        spine.append(f'<itemref linear="yes" idref="p-{i:03d}" properties="page-spread-left"/>')
        nav_items.append(f'<li><a href="xhtml/{name}#toc-{i:03d}">{heading}</a></li>')
        ncx_points.append(f'<navPoint id="np{i}" playOrder="{i}"><navLabel><text>{heading}</text></navLabel>'
                          f'<content src="xhtml/{name}#toc-{i:03d}"/></navPoint>')

    nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
<head><meta charset="UTF-8"/><title>目次</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>目次</h1>
<ol>
<li><a href="xhtml/p-titlepage.xhtml">扉</a></li>
{''.join(nav_items)}
</ol>
</nav>
<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="xhtml/p-001.xhtml">本文</a></li></ol></nav>
</body>
</html>
"""
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="{b['id']}"/></head>
<docTitle><text>{b['title']}</text></docTitle>
<navMap>{''.join(ncx_points)}</navMap>
</ncx>
"""
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" xml:lang="ja" unique-identifier="unique-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title id="title">{b['title']}</dc:title>
<meta refines="#title" property="file-as">アメノトショカン</meta>
<dc:creator id="creator01">{b['author']}</dc:creator>
<dc:language>ja</dc:language>
<dc:identifier id="unique-id">{b['id']}</dc:identifier>
<meta property="dcterms:modified">2026-09-19T00:00:00Z</meta>
<meta property="rendition:layout">reflowable</meta>
</metadata>
<manifest>
<item media-type="application/xhtml+xml" id="toc" href="navigation-documents.xhtml" properties="nav"/>
<item media-type="application/x-dtbncx+xml" id="ncx" href="toc.ncx"/>
<item media-type="text/css" id="book-style" href="style/book-style.css"/>
<item media-type="image/jpeg" id="cover" href="image/cover.jpg" properties="cover-image"/>
<item media-type="application/xhtml+xml" id="p-cover" href="xhtml/p-cover.xhtml" properties="svg"/>
<item media-type="application/xhtml+xml" id="p-titlepage" href="xhtml/p-titlepage.xhtml"/>
{''.join(manifest)}
</manifest>
<spine page-progression-direction="rtl" toc="ncx">
<itemref linear="yes" idref="p-cover" properties="rendition:page-spread-center"/>
<itemref linear="yes" idref="p-titlepage"/>
{''.join(spine)}
</spine>
</package>
"""
    files += [("item/navigation-documents.xhtml", nav), ("item/toc.ncx", ncx), ("item/standard.opf", opf)]
    write_zip(dst, files)


def build_book2(dst):
    b = BOOK2
    tmp = os.path.join(OUT_DIR, "_stairs.png")
    make_stairs(tmp)
    stairs = open(tmp, "rb").read()
    os.remove(tmp)
    container = CONTAINER.replace("item/standard.opf", "OEBPS/content.opf")
    files = [("META-INF/container.xml", container), ("OEBPS/css/main.css", HORIZONTAL_CSS),
             ("OEBPS/images/stairs.png", stairs)]
    manifest, spine, ncx_points = [], [], []
    image_tag = '<div class="illust"><img src="../images/stairs.png" alt="階段"/></div>'
    for i, (heading, body) in enumerate(b["chapters"], 1):
        name = f"chapter{i}.xhtml"
        content = f"<h2>{heading}</h2>\n" + paragraphs(body, image_tag)
        files.append((f"OEBPS/text/{name}", xhtml(heading, content, "../css/main.css", html_class="")))
        manifest.append(f'<item id="ch{i}" href="text/{name}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="ch{i}"/>')
        ncx_points.append(f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{heading}</text></navLabel>'
                          f'<content src="text/{name}"/></navPoint>')
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="{b['id']}"/></head>
<docTitle><text>{b['title']}</text></docTitle>
<navMap>{''.join(ncx_points)}</navMap>
</ncx>
"""
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>{b['title']}</dc:title>
<dc:creator opf:role="aut">{b['author']}</dc:creator>
<dc:language>ja</dc:language>
<dc:identifier id="BookId">{b['id']}</dc:identifier>
</metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="css/main.css" media-type="text/css"/>
<item id="img1" href="images/stairs.png" media-type="image/png"/>
{''.join(manifest)}
</manifest>
<spine toc="ncx">{''.join(spine)}</spine>
</package>
"""
    files += [("OEBPS/toc.ncx", ncx), ("OEBPS/content.opf", opf)]
    write_zip(dst, files)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(SAMPLE_DIR, exist_ok=True)
    build_book1(os.path.join(OUT_DIR, "ame-no-toshokan.epub"))
    build_book2(os.path.join(OUT_DIR, "yoru-no-kaidan.epub"))
    # The first book also ships inside the app as a try-it-now sample.
    with open(os.path.join(OUT_DIR, "ame-no-toshokan.epub"), "rb") as f:
        open(os.path.join(SAMPLE_DIR, "ame-no-toshokan.epub"), "wb").write(f.read())
    for name in sorted(os.listdir(OUT_DIR)):
        print(name, os.path.getsize(os.path.join(OUT_DIR, name)), "bytes")
