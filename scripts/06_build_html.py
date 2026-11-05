"""Шаг 6. Сборка страницы: шаблон + данные -> index.html (полный документ)
и site/artifact.html (тело страницы без каркаса документа — для публикации как артефакт)."""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[1]
tpl = (ROOT/'site/index.template.html').read_text(encoding='utf-8')
data = (ROOT/'site/data.js').read_text(encoding='utf-8')
js = (ROOT/'site/app.js').read_text(encoding='utf-8')
html = tpl.replace('/*__DATA__*/', data).replace('/*__JS__*/', js)
(ROOT/'index.html').write_text(html, encoding='utf-8')
# версия для артефакта: без doctype/html/head/body
body = re.sub(r'^<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', html, flags=re.I)
body = re.sub(r'<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', '', body)
body = body.replace('</head>\n<body>', '').replace('</body>\n</html>', '')
(ROOT/'site/artifact.html').write_text(body.strip() + '\n', encoding='utf-8')
print('index.html', len(html.encode())//1024, 'KB; artifact.html', len(body.encode())//1024, 'KB')
